"""Affordability answered from the user's own figures, not by asking for them."""

import pytest

from chatbot import affordability as af
from chatbot.advisor import generate_financial_advice

DATA = {"userId": 8, "income": 62000, "expenses": 47000, "savings": 15000,
        "savingsRatio": 24, "financialScore": 68, "categorySpending": {},
        "dataFrom": "2025-11-01", "dataThrough": "2026-01-09"}


@pytest.mark.parametrize("question", [
    "Can I afford a car?", "can i afford a ₹8,50,000 car", "Am I able to afford this?",
    "can i buy a 65k laptop", "Could I afford an iPhone?",
])
def test_recognises_the_question(question):
    assert af.asks_about_affording(question)


@pytest.mark.parametrize("question", [
    "How much did I spend on food?", "what are my top merchants", "how are my investments doing",
])
def test_leaves_other_questions_alone(question):
    assert not af.asks_about_affording(question)


@pytest.mark.parametrize("question, expected", [
    ("can i afford a ₹8,50,000 car", 850000),
    ("Can I afford a 12 lakh car?", 1200000),
    ("can i buy a 65k laptop", 65000),
    ("afford a 1.2 crore flat", 12000000),
    ("Can I afford a car?", None),
    ("can i afford a 2 bhk", None),            # not a price
    # A word starting with a unit letter is not a unit (found by the copilot eval:
    # "laptop" read as lakh made a ₹65,000 laptop cost ₹650 crore)
    ("Can I afford a ₹65,000 laptop?", 65000),
    ("can i afford a ₹45,000 lens", 45000),
    ("can i afford a ₹3,000 kettle", 3000),
    ("can i afford a ₹20,000 cruise", 20000),
])
def test_reads_the_price_the_user_named(question, expected):
    assert af.price_in(question) == expected


def test_without_a_price_it_states_their_figures_and_asks_only_the_price():
    out = af.answer("Can I afford a car?", DATA)
    assert "₹62,000" in out and "₹47,000" in out and "₹15,000" in out
    assert "up to 2026-01-09" in out          # says what the figures cover
    assert "What does the one you're looking at cost?" in out
    assert "how much do you" not in out.lower()          # never asks for figures it has


def test_with_a_price_it_works_it_out():
    out = af.answer("can i buy a 65k laptop", DATA)
    assert "₹65,000" in out
    assert "4 months of your saving" in out
    assert "isn't financial advice" in out


def test_nothing_left_over_is_said_plainly():
    out = af.answer("can i afford a 50k phone", {**DATA, "income": 30000, "expenses": 32000, "savings": -2000})
    assert "not affordable" in out and "nothing is left over" in out


def test_no_data_falls_through_to_the_model():
    assert af.answer("Can I afford a car?", {"income": 0, "expenses": 0, "savings": 0}) is None


def test_the_copilot_answers_without_calling_the_model(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("the model should not be asked")

    monkeypatch.setattr("chatbot.advisor.chat", boom)
    trace = {}
    reply = generate_financial_advice("Can I afford a car?", DATA, "Purchase Advisor", trace)
    assert trace["path"] == "affordability_direct"
    assert "₹15,000" in reply


# ── The price, given as a follow-up ───────────────────────────────────────────

# The figures from the conversation that went wrong (2026-10-02)
SCREENSHOT = {"userId": 8, "income": 37910, "expenses": 30929, "savings": 6981,
              "savingsRatio": 18, "financialScore": 60, "categorySpending": {},
              "dataThrough": "2026-09-22"}


def _after_we_asked_the_price(data):
    first = af.answer("Can I afford a car?", data)
    return [{"message": "Can I afford a car?", "reply": first}]


def test_a_bare_price_after_we_asked_for_it_goes_back_to_the_calculator(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("the model should not be asked")

    monkeypatch.setattr("chatbot.advisor.chat", boom)
    monkeypatch.setattr("chatbot.advisor.ask", boom)
    data = {**SCREENSHOT, "conversationHistory": _after_we_asked_the_price(SCREENSHOT)}
    trace = {}

    reply = generate_financial_advice("10lakhs", data, "Savings Advisor", trace)

    assert trace["path"] == "affordability_direct"
    assert "₹10,00,000" in reply
    # ₹10,00,000 / ₹6,981 a month = 143 months. The model had divided by the
    # income instead (26.4 months) and called it "within 2 years".
    assert "about 12 years of everything you save" in reply


@pytest.mark.parametrize("message", ["10lakhs", "around 8 lakh", "₹8,50,000", "65k"])
def test_recognises_a_price_reply(message):
    assert af.is_price_reply(message, _after_we_asked_the_price(DATA))


@pytest.mark.parametrize("message, history", [
    ("10lakhs", []),                                                       # nothing asked yet
    ("10lakhs", [{"message": "hi", "reply": "Hello! How can I help?"}]),   # we didn't ask a price
    ("never mind, show my budgets", None),                                 # no price in it
])
def test_other_messages_are_not_price_replies(message, history):
    if history is None:
        history = _after_we_asked_the_price(DATA)
    assert not af.is_price_reply(message, history)
