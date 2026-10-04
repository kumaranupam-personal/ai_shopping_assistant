# Evaluation

## Automated tests

`backend/tests/` holds the backend tests, which run with `pytest`. `frontend/tests/` holds the browser tests, which run with `npm test`. Neither set calls an LLM provider.

- Configuration and taxonomy: defaults apply when nothing is set, shell variables override `.env`, and relative paths resolve against `backend/`. Every category's card attributes are among its attributes, and the display rules format every unit suffix and value type correctly.
- Ingestion: valid products load, each broken field rule from `02-catalog.md` rejects the line with a reason, duplicate IDs are rejected, the exit code follows `--allow-rejects`, and a failed run leaves any existing `catalog.db` untouched.
- Demo data: generating twice gives identical files, the output passes ingestion with zero rejects, each category has the right count, and the plausibility rules in `02-catalog.md` hold.
- Search: each filter type returns only matching products, unknown filters produce warnings, the fusion arithmetic matches a hand-computed example, the brand cap is enforced, every sort order and tie-break holds, non-relevance sorts ignore the query, and startup fails when the embeddings don't match the catalog.
- Tools: `search_products` converts attribute objects into search conditions, `show_products` drops unknown IDs, keeps order, sends its reply after the cards and records nothing when no IDs remain, `compare_products` lists the attributes that differ, and status text and card highlights match `05-api.md` and the display rules in `02-catalog.md`.
- LLM layer: no module other than the adapters imports a provider SDK. Each adapter converts ToolSpecs, parses responses into LLMResponse, builds tool-result messages and applies its caching rules without changing the stored history, tested against locally built response objects. The registry rejects unknown providers and missing credentials.
- Agent loop: driven by a scripted stub provider, it runs tools in order, appends history and transcript entries correctly, sends status events before tools, enforces the 8-call limit, and handles every stop reason. A response whose calls are all `show_products` and that showed cards ends the turn without another model call, and one that showed nothing doesn't. Text in a response that calls `show_products` is neither sent nor recorded.
- Frontend: Playwright, running against a mocked API that replays recorded event streams, checks every quality-bar item in `06-frontend.md` that can be automated (the listed widths in both themes, the drag-resize sweep, layout shift, and console errors). Lighthouse runs on the production build with `npm run lighthouse`.
- API: with a stubbed agent, the event order and error codes match `05-api.md`, and the session rules from `04-agent.md` hold (busy, full, expired, rollback on failure, cancellation and rollback on client disconnect). The featured list follows its selection rule. Restoring a session returns only committed turns, and its cards reflect the current catalog: a price changed after the turn shows the new price, and a removed product is left out.
- Session restore in the browser: reloading restores messages, result markers and the latest result set. A new tab starts a new session. An expired session shows the notice. Reloading during a turn puts the interrupted message back in the composer. A message rejected with `session_full` shows a "New chat" button instead of "Retry".
- Eval checks: the grounding check, amount normalization and each `expect` key, plus one case run end to end against a scripted stub provider, all without an LLM.
- Product tiles in the browser: a card without an image, and a card whose image fails to load, show a tile with their category's icon in their first color's wash.
- Tracing: with an in-memory span exporter, a turn's spans and their attributes match `10-observability.md`, for a successful, a failed and a cancelled turn, a raising provider call, a tool error result, message text on and off, the eval runner's turns, and a model without prices. With no endpoint configured, nothing is exported, and a failing exporter never fails a turn.
- Cost: `Prices.cost` matches a hand-computed example over all four usage buckets, and each adapter fills `cache_write_tokens` as `09-llm-providers.md` describes.
- Abuse protection: with limits set, each check in `11-abuse-protection.md` rejects with its code in the documented order, sliding windows admit requests again once old ones leave, a limit of 0 is off, `Retry-After` is correct, the client IP comes from `CLIENT_IP_HEADER` or the peer, model calls in failed turns count toward the daily budget, and startup fails for a budget without prices. Turnstile is tested against a stubbed verification call: off without a secret, and with one, a missing, rejected or timed-out token gives `verification_failed`. With no limits configured, every existing test passes unchanged.
- Abuse protection in the browser: `chat_unavailable` shows the server's message with no button, and a refused session creation shows the server's message as the notice.
- Chat regressions in the browser: under reduced motion, "Jump to latest" jumps without smooth scrolling, and a New chat that can't create a session keeps the running turn.
- Featured products in the browser: they show on first load in both layouts, the first result set replaces them, a new chat brings them back, and a restored session with results doesn't show them.

## Eval suite

`backend/evals/cases.yaml` holds 20 cases, each checking something the others don't, and `backend/evals/run.py` runs them against the real agent and the demo catalog in-process, without the HTTP layer. Cases depend on the demo catalog, so a change to the generator requires rerunning the suite. Each case contains:

- `id` and a one-line `description`.
- `turns`: an ordered list of user messages.
- `expect`: checks applied to the final turn. Every key is optional, and a case with none is unscored: it still counts toward grounding, latency and tokens, but not toward the pass rate.
  - `shown`: the conditions that every product in the final turn's last `show_products` call must meet, using the same `filters` syntax as `03-search.md`, and that call must show at least one product.
  - `min_shown`: the minimum number of products in that call.
  - `clarifies`: true when the final turn should make no `show_products` call and its reply should contain a question mark.
  - `declines`: true when the final turn should make no `search_products` or `show_products` call.
  - `mentions`: case-insensitive substrings the final reply must contain, such as a brand name the reply should name.
  - `reply_language`: `english` or `hinglish`. It is checked with a word-list heuristic: a reply counts as Hinglish when at least 2 distinct words from a fixed list of common Hindi words (such as hai, aur, ke, liye, yeh, aap, mein, sasta) appear in it.

Case coverage:

- Every category in at least one case.
- 4 multi-turn refinements: a different attribute, a brand, an ordinal reference and a comparison.
- 2 vague requests that should get a clarifying question, one of them in Hinglish.
- 2 out-of-scope requests, one of them in Hinglish: an unrelated request and a category the store doesn't carry.
- 2 no-result requests that should trigger relaxation: one fixed by raising the budget, one by dropping an inferred attribute.
- 6 Hinglish cases, all scored: a single-turn intent, a refinement ("aur sasta dikhao"), an ordinal reference ("dusra wala"), an amount in Hindi number words ("teen hazaar tak"), a clarification and an out-of-scope request.

## Grounding check

The eval applies this to every turn of every case. A rupee amount is a number written after "₹", "Rs" or "Rs.", or before "rupees", with or without digit grouping, and a trailing "k" means thousands ("₹8k" counts as 8000). Each rupee amount in the assistant text must equal a `price` or `mrp` that appeared in a tool result during that conversation, a `price_min` or `price_max` in the `applied` filters a search reported (so a relaxed budget can be stated), or a number the user typed. User amounts are normalized before comparison, so "8k" counts as 8000, "5 hazaar" as 5000, and the Hindi number words one to ten followed by "hazaar" are recognized ("teen hazaar" counts as 3000). Each product ID or exact product title in the text must belong to a product returned by a tool in that conversation. Titles can repeat in a catalog, so a title counts as grounded when any product with that title was returned. Any mismatch counts as a grounding violation.

## Metrics and targets

The runner uses the provider named by `LLM_PROVIDER`. It prints a summary and writes `evals/results/<timestamp>-<provider>-<prompt_version>.json`. The targets apply to each provider separately. Each results file records:

- the provider and model;
- `prompt_version`: the first 12 hex characters of a SHA-256 hash of exactly what the model sees, the system prompt and every tool's name, description and schema, so any change to them gives a new version;
- `git_commit` and `git_dirty`: the commit the run used, and whether `backend/` had uncommitted changes outside `evals/results/`, so leftover run files don't count.

The first run of a prompt version also saves its system prompt and tools as `evals/results/prompts/<prompt_version>.json`, so any two versions can be diffed. Each provider's reference run is `evals/results/baseline-<provider>.json`, in the same format as a run's file; it is replaced only on purpose, in its own commit. A baseline recorded before prompt versioning carries the version it ran with, marked `prompt_version_backfilled`, and no commit.

- Pass rate across scored cases: at least 90%. A case passes when every `expect` check holds and none of its turns has a grounding violation.
- Grounding violations: 0.
- Turn latency, measured from the start of a turn to its end: p50 under 8 s and p95 under 15 s.
- Cost per turn and for the whole run, in USD, from the provider's `prices` (see `09-llm-providers.md`), is reported. It is left out when `prices` is unset. Cost has no target.
- Input and output tokens per turn, plus cache-read and cache-write tokens, are reported. From the second model call of a conversation onward, every call whose input (uncached, cache-read and cache-write tokens) is at least the provider's `min_cache_tokens` (see `09-llm-providers.md`) must read tokens from the cache, which confirms prompt caching works. Smaller calls aren't counted, because the provider can't cache them, and a provider that caches on a best-effort basis (no `min_cache_tokens`) isn't checked.

Every change to the prompt or the tools reruns the suite on every registered provider, and every change to a provider's adapter or default model reruns it on that provider. The summaries go in the commit message.
