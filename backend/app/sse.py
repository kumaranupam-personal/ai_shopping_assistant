"""Server-sent event framing (docs/05-api.md, Stream events)."""

import json


def format_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
