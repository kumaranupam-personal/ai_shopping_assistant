# Evals

The eval suite runs scripted conversations against the real agent and the demo catalog and grades the replies. The full specification is [`docs/07-evaluation.md`](../../docs/07-evaluation.md).

## Two case sets

| Set | File | Used for | What its score means |
|---|---|---|---|
| **Dev** | [`sets/dev.yaml`](sets/dev.yaml) | Finding failures and tuning the prompt and tools | How well the tuning fixed the cases it was tuned on. Expect it to be high. |
| **Holdout** | [`sets/holdout.yaml`](sets/holdout.yaml) | Reporting a finished prompt version, nothing else | How the agent handles requests it was never tuned on. This is the headline number. |

Rules, in short (`docs/07-evaluation.md`, Dev and holdout sets, is authoritative):

- Tune only on dev. The holdout set always runs in full; single cases can be run only from dev.
- Run holdout only on a finished prompt version, once per provider, and report the result as it comes out.
- If a holdout failure ever leads to a prompt or tool change, that case moves to dev and a new one replaces it.
- No example in the prompt or tool definitions may repeat an eval case's words. `tests/test_evals.py` enforces this.

## Running

From `backend/`, with the provider's API key set (each run makes paid API calls):

```bash
LLM_PROVIDER=gemini uv run python -m evals.run                  # dev set
LLM_PROVIDER=gemini uv run python -m evals.run --set holdout    # holdout set
LLM_PROVIDER=gemini uv run python -m evals.run refine-brand     # one dev case, for debugging
```

## Layout

- `sets/`: the two case files.
- `results/dev/`, `results/holdout/`: one JSON file per run, named `<timestamp>-<set>-<provider>-<prompt_version>.json`. Each records its set, a hash of the case file, the prompt version and the git commit. Dev runs from before the split have no set in their name. `results/dev/baseline-<provider>.json` is each provider's first run, before any tuning.
- `prompts/`: the exact system prompt and tools for each prompt version, so any two versions can be diffed.

## Holdout run log

Every holdout run is listed here, so the number of times the set has been looked at stays visible.

**Plan, recorded 2026-10-13, before the holdout cases were written or any holdout run:**

1. Write 20 new dev cases (40 in total) and 40 holdout cases, all before any holdout run. Holdout cases are written from the specs, the catalog and real phrasings, without reading the prompt.
2. **v1:** run the holdout set once on each provider (Anthropic, OpenAI, Gemini) with the current prompt version, `a8130bf25dd1`.
3. **Blinding:** after v1, only each provider's summary (pass rate, grounding violations, latency, cost) is looked at. Which cases failed, their replies, their results files and their traces stay unread until v2 is done.
4. **Tuning:** on the 40 dev cases only, one change per commit, with the dev set rerun on all three providers after each change. Tuning stops when every dev target is met on all three providers, or after at most 5 tuning commits, whichever comes first. The holdout set doesn't run during tuning.
5. **v2:** run the same holdout set once on each provider with the final prompt version.
6. Report v1 and v2 for every provider, whatever they show. With 40 cases one case is 2.5 points, and an identical prompt has moved by a case between runs, so a difference of 1 or 2 cases on a provider is within run-to-run noise and is reported as such. The final prompt version is the one reported as current, even if v1 scores higher.

| Date | Prompt version | Provider | Passed | Notes |
|---|---|---|---|---|
| | | | | No runs yet. |
