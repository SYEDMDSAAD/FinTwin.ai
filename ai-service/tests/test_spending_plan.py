"""Spending patterns and "how can I save more", answered with every figure worked out in code."""

import pytest

from chatbot import spending_plan as sp
from chatbot.advisor import generate_financial_advice

# Three months (Jul–Sep). categorySpending is the window total, as the backend sends it.
DATA = {"userId": 8, "income": 37910, "expenses": 30929, "savings": 6981, "savingsRatio": 18,
        "financialScore": 60, "dataFrom": "2026-07-15", "dataThrough": "2026-09-22",
        "categorySpending": {"Investments": 36840, "Rent": 24000, "Food": 9600, "Shopping": 6000,
                             "Entertainment": 5997, "Bills": 7500, "Travel": 5905, "Transfer": 20000},
        "subscriptions": ["Netflix"], "budgetAlerts": ["Food exceeded by 12%"],
        "conversationHistory": []}

CAR_CHAT = [
    {"message": "Can I afford a car?", "reply": "On what you've recorded ... Tell me the price and I'll work it through."},
    {"message": "about 10 lakhs INR", "reply": "On what you've recorded (from ...): ₹10,00,000 is ..."},
]


@pytest.mark.parametrize("question", [
    "Check my spending patterns", "where does my money go?", "Analyse my spending",
    "how can I save more", "How do I reduce my expenses?", "boost my finances",
    "Check my spending patterns and tell how can I boost my finances to buy the car as soon as possible",
])
def test_recognises_the_question(question):
    assert sp.asks_for_plan(question)


@pytest.mark.parametrize("question", [
    "How much did I spend on food last month?",       # a lookup: the tools answer it
    "Analyze my subscriptions",
    "Can I afford a car?",
    "What are my top 5 expenses?",
    "how can I grow my investments?",                  # the portfolio tools answer these
    "how can I improve my portfolio?",
])
def test_leaves_other_questions_alone(question):
    assert not sp.asks_for_plan(question)


def test_category_totals_become_monthly_figures():
    reply = sp.answer("Check my spending patterns", DATA)
    assert "Rent: ₹8,000" in reply            # ₹24,000 over three months
    assert "Food: ₹3,200" in reply


def test_investing_is_saving_not_spending():
    reply = sp.answer("Check my spending patterns", DATA)
    assert "Investments: ₹12,280" in reply    # ₹36,840 / 3
    assert "put away about **₹19,261**" in reply    # ₹6,981 left over + ₹12,280 invested
    assert "Transfer" not in reply            # moving between your own accounts isn't spending


def test_only_flexible_spending_is_offered_as_a_cut():
    reply = sp.answer("how can I save more", DATA)
    trims = reply.split("**Where you could free up money**")[1].split("\n\n")[0]
    assert "Food: ₹3,200 → ₹2,400" in trims
    assert "Rent" not in trims and "Bills" not in trims and "Investments" not in trims
    # 25% of food 3,200 + shopping 2,000 + entertainment 1,999 + travel 1,968
    assert "about **₹2,292 more a month**" in reply


def test_the_trims_shown_add_up_to_the_total_given():
    import re
    from evals import copilot_fixture as fx
    reply = sp.answer("how can I save more", fx.financial_data())
    trims = reply.split("**Where you could free up money**")[1].split("Together")[0]
    shown = sum(int(x.replace(",", "")) for x in re.findall(r"frees \*\*₹([\d,]+)\*\*", trims))
    total = int(re.search(r"about \*\*₹([\d,]+) more a month", reply).group(1).replace(",", ""))
    assert abs(shown - total) <= len(re.findall("frees", trims))       # rounding, ₹1 a line at most


def test_works_out_the_purchase_discussed_earlier():
    reply = sp.answer("Check my spending patterns and tell how can I boost my finances to buy the car "
                      "as soon as possible", {**DATA, "conversationHistory": CAR_CHAT})
    assert "**Saving for ₹10,00,000**" in reply
    assert "(₹6,981 a month): about 11.9 years" in reply      # 10,00,000 / 6,981
    assert "(₹9,273 a month): about 9.0 years" in reply       # with the trims
    assert "(₹19,261 a month): about 4.3 years" in reply      # counting investments


def test_no_purchase_unless_asked_about_one():
    reply = sp.answer("Check my spending patterns", {**DATA, "conversationHistory": CAR_CHAT})
    assert "Saving for" not in reply


def test_mentions_recurring_payments_and_budget_overruns():
    reply = sp.answer("where does my money go", DATA)
    assert "Netflix" in reply
    assert "Food exceeded by 12%" in reply


def test_no_data_falls_through_to_the_model():
    assert sp.answer("Check my spending patterns", {"income": 0, "expenses": 0}) is None
    assert sp.answer("Check my spending patterns", {**DATA, "categorySpending": {}}) is None


def test_the_copilot_answers_without_calling_the_model(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("the model should not be asked")

    monkeypatch.setattr("chatbot.advisor.chat", boom)
    monkeypatch.setattr("chatbot.advisor.ask", boom)
    trace = {}
    reply = generate_financial_advice("Check my spending patterns", DATA, "Savings Advisor", trace)
    assert trace["path"] == "spending_plan_direct"
    assert "₹12,280" in reply
