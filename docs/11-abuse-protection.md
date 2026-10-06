# Abuse protection

The app is meant to run as a public demo, so it limits how much any one visitor, and all visitors together, can make it spend. Edge protection (DDoS, bot scoring, body size limits and limits on the `GET` endpoints) is the job of the proxy in front of the app. This doc covers what the API server itself enforces, plus the one rule the proxy must follow (see Proxy requirements). The terminal chat and the eval runner aren't limited.

Every limit is a configuration variable from `01-architecture.md`. A count limit (`RATE_LIMIT_*`, `MAX_SESSIONS`, `MAX_CONCURRENT_TURNS`) is off when set to 0, the daily budget is off when unset, and Turnstile is off without its keys. All of them are off by default, so local runs and tests are unaffected unless they opt in.

## Client IP

Per-IP limits key on the client IP address.

- With `CLIENT_IP_HEADER` unset, the client IP is the address of the TCP peer.
- With it set, such as to `X-Real-IP`, the client IP is that header's value, falling back to the TCP peer when the header is missing. This is safe only when the origin accepts traffic from the proxy alone, because otherwise anyone can send the header.
- The rate limits count an IPv6 address by its /64 network, because one client usually holds a whole /64 and could otherwise switch addresses within it to get fresh limits. IPv4 addresses, including IPv4 addresses mapped into IPv6, count one by one, and a header value that isn't an address counts as it is. The Turnstile check and the log lines use the full address.

## Checks

Each endpoint runs its checks in the order listed, after the request body passes validation (`invalid_request`) and before any model is called. The first check that fails rejects the request with the error code shown, from `05-api.md`.

### POST /api/sessions

1. **Session rate:** at most `RATE_LIMIT_SESSIONS_PER_HOUR` requests per client IP in any rolling hour. Over it: `rate_limited`.
2. **Sessions per client:** at most `MAX_SESSIONS_PER_IP` unexpired sessions created by one client IP, keyed like the rate limits (so by /64 for IPv6). Over it: `rate_limited`, with no `Retry-After` header, since a place frees only when one of those sessions expires. Without it, a client could fill `MAX_SESSIONS` over a few days with sessions it keeps alive by restoring them, which is cheap and not rate limited.
3. **Human check:** with `TURNSTILE_SECRET` set, the request must carry a token that Cloudflare accepts (see Turnstile). Otherwise: `verification_failed`.
4. **Live sessions:** at most `MAX_SESSIONS` sessions in the store, where expired sessions don't count (see `04-agent.md`, Session rules). When the store is full, the empty session (one with no messages and no running turn) that has been idle longest is removed to make room, provided it has been idle for at least 15 minutes, so unused sessions can't hold every place for a whole `SESSION_TTL_MINUTES`. Sessions with messages are never removed this way. A visitor whose empty session was removed gets the expired-chat handling in `06-frontend.md`. With no such session to remove: `server_busy`.

### POST /api/chat

1. **Kill switch:** with `CHAT_ENABLED` false: `chat_unavailable`.
2. **Daily budget:** with `DAILY_BUDGET_USD` set, once the day's spend (see Daily budget) has reached it: `chat_unavailable`.
3. **Message rate:** at most `RATE_LIMIT_CHAT_PER_MINUTE` requests per client IP in any rolling minute and `RATE_LIMIT_CHAT_PER_DAY` in any rolling 24 hours. Over either: `rate_limited`.
4. The session checks from `04-agent.md`, Session rules (`session_not_found`, `turn_in_progress`, `session_full`).
5. **Concurrent turns:** at most `MAX_CONCURRENT_TURNS` turns running at once across all sessions. Over it: `server_busy`. A turn counts as running while its session is busy (see `04-agent.md`, Conversation state). How a turn that loses the race for the last place ends is in `05-api.md`.

## Rate windows

- Windows slide: each request that passes a rate check is timestamped, and a request passes when fewer than the limit fall inside the window.
- A request counts once it passes its rate check, even if a later check rejects it. A request the rate check itself rejects doesn't count.
- `rate_limited` responses carry a `Retry-After` header with the whole seconds, rounded up, until the oldest counted request leaves its window. When both chat windows are full, it's the later of the two.
- A limiter forgets a client once its every request has left the longest window. It sweeps for such clients at most once a minute, not on every request, so a request's cost doesn't grow with the number of clients seen that day.

## Daily budget

- The day runs from 00:00 to 24:00 UTC.
- Every model call in an API turn adds its cost to the day's spend as soon as it returns, using `provider.prices` (see `09-llm-providers.md`, Prices). Calls in failed and cancelled turns count too, and a call that fails adds nothing.
- The budget is checked when a message arrives and again before every model call of an API turn. A running turn that finds it spent stops with a `chat_unavailable` error event and rolls back. Calls already sent still finish and count, so the spend can end slightly above the budget, by at most one call per running turn.
- `LLM_MAX_TOKENS` bounds the cost of a single call, and so how far the spend can pass the budget.
- If `DAILY_BUDGET_USD` is set and the configured model has no prices, startup fails with `LLMConfigError`, because the spend couldn't be measured.

## State and logging

- Rate windows, the running-turn count and the day's spend live in memory, like the session store. A restart resets all of them, including the day's spend. The app runs as one process, so one set of counters sees every request.
- Each rejection by a check in this doc (`rate_limited`, `verification_failed`, `server_busy` and `chat_unavailable`, including a `server_busy` or `chat_unavailable` stream event) writes one warning line to the server log with the code and the client IP. The session checks from `04-agent.md` aren't logged.
- Rejections aren't traced (see `10-observability.md`, Scope).
- At startup, when `CLIENT_IP_HEADER` is set (the mark of a deployment behind a proxy), the server logs one warning for each control that is off: `DAILY_BUDGET_USD`, each `RATE_LIMIT_*`, `MAX_SESSIONS`, `MAX_SESSIONS_PER_IP`, `MAX_CONCURRENT_TURNS` and `TURNSTILE_SECRET`. Empty values count as unset, so a `.env` line left blank would otherwise switch a control off silently.

## Turnstile

Cloudflare Turnstile checks that a browser, not a script, is creating a session. The backend check is on whenever `TURNSTILE_SECRET` is set, and the frontend widget whenever `VITE_TURNSTILE_SITE_KEY` is set at build time. Set both or neither: a secret without a site key rejects every new session, and a site key without a secret sends tokens the backend ignores. Production sets both; local runs set neither, or use Cloudflare's published test keys.

- **Frontend:** with a site key, the frontend loads `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` and renders one widget with `appearance: "interaction-only"`, so it's invisible unless Cloudflare asks the visitor to interact. Before every `POST /api/sessions` (page load, New chat, and replacing an expired session) it gets a fresh token and sends it as `turnstile_token`. Restoring a session needs no token. If the script can't load, or the widget fails, times out or finds the browser unsupported, the request goes without a token and the server answers `verification_failed`. Without a site key, no Cloudflare script loads.
- **Backend:** the API sends the token, `TURNSTILE_SECRET` and the client IP to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with a 5-second timeout. The session is created only when the response has `success` true. A missing token, a rejected token, a timeout or a network failure all give `verification_failed`.
- Tokens are single-use and expire after 5 minutes, which is why each session creation gets a new one right before it. A token is checked only when its session is created, so its expiry never limits how long a conversation lasts; the session rules in `04-agent.md` do.
- Turnstile guards session creation only. A verified session is then held to the chat checks above.
- To switch it off in production, unset `TURNSTILE_SECRET` and restart the API, then rebuild the frontend without `VITE_TURNSTILE_SITE_KEY`. Unsetting the secret first, or both together, keeps session creation working throughout.

## Proxy requirements

The proxy in front of the app must never answer a request under `/saathi/api/` (the public path of the API, see `13-deployment.md`, Paths) with a challenge page, such as Cloudflare's Bot Fight Mode or a WAF rule with a challenge action. The frontend calls the API with `fetch`, which can't solve a challenge, so it would receive an HTML page instead of JSON or a stream and the chat would fail with no visible prompt. On Cloudflare, a WAF custom rule with the action Skip, matching paths that start with `/saathi/api/`, skips the challenge features for those requests. Rate-limiting rules that block instead of challenging stay allowed. Challenges may still apply to the page itself, and the app's own checks above protect the API.

The proxy's own per-IP limits must key IPv6 addresses by their /64, as the app does (see Client IP). Otherwise a visitor holding a /64 meets only the app's limits. The nginx configuration in `13-deployment.md` does this.

## Production values

Suggested settings for the public demo, set in its `.env`:

- `CLIENT_IP_HEADER=X-Real-IP`, which the server's nginx sets to the visitor's address, with or without Cloudflare in front (see `13-deployment.md`).
- `RATE_LIMIT_SESSIONS_PER_HOUR=10`, `RATE_LIMIT_CHAT_PER_MINUTE=10`, `RATE_LIMIT_CHAT_PER_DAY=100`
- `MAX_SESSIONS=1000`, `MAX_SESSIONS_PER_IP=20`, `MAX_CONCURRENT_TURNS=10`
- `DAILY_BUDGET_USD=2`
- `LLM_MAX_TOKENS=4000`, which keeps one call's cost small. Across the recorded eval runs, the largest turn on any provider used under 800 output tokens, thinking included, so replies are never cut short at `LLM_EFFORT=low`. Raise it with the effort.
- `TURNSTILE_SECRET` set, with `VITE_TURNSTILE_SITE_KEY` set in the frontend build.
