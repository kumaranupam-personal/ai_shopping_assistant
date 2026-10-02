# Evaluation

## Automated tests

`backend/tests/` holds the backend tests, which run with `pytest`. `frontend/tests/` holds the browser tests, which run with `npm test`. Neither set calls an LLM provider.

- Configuration and taxonomy: defaults apply when nothing is set, shell variables override `.env`, and relative paths resolve against `backend/`. Every category's card attributes are among its attributes, and the display rules format every unit suffix and value type correctly.
- Ingestion: valid products load, each broken field rule from `02-catalog.md` rejects the line with a reason, duplicate IDs are rejected, the exit code follows `--allow-rejects`, and a failed run leaves any existing `catalog.db` untouched.
- Demo data: generating twice gives identical files, the output passes ingestion with zero rejects, each category has the right count, and the plausibility rules in `02-catalog.md` hold.
- Search: each filter type returns only matching products, unknown filters produce warnings, the fusion arithmetic matches a hand-computed example, the brand cap is enforced, every sort order and tie-break holds, non-relevance sorts ignore the query, and startup fails when the embeddings don't match the catalog.
- Tools: `search_products` converts attribute objects into search conditions, `show_products` drops unknown IDs, keeps order, sends its reply after the cards and records nothing when no IDs remain, `compare_products` lists the attributes that differ, and status text and card highlights match `05-api.md` and the display rules in `02-catalog.md`.
- LLM layer: no module outside `app/llm/` imports a provider SDK. Each adapter converts ToolSpecs, parses responses into LLMResponse, builds tool-result messages and applies its caching rules without changing the stored history, tested against locally built response objects. The registry rejects unknown providers and missing credentials.
- Agent loop: driven by a scripted stub provider, it runs tools in order, appends history and transcript entries correctly, sends status events before tools, enforces the 8-call limit, and handles every stop reason. A response whose calls are all `show_products` and that showed cards ends the turn without another model call, and one that showed nothing doesn't.
- Frontend: Playwright, running against a mocked API that replays recorded event streams, checks every quality-bar item in `06-frontend.md` that can be automated (the listed widths in both themes, the drag-resize sweep, layout shift, and console errors). Lighthouse runs on the production build.
- API: with a stubbed agent, the event order and error codes match `05-api.md`, and the session rules from `04-agent.md` hold (busy, full, expired, rollback on failure, cancellation and rollback on client disconnect). The featured list follows its selection rule. Restoring a session returns only committed turns, and its cards reflect the current catalog: a price changed after the turn shows the new price, and a removed product is left out.
- Session restore in the browser: reloading restores messages, result markers and the latest result set. A new tab starts a new session. An expired session shows the notice. Reloading during a turn puts the interrupted message back in the composer.
- Featured products in the browser: they show on first load in both layouts, the first result set replaces them, a new chat brings them back, and a restored session with results doesn't show them.

## Eval suite

`backend/evals/cases.yaml` holds at least 30 cases, and `backend/evals/run.py` runs them against the real agent and the demo catalog in-process, without the HTTP layer. Cases depend on the demo catalog, so a change to the generator requires rerunning the suite. Each case contains:

- `id` and a one-line `description`.
- `turns`: an ordered list of user messages.
- `expect`: checks applied to the final turn. Every key is optional:
  - `shown`: the conditions that every product in the final turn's last `show_products` call must meet, using the same `filters` syntax as `03-search.md`.
  - `min_shown`: the minimum number of products in that call.
  - `clarifies`: true when the final turn should make no `show_products` call and its reply should contain a question mark.
  - `declines`: true when the final turn should make no `search_products` or `show_products` call.
  - `mentions`: case-insensitive substrings the final reply must contain, such as a brand name the reply should name.
  - `reply_language`: `english` or `hinglish`. It is checked with a word-list heuristic: a reply counts as Hinglish when at least 2 distinct words from a fixed list of common Hindi words (such as hai, aur, ke, liye, yeh, aap, mein, sasta) appear in it.

Case coverage:

- At least 2 single-turn intents per category.
- At least 8 multi-turn refinements: cheaper, a different attribute, a different size, a brand, ordinal references, and comparison.
- At least 3 vague requests that should get a clarifying question.
- At least 3 out-of-scope requests.
- At least 3 no-result requests that should trigger relaxation.
- At least 6 Hinglish cases, all scored: a single-turn intent, a refinement ("aur sasta dikhao"), an ordinal reference ("dusra wala"), amount phrasings ("8k", "5 hazaar", "teen hazaar tak"), a clarification and an out-of-scope request.

## Grounding check

The eval applies this to every turn of every case. A rupee amount is a number written after "₹", "Rs" or "Rs.", or before "rupees", with or without digit grouping. Each rupee amount in the assistant text must equal a `price` or `mrp` that appeared in a tool result during that conversation, or a number the user typed. User amounts are normalized before comparison, so "8k" counts as 8000, "5 hazaar" as 5000, and the Hindi number words one to ten followed by "hazaar" are recognized ("teen hazaar" counts as 3000). Each product ID or exact product title in the text must belong to a product returned by a tool in that conversation. Any mismatch counts as a grounding violation.

## Metrics and targets

The runner uses the provider named by `LLM_PROVIDER`. It prints a summary and writes `evals/results/<timestamp>-<provider>.json`, which records the provider and model. The targets apply to each provider separately.

- Pass rate across scored cases: at least 90%. A case passes when every `expect` check holds and none of its turns has a grounding violation.
- Grounding violations: 0.
- Turn latency, measured from the start of a turn to its end: p50 under 8 s and p95 under 15 s.
- Input and output tokens per turn, plus cache-read tokens, are reported. For providers that report cache reads, cache-read tokens must be above zero from the second model call of a conversation onward, which confirms prompt caching works.

Once the suite exists, every change to the prompt or the tools reruns it on every registered provider, and every change to `LLM_PROVIDER` or `LLM_MODEL` reruns it on that provider. The summaries go in the commit message.
