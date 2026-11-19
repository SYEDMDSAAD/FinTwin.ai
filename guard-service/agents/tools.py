"""Tools the Payday Planner calls.

They read the user's budgets and goals from this conversation's state, which
main.py fills from FinTwin before the agent starts. The tool token and user
id never enter the state, so nothing the model does can reach another user
or the backend directly.
"""
from google.adk.tools import ToolContext


def get_budgets(tool_context: ToolContext) -> dict:
    """The user's monthly budgets: each category's limit, what's spent so far this month,
    and whether it's an essential that must always be covered."""
    return {"budgets": tool_context.state.get("budgets", [])}


def get_goals(tool_context: ToolContext) -> dict:
    """The user's savings goals: the target, what's saved so far, and the amount a month
    that finishes the goal on time."""
    return {"goals": tool_context.state.get("goals", [])}
