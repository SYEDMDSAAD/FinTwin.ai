"""The one door every AI feature uses to reach a language model.

    LLM_PROVIDER=ollama   (default)  qwen2.5:3b through a local Ollama   — utils/ollama_client.py
    LLM_PROVIDER=bedrock             Claude through Amazon Bedrock       — utils/bedrock_client.py

Both providers take the same arguments and return the same shapes, so the
seven features (copilot, coach, goal planner, report, categories,
investments, advisor) don't know which model answered. Ollama-only options
(num_ctx, keep_alive) are ignored by Bedrock; Claude-only ones live in the
Bedrock client's own environment variables.

The switch is read once at import: changing provider means restarting the
service, so one process never mixes two models' conversations.
"""
import os

PROVIDER = os.environ.get("LLM_PROVIDER", "ollama").strip().lower()

if PROVIDER == "bedrock":
    from utils import bedrock_client as _impl
elif PROVIDER == "ollama":
    from utils import ollama_client as _impl
else:
    raise RuntimeError(f"LLM_PROVIDER must be 'ollama' or 'bedrock', not {PROVIDER!r}")

MODEL = _impl.MODEL


def ask(prompt: str, max_tokens: int = 512, timeout: float = 120.0,
        num_ctx: int = 2048, temperature: float = 0.3, json_mode: bool = False,
        feature: str = "other") -> str:
    """One-shot generation: prompt in, text out. See ollama_client.ask()."""
    return _impl.ask(prompt, max_tokens=max_tokens, timeout=timeout, num_ctx=num_ctx,
                     temperature=temperature, json_mode=json_mode, feature=feature)


def chat(messages: list[dict], tools: list[dict] | None = None,
         max_tokens: int = 512, timeout: float = 120.0, feature: str = "other") -> dict:
    """One conversation turn, optionally with tools. See ollama_client.chat().

    Returns the assistant message as a dict: "content" (text) and, when the
    model wants data, "tool_calls" ([{"function": {"name", "arguments"}}]).
    Append it to `messages` unchanged — a provider may carry state in it.
    """
    return _impl.chat(messages, tools=tools, max_tokens=max_tokens, timeout=timeout,
                      feature=feature)
