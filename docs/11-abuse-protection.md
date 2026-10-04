# Abuse protection

The app is meant to run as a public demo, so it limits how much any one visitor, and all visitors together, can make it spend. Edge protection (DDoS, bot scoring, body size limits and limits on the `GET` endpoints) is the job of the proxy in front of the app. This doc covers what the API server itself enforces, plus the one rule the proxy must follow (see Proxy requirements). The terminal chat and the eval runner aren't limited.

Every limit is a configuration variable from `01-architecture.md`. A count limit (`RATE_LIMIT_*`, `MAX_SESSIONS`, `MAX_CONCURRENT_TURNS`) is off when set to 0, the daily budget is off when unset, and Turnstile is off without its keys. All of them are off by default, so local runs and tests are unaffected unless they opt in.

## Client IP

Per-IP limits key on the client IP address.

- With `CLIENT_IP_HEADER` unset, the client IP is the address of the TCP peer.
- With it set, such as to `CF-Connecting-IP`, the client IP is that header's value, falling back to the TCP peer when the header is missing. This is safe only when the origin accepts traffic from the proxy alone, because otherwise anyone can send the header.

## Checks

Each endpoint runs its checks in the order listed, after the request body passes validation (`invalid_request`) and before any model is called. The first check that fails rejects the request with the error code shown, from `05-api.md`.

### POST /api/sessions

1. **Session rate:** at most `RATE_LIMIT_SESSIONS_PER_HOUR` requests per client IP in any rolling hour. Over it: `rate_limited`.
2. **Human check:** with `TURNSTILE_SECRET` set, the request must carry a token that Cloudflare accepts (see Turnstile). Otherwise: `verification_failed`.
3. **Live sessions:** at most `MAX_SESSIONS` sessions in the store, where expired sessions don't count (see `04-agent.md`, Session rules). Over it: `server_busy`.

### POST /api/chat

1. **Kill switch:** with `CHAT_ENABLED` false: `chat_unavailable`.
2. **Daily budget:** with `DAILY_BUDGET_USD` set, once the day's spend (see Daily budget) has reached it: `chat_unavailable`.
3. **Message rate:** at most `RATE_LIMIT_CHAT_PER_MINUTE` requests per client IP in any rolling minute and `RATE_LIMIT_CHAT_PER_DAY` in any rolling 24 hours. Over either: `rate_limited`.
4. The session checks from `04-agent.md`, Session rules (`session_not_found`, `turn_in_progress`, `session_full`).
5. **Concurrent turns:** at most `MAX_CONCURRENT_TURNS` turns running at once across all sessions. Over it: `server_busy`. A turn counts from the moment its request passes this check until its stream ends.

## Rate windows

- Windows slide: each request that passes a rate check is timestamped, and a request passes when fewer than the limit fall inside the window.
- A request counts once it passes its rate check, even if a later check rejects it. A request the rate check itself rejects doesn't count.
- `rate_limited` responses carry a `Retry-After` header with the whole seconds, rounded up, until the oldest counted request leaves its window.

## Daily budget

- The day runs from 00:00 to 24:00 UTC.
- Every model call in an API turn adds its cost to the day's spend as soon as it returns, using `provider.prices` (see `09-llm-providers.md`, Prices). Calls in failed and cancelled turns count too.
- The budget is checked when a message arrives, not during a turn, so turns already running finish and the spend can end slightly above the budget.
- When set, `DAILY_BUDGET_USD` must be greater than 0. If it's set and the configured model has no prices, startup fails with `LLMConfigError`, because the spend couldn't be measured.

## State and logging

- Rate windows, the running-turn count and the day's spend live in memory, like the session store. A restart resets all of them, including the day's spend. The app runs as one process, so one set of counters sees every request.
- Each rejection writes one line to the server log with the code and the client IP.
- Rejections aren't traced (see `10-observability.md`, Scope).

## Turnstile

Cloudflare Turnstile checks that a browser, not a script, is creating a session. The backend check is on whenever `TURNSTILE_SECRET` is set, and the frontend widget whenever `VITE_TURNSTILE_SITE_KEY` is set at build time. Set both or neither: a secret without a site key rejects every new session, and a site key without a secret sends tokens the backend ignores. Production sets both; local runs set neither, or use Cloudflare's published test keys.

- **Frontend:** with a site key, the frontend loads `https://challenges.cloudflare.com/turnstile/v0/api.js` and renders one widget with `appearance: "interaction-only"`, so it's invisible unless Cloudflare asks the visitor to interact. Before every `POST /api/sessions` (page load, New chat, and replacing an expired session) it gets a fresh token and sends it as `turnstile_token`. Restoring a session needs no token. Without a site key, no Cloudflare script loads.
- **Backend:** the API sends the token, `TURNSTILE_SECRET` and the client IP to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with a 5-second timeout. The session is created only when the response has `success` true. A missing token, a rejected token, a timeout or a network failure all give `verification_failed`.
- Tokens are single-use and expire after 5 minutes, which is why each session creation gets a new one right before it. A token is checked only when its session is created, so its expiry never limits how long a conversation lasts; the session rules in `04-agent.md` do.
- Turnstile guards session creation only. A verified session is then held to the chat checks above.
- To switch it off in production, unset `TURNSTILE_SECRET` and restart the API, then rebuild the frontend without `VITE_TURNSTILE_SITE_KEY`. Unsetting the secret first, or both together, keeps session creation working throughout.

## Proxy requirements

The proxy in front of the app must never answer a request under `/api/` with a challenge page, such as Cloudflare's Bot Fight Mode or a WAF rule with a challenge action. The frontend calls the API with `fetch`, which can't solve a challenge, so it would receive an HTML page instead of JSON or a stream and the chat would fail with no visible prompt. On Cloudflare, a WAF custom rule with the action Skip, matching paths that start with `/api/`, skips the challenge features for those requests. Rate-limiting rules that block instead of challenging stay allowed. Challenges may still apply to the page itself, and the app's own checks above protect the API.

## Production values

Suggested settings for the public demo, set in its `.env`:

- `CLIENT_IP_HEADER=CF-Connecting-IP`
- `RATE_LIMIT_SESSIONS_PER_HOUR=10`, `RATE_LIMIT_CHAT_PER_MINUTE=10`, `RATE_LIMIT_CHAT_PER_DAY=100`
- `MAX_SESSIONS=1000`, `MAX_CONCURRENT_TURNS=10`
- `DAILY_BUDGET_USD=2`
- `TURNSTILE_SECRET` set, with `VITE_TURNSTILE_SITE_KEY` set in the frontend build.
