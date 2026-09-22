"""
Portfolio answers that don't depend on a 3B model getting its prose right.

Two jobs:
- route():   plain data questions ("how are my investments doing?", "which of
             my holdings are losing money?") are answered straight from the
             backend's figures by compose(), without the model. Faster, and it
             can't contradict the data.
- check():   when the model does answer (advice questions), drop any line
             telling the user to buy or sell, and reject the answer outright if
             it says a holding is losing when the data says it's gaining (or
             the reverse).
"""

import re
from typing import Optional

# ── Routing ───────────────────────────────────────────────────────────────────

# The backend's holding types, and the words people use for them.
_TYPE_WORDS = [
    ("Mutual Fund",   r"\bmutual\s*funds?\b|\bmfs?\b|\bfunds?\b"),
    ("Stocks",        r"\bstocks?\b|\bshares?\b|\bequit(?:y|ies)\b"),
    ("Fixed Deposit", r"\bfixed\s+deposits?\b|\bfds?\b"),
    ("PPF",           r"\bppf\b"),
    ("NPS",           r"\bnps\b"),
    ("Gold",          r"\bgold\b"),
    ("Crypto",        r"\bcrypto\w*\b|\bbitcoin\b"),
    ("IPO",           r"\bipos?\b"),
    ("Bonds",         r"\bbonds?\b"),
]

_INVESTMENT_NOUN = re.compile(
    r"\b(invest\w*|portfolio|holdings?|stocks?|shares?|equit\w*|funds?|mfs?|"
    r"fds?|fixed deposits?|ppf|nps|gold|crypto\w*|ipos?|bonds?)\b")

# Anything asking for judgement, a plan or a prediction goes to the model.
_ADVICE = re.compile(
    r"\b(should|shall|could|would|how (can|do|should) i|why|improve|diversif\w*|"
    r"advice|advise|suggest\w*|recommend\w*|plan|future|will|predict\w*|next|"
    r"better|worse than|compare|vs|versus|buy|sell|exit|redeem|switch|not|n't)\b")

_INTENTS = [
    ("losing",     re.compile(r"\b(losing|lost|in (a )?loss|at (a )?loss|(is|are) down|negative|in the red|underperform\w*)\b")),
    ("gaining",    re.compile(r"\b(gaining|in (a )?profit|making money|(is|are) up|positive|in the green|profitable)\b")),
    ("best_worst", re.compile(r"\b(best|worst|top)\b.*\b(perform\w*|holdings?|investments?|stocks?|funds?)\b"
                              r"|\b(perform\w*)\b.*\b(best|worst)\b")),
    ("allocation", re.compile(r"\b(allocation|split|breakdown|divided|spread across)\b")),
    ("overview",   re.compile(r"\bhow (are|is) my\b.*\b(doing|performing)\b"
                              r"|\bhow much\b.*\b(made|earned|gained|profit|return\w*|worth|value)\b"
                              r"|\b(total|overall)\s+(returns?|profit|gains?|value)\b"
                              r"|\bwhat('s| is| are)\s+my\b.*\b(worth|value|returns?)\b"
                              r"|\b(show|list)( me)? (all )?my\b")),
]


def intent_of(question: str) -> str:
    """Which kind of portfolio answer fits the question, advice or not."""
    q = (question or "").lower()
    return next((i for i, p in _INTENTS if p.search(q)), "overview")


def route(question: str) -> Optional[tuple[str, Optional[str]]]:
    """(intent, holding type or None for all) for a plain portfolio data question, else None."""
    q = (question or "").lower()
    if not _INVESTMENT_NOUN.search(q) or _ADVICE.search(q):
        return None
    for intent, pattern in _INTENTS:
        if pattern.search(q):
            return intent, _type_in(q)
    return None


def _type_in(q: str) -> Optional[str]:
    found = [t for t, words in _TYPE_WORDS if re.search(words, q)]
    return found[0] if len(found) == 1 else None


# ── Deterministic answers ─────────────────────────────────────────────────────

def _lines(data: dict) -> dict[str, str]:
    """Holding name → its ready-made sentence (both lists share one order)."""
    return {h.get("name", ""): line for h, line in zip(data.get("holdings", []), data.get("perHolding", []))}


def _bullets(lines) -> str:
    return "\n".join(f"- {line}" for line in lines)


def _valuation_note(data: dict, names=None) -> str:
    odd = [h for h in data.get("holdings", [])
           if (names is None or h.get("name") in names)
           and not str(h.get("valuation", "")).startswith("market price")]
    if not odd:
        return ""
    parts = [f"{h['name']} is {h['valuation']}" for h in odd]
    return "\n\nNote: " + "; ".join(parts) + "."


def compose(intent: str, data: dict) -> str:
    if not data.get("holdingCount"):
        return data.get("note") or "You don't have any investments recorded in FinTwin yet."

    lines = _lines(data)
    summary = data.get("summary", "")
    note = f"\n\n{data['note']}" if data.get("note") else ""

    if intent in ("losing", "gaining"):
        names = data.get("atLoss" if intent == "losing" else "inProfit", [])
        if not names:
            state = "at a loss" if intent == "losing" else "in profit"
            return f"None of your holdings are {state} right now.\n\n{summary}"
        head = "at a loss" if intent == "losing" else "in profit"
        return (f"{len(names)} of your holdings {'is' if len(names) == 1 else 'are'} {head}:\n"
                + _bullets(lines[n] for n in names if n in lines)
                + f"\n\n{summary}" + _valuation_note(data, names))

    if intent == "best_worst":
        if data.get("bestPerformer"):
            return (f"Best performer: {data['bestPerformer']}\nWorst performer: {data['worstPerformer']}"
                    f"\n\n{summary}" + _valuation_note(data))
        return f"You have one holding:\n{_bullets(lines.values())}" + _valuation_note(data)

    if intent == "allocation":
        return ("Your portfolio by type (share of current value):\n" + _bullets(data.get("allocation", []))
                + f"\n\n{summary}" + note)

    # overview
    body = f"{summary}\n\n{_bullets(lines.values())}"
    if not data.get("filteredTo") and len(data.get("allocation", [])) > 1:
        body += "\n\nBy type: " + ", ".join(data["allocation"])
    return body + _valuation_note(data) + note


# ── Checking the model's answer ───────────────────────────────────────────────

_LOSS = re.compile(r"\b(loss|losses|losing|lost|down|negative|declin\w*|underperform\w*|falling|fell|in the red)\b")
_GAIN = re.compile(r"\b(gain\w*|profit\w*|up|positive|grew|grown|rose|risen|appreciat\w*|performing well|in the green)\b")
_NEGATED = re.compile(r"\b(no|not|never|without|none|isn't|aren't|hasn't|haven't)\b")
_CLAUSE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+|;|,|\bwhile\b|\bbut\b|\bwhereas\b|\bhowever\b|\band\b")

_TRADE = re.compile(
    r"\b(sell\w*|exit\w*|buy(ing)? more|book(ing)? (your |the )?(profits?|loss\w*)|"
    r"realloca\w*|(shift|move|moving|shifting) (some |your |more )*(money|funds)|"
    r"reduc\w* (your )?exposure|switch(ing)? (to|from|out)|cut (your )?losses|"
    r"allocate more|increase your (allocation|exposure))\b", re.IGNORECASE)

_TYPE_ALIASES = {
    "Mutual Fund": ["mutual fund"], "Stocks": ["stock", "share"], "Fixed Deposit": ["fixed deposit", "fd"],
    "PPF": ["ppf"], "NPS": ["nps"], "Gold": ["gold"], "Crypto": ["crypto"], "Bonds": ["bond"], "IPO": ["ipo"],
}


def _aliases(data: dict) -> dict[str, list[str]]:
    """How the answer might refer to each holding: its name, and its type if no other holding shares it."""
    holdings = data.get("holdings", [])
    type_counts: dict[str, int] = {}
    for h in holdings:
        type_counts[h.get("type", "")] = type_counts.get(h.get("type", ""), 0) + 1
    out = {}
    for h in holdings:
        names = [h.get("name", "").lower()]
        if type_counts.get(h.get("type", "")) == 1:
            names += _TYPE_ALIASES.get(h.get("type", ""), [])
        out[h.get("name", "")] = [n for n in names if n]
    return out


def _mentions(clause: str, aliases: list[str]) -> bool:
    return any(re.search(r"\b" + re.escape(a) + r"s?\b", clause) for a in aliases)


def contradicts(text: str, data: dict) -> bool:
    """True if the answer calls an in-profit holding a loser, or the reverse."""
    aliases = _aliases(data)
    profit, loss = set(data.get("inProfit", [])), set(data.get("atLoss", []))
    for clause in _CLAUSE_SPLIT.split(text.lower()):
        if not clause.strip() or _NEGATED.search(clause):
            continue
        named = {n for n, a in aliases.items() if _mentions(clause, a)}
        if len(named) != 1:              # none, or several: can't tell who the verb is about
            continue
        name = named.pop()
        if name in profit and _LOSS.search(clause) and not _GAIN.search(clause):
            return True
        if name in loss and _GAIN.search(clause) and not _LOSS.search(clause):
            return True
    return False


def strip_trade_advice(text: str) -> str:
    """Drop every line or sentence telling the user to buy, sell or move money."""
    out = []
    for line in text.split("\n"):
        if not _TRADE.search(line):
            out.append(line)
            continue
        if re.match(r"\s*(\d+[.)]|[-*•])\s", line):
            continue                                            # a list item: drop it whole
        kept = [s for s in re.split(r"(?<=[.!?])\s+", line) if not _TRADE.search(s)]
        if kept:
            out.append(" ".join(kept))
    text = "\n".join(out)
    text = _renumber(text)
    # A section heading left with nothing under it
    text = re.sub(r"(?m)^[ \t]*\*\*[^*\n]+\*\*:?[ \t]*\n(?=\s*(?:\*\*|\Z))", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _renumber(text: str) -> str:
    out, n = [], 0
    for line in text.split("\n"):
        m = re.match(r"(\s*\[?)(\d+)([.)]\s)", line)
        if m:
            n += 1
            line = f"{m.group(1)}{n}{m.group(3)}" + line[m.end():]
        elif line.strip():
            n = 0
        out.append(line)
    return "\n".join(out)


def check(text: str, data: dict, fallback_intent: str = "overview") -> tuple[str, bool]:
    """
    (answer to show, whether the model's own answer survived). A contradiction
    means the prose can't be trusted at all, so the answer is rebuilt from the
    figures; trade advice is only cut out.
    """
    if contradicts(text, data):
        return compose(fallback_intent, data), False
    cleaned = strip_trade_advice(text)
    if len(cleaned) < 40:
        return compose(fallback_intent, data), False
    return cleaned, True
