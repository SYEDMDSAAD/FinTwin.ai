"""
Category suggestions for payees the backend's rules couldn't place.

The model only sees payee names (never amounts, dates or account details),
answers from a fixed list, and may say "Unknown". Anything outside the list
is dropped. Suggestions are shown to the user to accept or change — never
applied on their own — so a wrong guess costs a click, not a wrong budget.
"""

import json
import logging
import re
import time

import requests

from utils.ollama_client import ask

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

Examples:
"Swiggy" -> Food
"Apollo Pharmacy" -> Health
"Groww" -> Investments
"DMart" -> Groceries
"Airtel" -> Bills
"Bajaj Finance" -> EMI
"Sharma Traders" -> Unknown

Payees:
{lines}

Reply with JSON only, mapping each number to a category, like {{"1": "Food", "2": "Unknown"}}."""


def _clean(payee: str) -> str:
    # Names only: drop anything that could be an account or phone number
    p = re.sub(r"\d{6,}", " ", str(payee or ""))
    return re.sub(r"\s+", " ", p).strip()[:80]


def parse(raw: str, count: int) -> list[str | None]:
    """The model's JSON → one allowed category (or None) per payee, in order."""
    try:
        data = json.loads(raw)
    except ValueError:
        return [None] * count
    if not isinstance(data, dict):
        return [None] * count
    out = []
    for i in range(count):
        v = data.get(str(i + 1))
        out.append(_BY_LOWER.get(v.strip().lower()) if isinstance(v, str) else None)
    return out


def suggest(payees: list[str]) -> dict:
    """{"suggestions": {payee: category or None}, "complete": bool}."""
    unique = list(dict.fromkeys(p for p in payees if isinstance(p, str) and p.strip()))[:MAX_PAYEES]
    result: dict[str, str | None] = {}
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
            raw = ask(_prompt(cleaned), max_tokens=20 + 12 * len(batch), timeout=remaining,
                      num_ctx=2048, temperature=0.0, json_mode=True)
        except (RuntimeError, requests.exceptions.RequestException) as e:
            logger.warning("Category suggestions failed for a batch of %d: %s", len(batch), e)
            complete = False
            break
        for payee, name, category in zip(batch, cleaned, parse(raw, len(batch))):
            result[payee] = category if name else None

    return {"suggestions": result, "complete": complete}
