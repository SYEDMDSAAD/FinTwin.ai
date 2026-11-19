"""How every decision gets made: ask the agent, check its answer, fall back to rules.

    agent answers ─► rules.py checks it ─► passes: use it        (source "ai")
                                       └► broken: tell the agent why, ask again
    no answer in time, a model error, or still broken after the last attempt
                                          ─► the fixed rules decide (source "fallback")

A payment check never waits on the AI for longer than its time budget, and
the code (not the model) has the last word on every number.
"""
import asyncio
import logging
import time

from agents.brain import BadAnswer, ModelError
from rules import AnswerRejected

logger = logging.getLogger(__name__)


async def consult(brain, key: str, text: str, check, *, attempts: int, budget_s: float,
                  state: dict | None = None):
    """Returns (checked answer, None) or (None, why it failed)."""
    deadline = time.monotonic() + budget_s
    conv = brain.conversation(key, state)
    reason = "no_answer"
    try:
        message = text
        for _ in range(attempts):
            left = deadline - time.monotonic()
            if left < 0.5:
                return None, "timeout"
            try:
                answer = await asyncio.wait_for(conv.ask(message), timeout=left)
            except TimeoutError:
                return None, "timeout"
            except ModelError as e:
                return None, f"model_error:{e}"
            except BadAnswer as e:
                reason = f"bad_format:{e}"
                message = f"Your answer was rejected: {e}. Answer again in the required format."
                continue
            try:
                return check(answer), None
            except AnswerRejected as e:
                reason = f"rejected:{e}"
                message = f"Your answer was rejected: {e}. Fix that and answer again."
        return None, reason
    finally:
        try:
            await conv.close()
        except Exception:      # cleanup only; never fail a decision over it
            logger.debug("couldn't close the agent session", exc_info=True)


async def decide(brain, key: str, text: str, check, fallback, *, persona: bool, data_ok: bool,
                 attempts: int, budget_s: float, state: dict | None = None):
    """Returns (decision, source, reason). source is "ai" or "fallback"."""
    why_not = brain.availability(persona)
    if why_not is None and not data_ok:
        why_not = "no_data"        # FinTwin couldn't be read: don't let the model guess
    if why_not is None:
        result, why_not = await consult(brain, key, text, check, attempts=attempts,
                                        budget_s=budget_s, state=state)
        if result is not None:
            return result, "ai", None
        logger.info("%s agent fell back to rules: %s", key, why_not.split(":")[0])
    return fallback(), "fallback", why_not
