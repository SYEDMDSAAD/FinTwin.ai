"""Portfolio answers for the voice: short, with figures rounded the way people say them."""
from chatbot.portfolio_answers import say_rupees, spoken

DATA = {
    "holdingCount": 3, "currentValueFormatted": "₹1,70,733.51", "totalInvestedFormatted": "₹1,53,200",
    "totalGainPercent": 11.44,
    "allocation": ["Mutual Fund: 61.9% (₹1,05,700)", "PPF: 32.1% (₹54,743.51)", "Stocks: 6.0% (₹10,290)"],
    "inProfit": ["Index Fund", "PPF Account"], "atLoss": ["Some Stock"],
    "holdings": [{"name": "Index Fund", "gainPercent": 19.67}, {"name": "PPF Account", "gainPercent": 14.05},
                 {"name": "Some Stock", "gainPercent": -32.3}],
}


def test_rupees_are_said_in_lakh_and_crore():
    assert say_rupees("₹1,70,733.51") == "about ₹1.7 lakh"
    assert say_rupees("₹2,00,00,000") == "about ₹2 crore"
    assert say_rupees("₹10,290") == "about ₹10,300"
    assert say_rupees("₹499") == "₹499"


def test_overview_names_best_and_worst_in_two_sentences():
    assert spoken("overview", DATA) == (
        "Your portfolio of 3 holdings is worth about ₹1.7 lakh, up 11 percent on the ₹1.5 lakh you put in. "
        "Index Fund is doing best, up 20 percent, and Some Stock is down 32 percent.")


def test_losers_and_allocation():
    assert spoken("losing", DATA).startswith("Some Stock is at a loss. Your portfolio")
    assert spoken("allocation", DATA).startswith("By value, your portfolio is Mutual Fund 62 percent, PPF 32 percent and Stocks 6 percent.")
    assert spoken("overview", {"holdingCount": 0}) == "You don't have any investments recorded in FinTwin yet."
