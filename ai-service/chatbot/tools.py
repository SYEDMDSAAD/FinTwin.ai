"""
Tool definitions + dispatcher for the copilot's function-calling loop.

Each tool maps to one backend internal API endpoint. The model asks for
data; we fetch it; the model composes the answer from real rows — it never
receives a pre-attached data dump and never has to invent numbers.
"""

import json
import logging

from utils import backend_api

logger = logging.getLogger(__name__)

# Ollama/OpenAI-style tool schemas. Kept to four focused tools — small
# models pick the right tool far more reliably from a short list.
# Holding types as the portfolio stores them.
PORTFOLIO_TYPES = ["Stocks", "Mutual Fund", "Fixed Deposit", "PPF", "NPS", "Gold",
                   "Crypto", "Bonds", "IPO", "Other"]

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_transactions",
            "description": (
                "Fetch the user's individual transactions. Use for any question about "
                "specific transactions: 'top N spends', 'list my X transactions', "
                "'what did I spend at Y', 'biggest expenses this month'. "
                "For money RECEIVED (income, salary, credits, 'where did I get money') "
                "set type='income' and DO NOT pass category — received money can be "
                "recorded under any category. "
                "For 'where/who did I receive the MOST money from' or 'top income "
                "sources' also set group_by='merchant' — this sums ALL matching "
                "transactions per sender and returns totals, which single rows cannot."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "description": "Filter to one category, e.g. 'Other', 'Food'. Omit for all categories.",
                    },
                    "sort": {
                        "type": "string",
                        "enum": ["amount", "date"],
                        "description": "'amount' = biggest first (for top-N questions), 'date' = newest first.",
                    },
                    "type": {
                        "type": "string",
                        "enum": ["expense", "income", "all"],
                        "description": (
                            "'expense' = money spent (default). "
                            "'income' = money received/credited — use for any "
                            "question about receiving, earning, or getting money."
                        ),
                    },
                    "limit": {
                        "type": "integer",
                        "description": "How many to return (1-25). Default 10.",
                    },
                    "months": {
                        "type": "integer",
                        "description": "How many months back to look (1-12). Default 3.",
                    },
                    "group_by": {
                        "type": "string",
                        "enum": ["merchant", "category"],
                        "description": (
                            "Aggregate instead of listing rows: sum every matching "
                            "transaction per merchant (sender/payee) or per category "
                            "and return the biggest totals first. Use for 'most money "
                            "from', 'top sources', 'which merchant/category overall'."
                        ),
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_budgets",
            "description": (
                "Fetch every budget with its monthly limit, amount spent so far, amount "
                "remaining, and whether it is exceeded. Use for any budget question."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_goals",
            "description": (
                "Fetch the user's financial goals with precomputed counts (totalGoals, "
                "completedGoals, ongoingGoals) and per-goal status ('Completed' or "
                "'Ongoing'), target, saved so far, progress %, health. Use for any "
                "question about goals, how many goals, or saving plans. Quote the "
                "counts and statuses as returned — never recount or reclassify."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_net_worth",
            "description": (
                "Fetch assets, liabilities (loans with EMI and interest rate), insurance "
                "policies, and the overall net worth. Use for questions about loans, EMIs, "
                "insurance, or overall wealth. For anything about investments, use "
                "get_portfolio instead."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_portfolio",
            "description": (
                "Fetch the user's investment portfolio: every holding (stocks, mutual "
                "funds, FDs, PPF, gold, crypto, IPOs) with amount invested, current value, "
                "gain and return %, units, purchase date, plus portfolio totals, allocation "
                "by type, and the best and worst performer. Use for any question about "
                "investments, returns, profit/loss, mutual funds, stocks, SIPs or "
                "diversification. All sums and percentages are precomputed — quote them, "
                "never recalculate; 'summary' and 'perHolding' are ready-made sentences to "
                "quote. Each holding's 'valuation' says whether its value is a market "
                "price, an estimate, or a figure the user typed in; say so when it is not "
                "a market price."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": PORTFOLIO_TYPES,
                        "description": (
                            "Only when the question is about ONE kind of investment "
                            "('my mutual funds', 'my stocks', 'my FD'). Omit for the "
                            "whole portfolio."
                        ),
                    },
                },
                "required": [],
            },
        },
    },
]


def execute_tool(name: str, args: dict, user_id: int) -> str:
    """Run one tool call against the backend; returns a JSON string for the model."""
    try:
        if name == "get_transactions":
            params = {
                # Default to biggest-first: "top/most" questions are the common
                # case and a wrong "most" is worse than a wrong order for
                # "recent" questions (the model passes sort=date explicitly there).
                "sort":   args.get("sort", "amount"),
                "type":   args.get("type", "expense"),
                "limit":  int(args.get("limit", 10)),
                "months": int(args.get("months", 3)),
            }
            if args.get("category"):
                params["category"] = str(args["category"])
            if args.get("group_by") in ("merchant", "category"):
                params["groupBy"] = args["group_by"]
            result = backend_api.get(f"/{user_id}/transactions", params)
        elif name == "get_budgets":
            result = backend_api.get(f"/{user_id}/budgets")
        elif name == "get_goals":
            result = backend_api.get(f"/{user_id}/goals")
        elif name == "get_net_worth":
            result = backend_api.get(f"/{user_id}/networth")
        elif name == "get_portfolio":
            params = {"type": args["type"]} if args.get("type") in PORTFOLIO_TYPES else None
            result = backend_api.get(f"/{user_id}/portfolio", params)
        else:
            return json.dumps({"error": f"Unknown tool '{name}'"})
        # ensure_ascii=False: escaped "\u20b9" was copied into answers verbatim
        return json.dumps(result, default=str, ensure_ascii=False)
    except (RuntimeError, ValueError, TypeError) as e:
        logger.warning("Tool %s failed: %s", name, e)
        return json.dumps({"error": str(e)})
