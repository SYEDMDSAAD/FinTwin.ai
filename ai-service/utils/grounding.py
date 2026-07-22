"""Shared guardrail for model prose that quotes figures.

Every feature that lets a 3B model write about the user's money has the same
failure mode: it invents an amount, or pins a real amount to the wrong thing.
The spending coach solved that once; the goal planner needs the identical
check, so the primitives live here rather than being reimplemented — a second
copy would drift, and the copy that drifts is the one that lets a hallucinated
rupee figure onto the page.

The contract is narrow on purpose: a prompt states figures, the model's reply
may only reuse them. Nothing here understands finance — it understands which
numbers were licensed and who they belong to.
"""
import re

# Rupee amounts however the model spells them. Prompts always write "₹1,234",
# but the guard must catch figures in every form the model emits — an invented
# "Rs. 3,700" is exactly as wrong as an invented "₹3,700", and a ₹-only
# pattern waves it through.
_AMOUNT = re.compile(
    r"(?:₹|\bRs\.?\s?|\bINR\s?)\s?([\d,]+)|([\d,]+)\s+rupees\b",
    re.IGNORECASE,
)
_ENTITY = re.compile(r"\b[A-Z][A-Za-z&]{3,}\b")

_FIGURE = re.compile(
    r"(?:₹|\bRs\.?\s?|\bINR\s?)\s?[\d,]+|[\d,]+\s+rupees\b|\d+(?:\.\d+)?%",
    re.IGNORECASE,
)
_PERCENT = re.compile(r"\d+(?:\.\d+)?%")
# Sentence breaks, except the decimal point inside a figure like "97.2%".
_SENTENCE = re.compile(r"(?<!\d)[.!?]+(?!\d)")

# Capitalised words that open sentences or start imperatives, and so name
# nothing. Anything left is treated as a merchant or category.
_NON_ENTITIES = {"your", "this", "cancel", "reduce", "save", "move", "split",
                 "keep", "start", "stop", "month", "months", "goal", "target",
                 "they", "their", "them", "there", "with", "that", "then"}


def amounts(text: str) -> set[int]:
    """Every rupee amount in `text`, normalised to plain integers."""
    return {int((a or b).replace(",", ""))
            for a, b in _AMOUNT.findall(text) if (a or b).replace(",", "")}


def entities(text: str) -> set[str]:
    """Capitalised words — merchants and categories — minus sentence openers."""
    return {w.lower() for w in _ENTITY.findall(text)} - _NON_ENTITIES


def canon_figure(figure: str) -> str:
    """'Rs. 1,234', 'INR 1234' and '1,234 rupees' all mean '₹1,234'.

    The owners map is keyed by the prompt's spelling; the model's spelling has
    to collapse to the same key or ownership checks silently stop applying.
    """
    if figure.endswith("%"):
        return figure.replace(" ", "")
    digits = "".join(c for c in figure if c.isdigit() or c == ",")
    return "₹" + digits


def figure_owners(prompt: str) -> dict[str, set[str]]:
    """Which merchants and categories each figure in the prompt belongs to.

    Only bullet lines are scanned: a bullet is one claim about one subject, so
    the figures on it genuinely belong to the entities on it. Prose paragraphs
    mention several subjects at once and would license any pairing.
    """
    owners: dict[str, set[str]] = {}
    for line in prompt.splitlines():
        if not line.startswith("- "):
            continue
        named = entities(line)
        for figure in _FIGURE.findall(line):
            owners.setdefault(canon_figure(figure), set()).update(named)
    return owners


def is_grounded(text: str, allowed: set[int], owners: dict[str, set[str]]) -> bool:
    """True when every figure in `text` is real *and* attached to the right thing.

    Three ways a figure goes wrong, all checked here. It can be invented
    outright ("₹3,700"). It can be a percentage the model made up as a target
    ("cut by 20%") — real-sounding, backed by nothing. Or it can be a genuine
    number pinned to the wrong subject: "Netflix is up 97.2%" when the 97.2%
    belongs to Food & Dining, where the figure is real but the sentence is not.
    """
    if amounts(text) - allowed:
        return False

    # Percentages are only legitimate where the analysis produced them; a
    # target the model invented is indistinguishable, to the reader, from a
    # measurement.
    if {p for p in _PERCENT.findall(text)} - set(owners):
        return False

    # Ownership can only be judged against subjects the prompt actually
    # names. An arbitrary capitalised word — usually the imperative verb
    # opening a step ("Adjust food and dining by cutting ₹2,400") — must not
    # count as "the sentence is about Adjust" and veto a correct figure.
    # Wrong-subject checks still fire whenever a *known* subject is named.
    known: set[str] = set().union(*owners.values()) if owners else set()

    for sentence in _SENTENCE.split(text):
        named = entities(sentence) & known
        if not named:
            continue
        for figure in _FIGURE.findall(sentence):
            belongs_to = owners.get(canon_figure(figure))
            if belongs_to and not named & belongs_to:
                return False
    return True
