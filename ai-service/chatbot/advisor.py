import logging

from chatbot.intent_classifier import classify_intent
from chatbot.prompt_engine import build_financial_context, format_history_block
from utils.ollama_client import ask

logger = logging.getLogger(__name__)

_FALLBACK = """\
**Summary**
FinTwin AI encountered a temporary issue.

**Key Risks**
AI service could not process financial analysis right now.

**Recommendations**
Retry after a few seconds. Check that Ollama is running (ollama serve).

**Verdict**
Temporary AI service interruption."""


def generate_financial_advice(message: str, financial_data: dict, mode: str) -> str:
    try:
        intent = classify_intent(message)
        financial_context = build_financial_context(financial_data)
        history_text = format_history_block(financial_data.get("conversationHistory", []))

        prompt = f"""You are FinTwin AI, an elite AI financial advisor for Indian users.

CRITICAL RULES:
- ALWAYS use ₹ (Indian Rupee) for ALL currency amounts. Never use $ or USD.
- Give personalized advice using the user's real financial data below.
- Be concise, intelligent, and actionable.
- Remember previous conversations and connect them to current questions.

AI Mode: {mode}
Mode behaviour:
- Savings Advisor: focus on saving money, reducing expenses, improving savings ratio.
- Investment Advisor: focus on SIPs, mutual funds, wealth growth, risk diversification.
- Budget Coach: focus on budget discipline, overspending alerts, spending limits.
- Fraud Analyst: focus on anomaly detection, suspicious activity, risk warnings.
- Purchase Advisor: focus on affordability, EMI impact, purchase timing, financial risk.

User Intent: {intent}

{financial_context}{history_text}

User Question: {message}

Respond in this format:

**Summary**
[brief personalized summary]

**Key Risks**
[specific risks based on their data]

**Recommendations**
[3-5 actionable steps with ₹ amounts where relevant]

**Verdict**
[one-line verdict]"""

        return ask(prompt)

    except RuntimeError as e:
        logger.error("Ollama unavailable in advisor: %s", e)
        return _FALLBACK
    except Exception as e:
        logger.exception("Unexpected error in advisor: %s", e)
        return _FALLBACK
