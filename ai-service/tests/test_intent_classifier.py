"""Unit tests for chatbot.intent_classifier — pure regex, no mocks needed."""
import pytest

from chatbot.intent_classifier import classify_intent


@pytest.mark.parametrize("message,expected", [
    ("I think there was fraud on my account", "FRAUD"),
    ("This transaction looks suspicious", "FRAUD"),
    ("Someone made an unauthorized transaction", "FRAUD"),
    ("Cancel my Netflix subscription", "SUBSCRIPTIONS"),
    ("What recurring payments do I have?", "SUBSCRIPTIONS"),
    ("How can I improve my financial score?", "FINANCIAL_SCORE"),
    ("What's my CIBIL score?", "FINANCIAL_SCORE"),
    ("Can I afford a new laptop?", "AFFORDABILITY"),
    ("Is this a good deal on the phone?", "AFFORDABILITY"),
    ("Should I buy a new phone?", "PURCHASE"),
    ("I want to order a laptop", "PURCHASE"),
    ("Should I invest in mutual funds?", "INVESTMENT"),
    ("What's the best SIP for me?", "INVESTMENT"),
    ("How is the nifty performing?", "INVESTMENT"),
    ("Help me set a budget", "BUDGET"),
    ("I think I overspend every month", "BUDGET"),
    ("How can I save more money?", "SAVINGS"),
    ("I want to build an emergency fund", "SAVINGS"),
    ("How much am I spending on food?", "SPENDING"),
    ("Where is my money going?", "SPENDING"),
    ("I want a target for vacation", "GOAL"),
    ("Help me plan for retirement", "GOAL"),
    ("What's my net worth?", "NET_WORTH"),
    ("What are my total assets?", "NET_WORTH"),
])
def test_classify_intent_matches_expected(message, expected):
    assert classify_intent(message) == expected


def test_classify_intent_general_fallback():
    assert classify_intent("Hello, how are you today?") == "GENERAL"


def test_classify_intent_empty_string_is_general():
    assert classify_intent("") == "GENERAL"


def test_classify_intent_case_insensitive():
    assert classify_intent("FRAUD ALERT ON MY ACCOUNT") == "FRAUD"


def test_classify_intent_first_match_wins_priority_order():
    # "fraud" and "spend" both present — FRAUD pattern is checked first (more specific)
    assert classify_intent("Is this suspicious spending fraud?") == "FRAUD"
