# API

Every path is under `/api`. Request and response bodies are JSON, except for the chat stream. CORS allows the origins in `CORS_ORIGINS`.

## Endpoints

### POST /api/sessions

- Request body: none.
- Response 201: `{"session_id": "<uuid>"}`.

### GET /api/sessions/{id}

Restores a session's conversation after a page reload.

- Response 200: `{"session_id": "<uuid>", "turn_count": <n>, "entries": [...]}`, where `entries` is the session transcript from `04-agent.md`, in order:
  - `{"type": "user", "text": "..."}`
  - `{"type": "assistant", "text": "..."}`
  - `{"type": "products", "headline": "...", "suggestions": ["..."], "products": [<card>, ...]}`
- Cards in `products` entries are rebuilt from the current catalog at request time, so prices and stock are current. IDs no longer in the catalog are left out.
- Only committed turns are included. A turn that is still running or being cancelled doesn't appear.
- Response 404: `session_not_found`.

### POST /api/chat

- Request body: `{"session_id": "<uuid>", "message": "<1 to 1000 characters>"}`.
- Response 200: a `text/event-stream` carrying the events below, which always ends with exactly one `done` or `error` event. If the client disconnects first, the server cancels the turn as described in `04-agent.md`.
- Response 404: `session_not_found`.
- Response 409: `turn_in_progress`. In the rare case that another turn starts between this check and the start of the stream, the stream instead ends with an `error` event carrying `turn_in_progress`.
- Response 422: `invalid_request`, when the body is malformed or the message is empty or too long.
- Response 429: `session_full`.

### GET /api/featured

A fixed selection of products for the frontend to show before a conversation has any results.

- Response 200: `{"headline": "Popular picks", "suggestions": [], "products": [<card>, ...]}`, the same shape as a `products` event.
- One product per category, in the order of the categories in `02-catalog.md`: the in-stock product with the highest rating among those with at least 100 reviews. Ties go to more reviews, then to the lower ID. A category with no such product is skipped.
- The list is built once at startup. It belongs to no session, so it never enters a transcript or a shown list.

### GET /api/products/{id}

- Response 200: the full product record from `02-catalog.md`, plus `card` (the product card shape below) and `details`: every attribute as `{"label", "value"}` in taxonomy order, formatted by the display rules in `02-catalog.md`.
- Response 404: `product_not_found`.

### GET /api/health

- Response 200: `{"status": "ok", "products": <count>}`.

Non-stream error bodies look like `{"error": {"code": "<code>", "message": "<text>"}}`.

## Stream events

Each event is sent as `event: <type>` followed by `data: <json>`. `status`, `products` and `text` events arrive in the order the turn produces them, and they can interleave because the model may write text before calling tools. The stream always ends with exactly one `done` or `error`.

- `status`: `{"text": "<status text>"}`, sent before a tool runs.
- `products`: `{"headline": "...", "suggestions": ["..."], "products": [<card>, ...]}`, sent by `show_products`.
- `text`: `{"text": "<assistant text>"}`, one event per text block the model produces, plus one for each `reply` that `show_products` sends (see `04-agent.md`).
- `done`: `{"turn": <turn_count>}`.
- `error`: `{"code": "<code>", "message": "<text>"}`.

## Product card shape

```json
{
  "id": "JKT-00012",
  "title": "TrekNorth Summit 800 Down Jacket",
  "brand": "TrekNorth",
  "price": 7499,
  "mrp": 11999,
  "discount_pct": 38,
  "rating": 4.4,
  "review_count": 1832,
  "in_stock": true,
  "image_url": "https://placehold.co/400x400?text=Down+Jacket",
  "highlights": [{"label": "type", "value": "down"}, {"label": "warmth", "value": "extreme"}, {"label": "waterproof", "value": "yes"}]
}
```

- `discount_pct` is `round((mrp - price) / mrp * 100)`. It is 0 when `mrp` equals `price`.
- `highlights` holds the category's card attributes from `02-catalog.md`, in the listed order, with labels and values formatted by the display rules there.
- The server builds cards from catalog rows only, both in stream events and in session restores.

## Status text

The server builds status text from tool inputs, never from model prose:

- `search_products`: "Searching {category or 'all products'}" followed by any of " under {price_max}", " over {price_min}" and " in size {size}", in that order. Category names have underscores replaced by spaces, and amounts use the currency format from `02-catalog.md`.
- `get_product_details`: "Looking up product details".
- `compare_products`: "Comparing {n} products".

## Error codes

- `session_not_found`: the session is unknown or has expired.
- `turn_in_progress`: another turn is already running for this session.
- `session_full`: the session has reached `MAX_TURNS_PER_SESSION`.
- `invalid_request`: the request body failed validation. FastAPI's default validation response is replaced with this error body.
- `turn_limit`: the turn hit the model-call limit or a model response hit the output-token limit (see `04-agent.md`).
- `upstream_error`: the LLM provider failed after retries.
- `internal_error`: any other unexpected failure. The message is generic and the details go only to server logs.
- `product_not_found`: the product ID is unknown.
