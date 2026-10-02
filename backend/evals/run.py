"""Runs the eval cases against the real agent and the demo catalog, in-process (docs/07-evaluation.md).

`uv run python -m evals.run [--cases PATH] [CASE_ID ...]` calls the provider named by LLM_PROVIDER and costs money.
"""

import argparse
import asyncio
import hashlib
import json
import math
import subprocess
import sys
import time
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

from app.agent.loop import run_turn
from app.agent.prompt import SYSTEM_PROMPT
from app.agent.session import SessionStore
from app.agent.tools import TOOL_SPECS
from app.config import BACKEND_DIR, Settings
from app.llm.base import LLMProvider, ToolResult, Usage
from app.llm.registry import build_provider
from app.search.engine import Filters, matching_ids
from app.search.index import SearchIndex, load_index
from evals.checks import TurnResult, expect_failures, grounding_violations, tool_facts, user_amounts

EVALS_DIR = Path(__file__).resolve().parent
RESULTS_DIR = EVALS_DIR / "results"
TARGETS = {"pass_rate": 0.9, "grounding_violations": 0, "latency_p50_s": 8.0, "latency_p95_s": 15.0}


class Expect(BaseModel):
    model_config = ConfigDict(extra="forbid")

    shown: dict | None = None
    min_shown: int | None = None
    clarifies: bool = False
    declines: bool = False
    mentions: list[str] = []
    reply_language: Literal["english", "hinglish"] | None = None


class Case(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    description: str
    turns: list[str] = Field(min_length=1)
    expect: Expect = Expect()


class Recorder:
    """Wraps the provider to see each turn's tool calls and tool results, through the neutral types only."""

    def __init__(self, provider: LLMProvider):
        self.provider, self.name, self.model, self.min_cache_tokens = provider, provider.name, provider.model, provider.min_cache_tokens
        self.tools: list[str] = []  # both lists only grow; a turn's share is the slice it added
        self.results: list[ToolResult] = []

    async def complete(self, system, history, tools):
        response = await self.provider.complete(system, history, tools)
        self.tools += [call.name for call in response.tool_calls]
        return response

    def user_message(self, text):
        return self.provider.user_message(text)

    def tool_results_message(self, results):
        self.results += results
        return self.provider.tool_results_message(results)


def prompt_snapshot() -> dict:
    """Everything the model sees besides the conversation: the system prompt and every tool."""
    return {"system_prompt": SYSTEM_PROMPT, "tools": [asdict(tool) for tool in TOOL_SPECS]}


def prompt_version(snapshot: dict) -> str:
    """A short hash of a snapshot, so any change to the prompt or a tool gives a new version."""
    return hashlib.sha256(json.dumps(snapshot, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]


def git_state(cwd: Path = BACKEND_DIR) -> tuple[str | None, bool | None]:
    """The commit a run used, and whether the backend had uncommitted changes (eval results aside). None outside git."""
    def git(*args: str) -> str:
        return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()

    try:
        return git("rev-parse", "--short", "HEAD"), bool(git("status", "--porcelain", "--", ".", ":(exclude)evals/results"))
    except (OSError, subprocess.CalledProcessError):
        return None, None


def cache_misses(calls: list[Usage], min_cache_tokens: int | None) -> int:
    """Calls after a conversation's first that read nothing from the cache although their input was large enough to cache.

    A provider without a minimum caches on a best-effort basis, so its calls aren't checked.
    """
    if min_cache_tokens is None:
        return 0
    return sum(
        1 for usage in calls[1:]
        if usage.input_tokens + usage.cache_read_tokens >= min_cache_tokens and usage.cache_read_tokens == 0
    )


def load_cases(path: Path, ids: list[str]) -> list[Case]:
    cases = [Case.model_validate(item) for item in yaml.safe_load(path.read_text(encoding="utf-8"))]
    unknown = set(ids) - {case.id for case in cases}
    if unknown:
        raise SystemExit(f"Unknown case IDs: {sorted(unknown)}")
    return [case for case in cases if not ids or case.id in ids]


async def run_case(provider: LLMProvider, index: SearchIndex, catalog: list[tuple[str, str]], case: Case, settings: Settings) -> dict:
    """Runs a case's turns in one session, then grades the final turn. Grounding is checked on every turn."""
    recorder = Recorder(provider)
    store = SessionStore(settings.session_ttl_minutes, settings.max_turns_per_session)
    session = store.create(provider.name)
    user_numbers: set[float] = set()
    turns, calls, error, last = [], [], None, TurnResult()
    for text in case.turns:
        events, first_tool = [], len(recorder.tools)
        user_numbers |= user_amounts(text)
        started = time.perf_counter()
        try:
            record = await run_turn(recorder, index, store.begin_turn(session.id), text, lambda e, d: events.append((e, d)))
        except Exception as e:  # noqa: BLE001 - a failed turn fails the case, and the run goes on
            error = f"{type(e).__name__}: {e}"
            break
        shown = [d for e, d in events if e == "products"]
        last = TurnResult(
            reply="\n".join(d["text"] for e, d in events if e == "text"),
            tools=recorder.tools[first_tool:],
            shown=[card["id"] for card in shown[-1]["products"]] if shown else None,
        )
        tool_ids, tool_prices = tool_facts([r.content for r in recorder.results])  # the whole conversation so far
        calls += [usage for _, usage in record.calls]
        turns.append({
            "user": text,
            **vars(last),
            "latency_s": round(time.perf_counter() - started, 2),
            "model_calls": len(record.calls),
            "input_tokens": sum(u.input_tokens for _, u in record.calls),
            "output_tokens": sum(u.output_tokens for _, u in record.calls),
            "cache_read_tokens": sum(u.cache_read_tokens for _, u in record.calls),
            "grounding": grounding_violations(last.reply, catalog, tool_ids, tool_prices, user_numbers),
        })

    def matching(conditions: dict, ids: list[str]) -> set[str]:
        return matching_ids(index, Filters(**conditions), ids)

    expect = case.expect.model_dump(exclude_unset=True)
    failures = [error] if error else expect_failures(expect, last, matching)
    return {
        "id": case.id,
        "description": case.description,
        "scored": bool(expect),
        "passed": not failures and not any(t["grounding"] for t in turns),
        "failures": failures,
        "cache_misses": cache_misses(calls, provider.min_cache_tokens),
        "turns": turns,
    }


def percentile(values: list[float], p: float) -> float:
    """Nearest-rank percentile."""
    ordered = sorted(values)
    return ordered[max(0, math.ceil(p / 100 * len(ordered)) - 1)] if ordered else 0.0


def summarize(results: list[dict]) -> dict:
    scored = [r for r in results if r["scored"]]
    turns = [t for r in results for t in r["turns"]]
    latencies = [t["latency_s"] for t in turns]

    def mean(key: str) -> float:
        return round(sum(t[key] for t in turns) / len(turns)) if turns else 0

    summary = {
        "cases": len(results),
        "scored": len(scored),
        "passed": sum(r["passed"] for r in scored),
        "pass_rate": round(sum(r["passed"] for r in scored) / len(scored), 3) if scored else 0.0,
        "grounding_violations": sum(len(t["grounding"]) for t in turns),
        "latency_p50_s": percentile(latencies, 50),
        "latency_p95_s": percentile(latencies, 95),
        "mean_input_tokens": mean("input_tokens"),
        "mean_output_tokens": mean("output_tokens"),
        "mean_cache_read_tokens": mean("cache_read_tokens"),
        "cache_misses": sum(r["cache_misses"] for r in results),
    }
    summary["targets_met"] = (
        summary["pass_rate"] >= TARGETS["pass_rate"]
        and summary["grounding_violations"] <= TARGETS["grounding_violations"]
        and summary["latency_p50_s"] < TARGETS["latency_p50_s"]
        and summary["latency_p95_s"] < TARGETS["latency_p95_s"]
        and not summary["cache_misses"]
    )
    return summary


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the eval cases against the configured LLM provider.")
    parser.add_argument("ids", nargs="*", help="case IDs to run (default: all)")
    parser.add_argument("--cases", type=Path, default=EVALS_DIR / "cases.yaml")
    args = parser.parse_args(argv)

    settings = Settings()
    cases = load_cases(args.cases, args.ids)
    snapshot = prompt_snapshot()
    version = prompt_version(snapshot)
    commit, dirty = git_state()
    provider, index = build_provider(settings), load_index(settings.data_dir)
    catalog = [(row["id"], row["title"]) for row in index.conn.execute("SELECT id, title FROM products")]

    results = []
    for case in cases:
        result = await run_case(provider, index, catalog, case, settings)
        results.append(result)
        grounding = [v for t in result["turns"] for v in t["grounding"]]
        print(f"{'PASS' if result['passed'] else 'FAIL'} {case.id}", *(f"  - {f}" for f in result["failures"] + grounding), sep="\n")

    summary = summarize(results)
    (RESULTS_DIR / "prompts").mkdir(parents=True, exist_ok=True)
    snapshot_file = RESULTS_DIR / "prompts" / f"{version}.json"
    if not snapshot_file.exists():  # once per prompt version, so any two versions can be diffed
        snapshot_file.write_text(json.dumps({"prompt_version": version, **snapshot}, indent=2, ensure_ascii=False) + "\n")
    out = RESULTS_DIR / f"{datetime.now():%Y%m%d-%H%M%S}-{provider.name}-{version}.json"
    header = {"provider": provider.name, "model": provider.model, "prompt_version": version, "git_commit": commit, "git_dirty": dirty}
    out.write_text(json.dumps({**header, "summary": summary, "cases": results}, indent=2, ensure_ascii=False) + "\n")
    note = " with uncommitted changes" if dirty else ""
    print(json.dumps(summary, indent=2), f"Prompt version: {version} (commit {commit}{note})", f"Results: {out}", sep="\n")
    return 0 if summary["targets_met"] else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
