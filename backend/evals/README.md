# Evals

The eval suite runs scripted conversations against the real agent and the demo catalog and grades the replies. The full specification is [`docs/07-evaluation.md`](../../docs/07-evaluation.md).

## Two case sets

| Set | File | Used for | What its score means |
|---|---|---|---|
| **Dev** | [`sets/dev.yaml`](sets/dev.yaml) | Finding failures and tuning the prompt and tools | How well the tuning fixed the cases it was tuned on. Expect it to be high. |
| **Holdout** | [`sets/holdout.yaml`](sets/holdout.yaml) | Reporting a finished prompt version, nothing else | How the agent handles requests it was never tuned on. This is the headline number. |

Rules, in short (`docs/07-evaluation.md`, Dev and holdout sets, is authoritative):

- Tune only on dev. The holdout set always runs in full; single cases can be run only from dev.
- Run holdout only on a finished prompt version, as a plan recorded in the run log below sets out, and report the result as it comes out.
- If a holdout failure ever leads to a prompt or tool change, that case moves to dev and a new one replaces it.
- No example in the prompt or tool definitions may repeat an eval case's words. `tests/test_evals.py` enforces this.

## Holdout coverage

The holdout cases are 40 of the pool of 60 described in step 1 of the plan below; the other 20 joined the dev set, so both sets come from the same distribution. Every expected result was checked against the demo catalog, and every case was checked to be passable by an agent that follows `docs/04-agent.md` exactly.

| Category | Search | Refinement | Product question | Relaxation | Total |
|---|---|---|---|---|---|
| jackets | 2 | 1 | 1 | 1 | 5 |
| shoes | 2 | – | 1 | 1 | 4 |
| phones | 2 | – | 2 | 1 | 5 |
| laptops | 2 | 2 | 1 | – | 5 |
| backpacks | 2 | 1 | – | – | 3 |
| watches | 1 | 2 | – | – | 3 |
| kurtas | 2 | 1 | 1 | – | 4 |
| kitchen appliances | 1 | 1 | – | 1 | 3 |

Plus 8 cases with no category: 4 clarifying questions and 4 declines, 2 of them adversarial. In all: 12 Hinglish and 28 English, 14 multi-turn and 26 single-turn.

## Judge calibration

The LLM judge (`judge.py`, rubric in `docs/07-evaluation.md`) was trusted only after it was checked against human labels. One person labeled the 60 rows of `labels/labeling-sheet.xlsx` (dev turns from the three providers, 15 of them deliberately broken copies), split at random into 40 calibration rows for refining the judge and 20 held-out rows for measuring it once. Agreement below counts verdicts (rows × 7 criteria) on which the judge and the labels match; "problem found" counts pass and n/a as the same answer.

**The labeler's own consistency.** After a break, 12 of the rows were labeled again on `labels/recheck-sheet.xlsx` without looking at the first labels. The two sittings agreed on 74 of 84 verdicts (88%), 79 of 84 (94%) on whether a problem was found. Faithfulness was the least consistent criterion (58%), mostly pass against n/a on general claims, which led to rubric decision D9.

**Judge versions on the 40 calibration rows:**

| Version | What changed | vs original labels | vs corrected labels | Broken rows caught |
|---|---|---|---|---|
| `61eb1d594d77` | First version: one nested object per criterion | 12 of 40 rows failed: Sonnet split or flattened the nested call | – | – |
| `1921db74f198` | Two flat fields per criterion | 247/280 (88%), problem found 92% | 255/280 (91%) | 9 of 10 |
| `afc7fd28587f` (final) | Calibration round 1: reason before verdict, the store's brands, earlier turns' product details, a language step, decision D9 | 255/280 (91%), problem found 94% | 265/280 (95%), problem found 98% | 10 of 10 |

After round 1, the labeler corrected 10 calibration labels that contradicted the rubric's own rules, all listed with reasons in `labels/corrections.md`. The calibration figures are optimistic by design, since the judge was refined on these rows and some labels were corrected after seeing its verdicts.

**Held-out result** (final version, 20 rows judged once, labels never corrected): **124 of 140 verdicts (89%), 129 of 140 (92%) on whether a problem was found**, and 4 of 5 broken rows caught. By criterion: decline quality 100%, relevance 95%, relaxation honesty 95%, clarification quality 90%, language and style 90%, helpfulness 80%, faithfulness 70%. The judge agrees with the labels about as often as the labeler agreed with themself (88%), the practical ceiling for a single labeler. The judged files are in `labels/judged/`, and judging for calibration cost about $1.50 in all.

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

1. Write 20 new dev cases (40 in total) and 40 holdout cases, all before any holdout run. So that both come from the same distribution, one author that never saw the prompt writes a pool of 60 cases from the specs, the catalog and real phrasings, with 21 searches, 12 refinements, 9 product questions, 6 clarifications, 6 declines and 6 relaxations. A second agent that never saw the prompt checks every case can be passed by an agent that follows `docs/04-agent.md` exactly, and failing cases are fixed or replaced. The pool is then split at random within each behavior: for each behavior, its case IDs are sorted and shuffled with a new `random.Random(20261013)`, and the first third go to the dev set and the rest to the holdout set.
2. **v1:** run the holdout set once on each provider (Anthropic, OpenAI, Gemini) with the current prompt version, `a8130bf25dd1`.
3. **Blinding:** after v1, only each provider's summary (pass rate, grounding violations, latency, cost) is looked at. Which cases failed, their replies, their results files and their traces stay unread until v2 is done.
4. **Tuning:** on the 40 dev cases only, one change per commit, with the dev set rerun on all three providers after each change. Tuning stops when every dev target is met on all three providers, or after at most 5 tuning commits, whichever comes first. The holdout set doesn't run during tuning.
5. **v2:** run the same holdout set once on each provider with the final prompt version.
6. Report v1 and v2 for every provider, whatever they show. With 40 cases one case is 2.5 points, and an identical prompt has moved by a case between runs, so a difference of 1 or 2 cases on a provider is within run-to-run noise and is reported as such. The final prompt version is the one reported as current, even if v1 scores higher.

| Date | Prompt version | Provider | Passed | Notes |
|---|---|---|---|---|
| 2026-10-13 | `a8130bf25dd1` (v1) | Anthropic (`claude-opus-5-5`) | 40/40 | 0 grounding violations, p50 5.8 s, p95 9.9 s, $0.86. |
| 2026-10-13 | `a8130bf25dd1` (v1) | OpenAI (`gpt-6-astra`) | 40/40 | 0 grounding violations, p50 7.0 s, p95 16.1 s (over the 15 s target), $1.22. |
| 2026-10-13 | `a8130bf25dd1` (v1) | Gemini (`gemini-3.8-flash`) | 40/40 | 0 grounding violations, p50 5.7 s, p95 16.1 s (over the 15 s target), $0.29. The three runs ran at the same time. |
| 2026-10-14 | `a8130bf25dd1` (judged-runs plan) | Anthropic (`claude-opus-5-5`) | 40/40 | 0 grounding violations, p50 5.7 s, p95 9.8 s, $0.86. Stores tool calls; judged below. |
| 2026-10-14 | `a8130bf25dd1` (judged-runs plan) | OpenAI (`gpt-6-astra`) | 40/40 | 0 grounding violations, p50 7.6 s, p95 11.9 s, $1.24. Stores tool calls; judged below. |
| 2026-10-14 | `a8130bf25dd1` (judged-runs plan) | Gemini (`gemini-3.8-flash`) | 40/40 | 0 grounding violations, p50 5.7 s, p95 20.7 s (over the 15 s target), $0.30. Stores tool calls; judged below. Run alone, after the other two. |

**Closed 2026-10-13, following the plan's stop rule.** After v1, the dev set ran once on each provider with the same prompt version, one provider at a time: Anthropic, OpenAI and Gemini each passed 40/40 with 0 grounding violations and met every dev target (p95 10.2 s, 14.5 s and 9.8 s). Tuning therefore stopped at zero commits, so the final prompt version is still `a8130bf25dd1`. v2 would have rerun that same version on the same cases, so it wasn't run, and v1 is the final holdout result. Run alone, Gemini's p95 was well under v1's 16.1 s, which suggests running the three providers at once inflated v1's latency; OpenAI stays close to the 15 s limit either way. Step 3's blinding stays in force: the holdout's per-case results remain unread, so the set stays usable for a later plan.

Next: with every rule-based check passing on both sets, the next step is an LLM judge for reply quality, calibrated against human labels on dev replies (`docs/08-roadmap.md`, Phase 19). Any judged holdout run gets its own plan here first.

**Plan for judged runs, recorded 2026-10-14, before any judged holdout result:**

1. **The judge is frozen** at version `afc7fd28587f`: Claude Sonnet 5.5 at medium effort, with the rubric's decisions D1 to D9 and the store's brands. Its agreement with human labels on the 20 held-out labeling rows was 89% of verdicts (92% on whether a problem was found), weakest on faithfulness (70%). Neither the judge, the rubric nor the agent's prompt (`a8130bf25dd1`) changes during this plan.
2. **Dev:** judge each of the three dev runs that store tool calls (20261013-232851 Anthropic, -233719 OpenAI, -234130 Gemini) once.
3. **Holdout:** run the holdout set once on each provider with the same prompt version, one provider at a time, so the runs store tool calls; log each run's rule-check result in the table above, as the set's second look. Then judge each of those runs once, with `--holdout`.
4. **Blinding:** for the holdout runs and their judgments, only the summaries are looked at: pass rates by criterion and provider, the share of turns passing every criterion, errors and cost. Per-case results, replies, verdicts and traces stay unread, so the set stays usable for a later plan.
5. **No tuning:** this plan only reports. If its results call for changes to the agent, they need a new plan here first. That plan keeps this holdout set rather than writing a new one: its judged results here are the baseline, its v2 is measured on the same 40 cases with the same judge version, and the blinding in step 4 continues for every holdout run and judgment, so only summaries of the set are ever seen.
6. **Reporting:** each provider's judged results on both sets are reported whatever they show, next to the judge's held-out agreement, so every pass rate is read with the judge's own error rate in mind.

**Results of the judged-runs plan, 2026-10-14** (judge `afc7fd28587f`; the share of turns where a criterion applied that passed it; holdout from summaries only):

| Criterion | Anthropic dev | Anthropic holdout | OpenAI dev | OpenAI holdout | Gemini dev | Gemini holdout |
|---|---|---|---|---|---|---|
| Relevance | 98% | 97% | 100% | 97% | 100% | 100% |
| Helpfulness | 98% | 100% | 87% | 91% | 48% | 61% |
| Faithfulness | 91% | 92% | 98% | 100% | 74% | 87% |
| Relaxation honesty | 75% (of 4) | 100% (of 4) | 100% | 100% | 100% | 100% |
| Clarification quality | 100% | 75% (of 4) | 100% | 100% | 75% (of 4) | 100% |
| Decline quality | 100% | 100% | 100% | 100% | 100% | 100% |
| Language and style | 79% | 72% | 94% | 100% | 98% | 94% |
| **Turns passing every criterion** | **74%** | **67%** | **85%** | **91%** | **40%** | **54%** |

Every rule check passed on both sets (40/40 for each provider), so the judge measures what they can't. On both sets OpenAI's replies pass most often and Gemini's least; Gemini's misses are mostly helpfulness (replies that restate the cards) and Anthropic's mostly language and style (replies over 2 sentences, and replies narrating the agent's own process). Read every figure with the judge's held-out agreement in mind (89% of verdicts, faithfulness 70%): differences of a few points are within its error, and criteria applying to 4 or 5 turns rest on one or two turns. Judging cost $1.48 on dev and $1.53 on holdout. The plan is complete; any change to the agent needs a new plan, which measures v2 on this holdout set with the same judge.

