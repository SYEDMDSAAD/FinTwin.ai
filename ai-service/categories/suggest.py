"""
Category suggestions for payees the backend's rules couldn't place.

The model only sees payee names (never amounts, dates or account details),
answers from a fixed list, and may say "Unknown". Anything outside the list
is dropped. Each answer also says whether the model is sure: the backend's
sorting agent applies only sure answers (marked, reviewable, undoable) and
shows the rest as suggestions for the user to accept or change.
"""

import json
import logging
import re
import time

import requests

from utils.llm_client import ask

logger = logging.getLogger(__name__)

# What each category covers, in the model's prompt. Rules already handle
# people, own-account transfers and income, so those aren't offered here.
CATEGORIES = {
    "Food": "restaurants, cafes, food delivery, sweets, bakeries",
    "Groceries": "supermarkets, kirana, fruit and vegetables, quick-commerce grocery",
    "Travel": "flights, trains, hotels, holidays",
    "Transport": "cabs, fuel, metro, bus, parking, vehicle service",
    "Shopping": "clothes, electronics, online stores, sports goods, eyewear",
    "Bills": "phone, internet, electricity, gas, water, DTH, government fees",
    "Entertainment": "movies, events, streaming, games",
    "Housing": "rent, maintenance, home services, repairs",
    "Health": "hospitals, pharmacies, clinics, gyms, diagnostics",
    "Education": "schools, colleges, courses, books, exam fees",
    "EMI": "loan and credit repayments",
    "Investments": "brokers, mutual funds, SIPs, gold, trading apps",
}

BATCH = 15              # payees per model call
MAX_PAYEES = 60         # per request
BUDGET_SECONDS = 60.0   # the backend waits up to 90 s

_BY_LOWER = {c.lower(): c for c in CATEGORIES}


def _prompt(payees: list[str]) -> str:
    cats = "\n".join(f"- {c}: {d}" for c, d in CATEGORIES.items())
    lines = "\n".join(f"{i + 1}. {p}" for i, p in enumerate(payees))
    return f"""You sort Indian payment payees into spending categories.
Allowed categories:
{cats}

For each numbered payee, give the most likely category from the allowed list, judged only from the name. If the name does not make the kind of business clear, answer "Unknown". Never invent a category outside the list.

Also say whether you are sure. Be sure only when the name is a well-known brand or plainly names the kind of business (like "City Hospital" or "Fresh Vegetables"). A guess from a vague word, a person's name or an unfamiliar company is not sure.

Examples:
"Swiggy" -> Food, sure
"Apollo Pharmacy" -> Health, sure
"Groww" -> Investments, sure
"Airtel" -> Bills, sure
"Bajaj Finance" -> EMI, sure
"Krishna Enterprises" -> Shopping, not sure
"Sharma Traders" -> Unknown

Payees:
{lines}

Reply with JSON only, mapping each number to its category and whether you are sure, like {{"1": {{"category": "Food", "sure": true}}, "2": {{"category": "Unknown", "sure": false}}}}."""


def _clean(payee: str) -> str:
    # Names only: drop anything that could be an account or phone number
    p = re.sub(r"\d{6,}", " ", str(payee or ""))
    return re.sub(r"\s+", " ", p).strip()[:80]


def parse_with_sure(raw: str, count: int) -> list[tuple[str | None, bool]]:
    """The model's JSON → (allowed category or None, sure) per payee, in order.

    A bare string answer (the older format) counts as not sure.
    """
    try:
        data = json.loads(raw)
    except ValueError:
        return [(None, False)] * count
    if not isinstance(data, dict):
        return [(None, False)] * count
    out = []
    for i in range(count):
        v = data.get(str(i + 1))
        sure = False
        if isinstance(v, dict):
            sure = v.get("sure") is True
            v = v.get("category")
        category = _BY_LOWER.get(v.strip().lower()) if isinstance(v, str) else None
        out.append((category, sure and category is not None))
    return out


def parse(raw: str, count: int) -> list[str | None]:
    """The model's JSON → one allowed category (or None) per payee, in order."""
    return [c for c, _ in parse_with_sure(raw, count)]


def suggest(payees: list[str]) -> dict:
    """{"suggestions": {payee: category or None}, "sure": {payee: bool}, "complete": bool}."""
    unique = list(dict.fromkeys(p for p in payees if isinstance(p, str) and p.strip()))[:MAX_PAYEES]
    result: dict[str, str | None] = {}
    sure: dict[str, bool] = {}
    deadline = time.monotonic() + BUDGET_SECONDS
    complete = True

    for start in range(0, len(unique), BATCH):
        batch = unique[start:start + BATCH]
        remaining = deadline - time.monotonic()
        if remaining < 5:
            complete = False
            break
        cleaned = [_clean(p) for p in batch]
        try:
            raw = ask(_prompt(cleaned), max_tokens=20 + 30 * len(batch), timeout=remaining,
                      num_ctx=2048, temperature=0.0, json_mode=True, feature="category_suggest")
        except (RuntimeError, requests.exceptions.RequestException) as e:
            logger.warning("Category suggestions failed for a batch of %d: %s", len(batch), e)
            complete = False
            break
        for payee, name, (category, is_sure) in zip(batch, cleaned, parse_with_sure(raw, len(batch))):
            result[payee] = category if name else None
            sure[payee] = bool(name) and is_sure

    return {"suggestions": result, "sure": sure, "complete": complete}
