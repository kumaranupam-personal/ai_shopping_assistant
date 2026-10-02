"""The grounding check and the per-case expectations (docs/07-evaluation.md). Pure functions, so tests need no LLM."""

import json
import re
from collections.abc import Callable
from dataclasses import dataclass, field

NUMBER = r"\d[\d,]*(?:\.\d+)?"
# "₹7,499", "Rs 7499", "Rs. 7,499" or "7499 rupees"; a trailing "k" means thousands, as in "₹8k".
RUPEE_AMOUNT = re.compile(rf"(?:₹|\bRs\b\.?)\s*({NUMBER})(\s*k\b)?|({NUMBER})(\s*k\b)?\s*rupees\b", re.IGNORECASE)
USER_AMOUNT = re.compile(rf"({NUMBER})\s*(k\b|hazaa?r\b)?", re.IGNORECASE)
AMOUNT_KEYS = ("price", "mrp", "price_min", "price_max")
HINDI_NUMBERS = {
    "ek": 1, "do": 2, "teen": 3, "char": 4, "chaar": 4, "paanch": 5, "panch": 5,
    "chhe": 6, "chheh": 6, "saat": 7, "aath": 8, "nau": 9, "das": 10,
}
HINDI_THOUSANDS = re.compile(rf"\b({'|'.join(HINDI_NUMBERS)})\s+hazaa?r\b", re.IGNORECASE)
HINDI_WORDS = frozenset(
    "hai hain aur ke ki ka liye yeh ye aap mein sasta saste sabse accha achha wala wali nahi bhi toh kya "
    "dikhao chahiye".split()
)


@dataclass
class TurnResult:
    """What one turn produced, as the checks see it."""

    reply: str = ""  # every text event of the turn, joined
    tools: list[str] = field(default_factory=list)  # names of the tools called, in order
    shown: list[str] | None = None  # product IDs in the turn's last products event


def _amount(digits: str, thousands: str) -> float:
    return float(digits.replace(",", "")) * (1000 if thousands.strip() else 1)


def rupee_amounts(text: str) -> list[float]:
    return [_amount(m[0] or m[2], m[1] or m[3]) for m in RUPEE_AMOUNT.findall(text)]


def user_amounts(text: str) -> set[float]:
    """Every number the user typed, normalized: "8k" and "8 hazaar" count as 8000, "teen hazaar" as 3000."""
    numbers = {_amount(digits, unit) for digits, unit in USER_AMOUNT.findall(text)}
    return numbers | {HINDI_NUMBERS[word.lower()] * 1000.0 for word in HINDI_THOUSANDS.findall(text)}


def tool_facts(contents: list[str]) -> tuple[set[str], set[float]]:
    """Product IDs, and every price, MRP and applied budget bound, anywhere in the tool results of a conversation.

    The budget bounds (`price_min`, `price_max`) appear only in a search's `applied` filters, so a relaxed budget the
    agent states is grounded.
    """
    ids, prices = set(), set()

    def walk(value) -> None:
        if isinstance(value, dict):
            if isinstance(value.get("id"), str):
                ids.add(value["id"])
            prices.update(float(value[k]) for k in AMOUNT_KEYS if isinstance(value.get(k), int | float))
            for item in value.values():
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    for content in contents:
        try:
            walk(json.loads(content))
        except ValueError:
            pass  # error results are plain text
    return ids, prices


def grounding_violations(
    reply: str, catalog: list[tuple[str, str]], tool_ids: set[str], tool_prices: set[float], user_numbers: set[float]
) -> list[str]:
    """Amounts must come from a tool result or the user; named products (by ID or exact title) from a tool result.

    Titles can repeat in a catalog, so a title is grounded when any product with that title was returned.
    """
    violations = [
        f"amount ₹{amount:,.0f} is in no tool result and wasn't typed by the user"
        for amount in rupee_amounts(reply)
        if amount not in tool_prices and amount not in user_numbers
    ]
    returned_titles = {title for product_id, title in catalog if product_id in tool_ids}
    violations += [f"product {product_id} was named but no tool returned it" for product_id, _ in catalog if product_id in reply and product_id not in tool_ids]
    violations += [f"title {title!r} was named but no tool returned it" for title in {t for _, t in catalog} if title in reply and title not in returned_titles]
    return violations


def reply_language(reply: str) -> str:
    words = set(re.findall(r"[a-z]+", reply.lower()))
    return "hinglish" if len(words & HINDI_WORDS) >= 2 else "english"


def expect_failures(expect: dict, turn: TurnResult, matching: Callable[[dict, list[str]], set[str]]) -> list[str]:
    """The `expect` checks that fail for the final turn. `matching` returns which products pass a filter."""
    failures = []
    shown = turn.shown or []
    if "shown" in expect:
        unmet = [i for i in shown if i not in matching(expect["shown"], shown)] if shown else None
        if unmet is None:
            failures.append("shown: no products were shown")
        elif unmet:
            failures.append(f"shown: {unmet} don't meet {expect['shown']}")
    if "min_shown" in expect and len(shown) < expect["min_shown"]:
        failures.append(f"min_shown: {len(shown)} shown, expected at least {expect['min_shown']}")
    if expect.get("clarifies") and ("show_products" in turn.tools or "?" not in turn.reply):
        failures.append("clarifies: expected one question and no products")
    if expect.get("declines") and {"search_products", "show_products"} & set(turn.tools):
        failures.append(f"declines: expected no search or products, but called {turn.tools}")
    failures += [f"mentions: {m!r} not in the reply" for m in expect.get("mentions", []) if m.lower() not in turn.reply.lower()]
    if "reply_language" in expect and (language := reply_language(turn.reply)) != expect["reply_language"]:
        failures.append(f"reply_language: replied in {language}, expected {expect['reply_language']}")
    return failures
