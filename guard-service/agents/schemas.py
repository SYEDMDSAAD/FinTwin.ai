"""The answer each agent must return. Gemini is held to these shapes
(structured output), and rules.py then checks the content."""
from typing import Literal

from pydantic import BaseModel, Field


class ScanDecision(BaseModel):
    decision: Literal["go", "pause"] = Field(
        description="go: the payment goes straight through. pause: show the message first.")
    message: str = Field(
        description="Pause only: one or two short sentences naming the trade-off with numbers "
                    "from FACTS. Empty for go.")
    show_wishlist: bool = Field(
        description="True only when pausing a purchase that can wait two days (shopping, "
                    "entertainment, travel).")


class TopupDecision(BaseModel):
    decision: Literal["approve", "approve_less", "wait", "wishlist"]
    suggested_amount: int | None = Field(
        default=None, description="approve_less only: whole rupees, below the request.")
    message: str = Field(description="One or two short sentences explaining the decision.")


class LocalTopupDecision(TopupDecision):
    """The same answer for small local models, which often leave suggested_amount out:
    Ollama holds the model to this shape while it writes, so a number is always there.
    rules.check_topup reads it only for approve_less."""
    suggested_amount: int = Field(
        description="Whole rupees. approve_less: the smaller amount to move, below the request. Otherwise 0.")


class Cut(BaseModel):
    kind: Literal["category", "next_allowance", "next_month", "goal"]
    name: str = Field(description="The source's name exactly as written in FACTS.sources.")
    amount: int = Field(description="Whole rupees this source gives.")


class Cuts(BaseModel):
    cuts: list[Cut] = Field(description="One to three cuts that add up to exactly FACTS.amount.")
    message: str = Field(description="One short sentence saying where the money comes from.")


class GoalShare(BaseModel):
    goal: str = Field(description="The goal's title exactly as get_goals returns it.")
    amount: int = Field(description="Whole rupees for this goal this month; 0 is allowed.")


class PaydayPlan(BaseModel):
    goals: list[GoalShare]
    buffer: int = Field(description="Whole rupees that stay in the main account.")
    weekly: list[int] = Field(description="Exactly four weekly allowances, in whole rupees.")
    message: str = Field(description="Two short sentences explaining the split.")
