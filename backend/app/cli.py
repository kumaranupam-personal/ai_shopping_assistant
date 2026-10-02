"""Terminal chat that runs agent turns directly, without the API or frontend (docs/01-architecture.md)."""

import asyncio

from app.agent.loop import run_turn
from app.agent.session import SessionFullError, SessionNotFoundError, SessionStore
from app.catalog.taxonomy import format_rupees
from app.config import Settings
from app.llm.base import LLMConfigError
from app.llm.registry import build_provider
from app.search.index import CatalogNotReadyError, load_index


def print_event(event: str, data: dict) -> None:
    if event == "status":
        print(f"  [{data['text']}]")
    elif event == "products":
        print(f"  {data['headline']}")
        for n, card in enumerate(data["products"], start=1):
            print(f"    {n}. {card['title']} - {format_rupees(card['price'])}")
        if data["suggestions"]:
            print(f"  Try: {' | '.join(data['suggestions'])}")
    elif event == "text":
        print(data["text"])


async def main() -> None:
    settings = Settings()
    provider = build_provider(settings)
    index = load_index(settings.data_dir)
    store = SessionStore(settings.session_ttl_minutes, settings.max_turns_per_session)
    session = store.create(provider.name)
    print("Shopping assistant. Type a message, or press Enter on an empty line to quit.")
    while text := (await asyncio.to_thread(input, "\n> ")).strip():
        try:
            await run_turn(provider, index, store.begin_turn(session.id), text, print_event)
        except (SessionNotFoundError, SessionFullError) as e:  # idle past SESSION_TTL_MINUTES, or out of turns
            session = store.create(provider.name)
            reason = "expired" if isinstance(e, SessionNotFoundError) else "reached its message limit"
            print(f"  [This chat {reason}, so a new one started. Send your message again.]")
        except Exception as e:  # noqa: BLE001 - show the failure and keep chatting
            print(f"  [error: {type(e).__name__}: {e}]")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (LLMConfigError, CatalogNotReadyError) as e:
        raise SystemExit(f"Can't start: {e}") from None
    except (EOFError, KeyboardInterrupt):
        pass
