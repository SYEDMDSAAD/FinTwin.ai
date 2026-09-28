"""Claude through Amazon Bedrock, behind the same ask()/chat() as Ollama.

Selected with LLM_PROVIDER=bedrock (see utils/llm_client.py). Configuration:

    AWS_REGION               required — where the Bedrock endpoint lives
    BEDROCK_MODEL            default anthropic.claude-opus-5
    BEDROCK_FALLBACK_MODEL   default anthropic.claude-opus-4-8 (used when the
                             main model declines a request on safety grounds)
    BEDROCK_EFFORT           low | medium | high (default) | xhigh | max
    AWS credentials          the standard chain: env keys, profile, or the
                             App Service / EC2 identity

What differs from qwen, and how it's handled here:

- Claude thinks before answering (adaptive thinking, on by default) and its
  thinking counts toward max_tokens. The features' max_tokens were sized for
  qwen's answer alone, so they're raised to a floor here; the prompts still
  ask for short answers.
- Temperature isn't accepted by this model family, so it's not sent.
- Tool calls carry ids, and the assistant's content (thinking included) must
  go back unchanged in the next request. chat() returns the familiar Ollama
  shape plus "_anthropic_content", which the advisor's loop appends as-is.
- The advisor sends mid-loop instructions as {"role": "system"} messages;
  they're passed as a text block after that turn's tool results.
- A safety refusal from the main model is retried on the fallback model by
  the SDK's client-side middleware (Bedrock has no server-side fallbacks).
"""
import json
import logging
import os
import time

import anthropic
import requests
from anthropic import AnthropicBedrockMantle, BetaFallbackState, BetaRefusalFallbackMiddleware

from utils.metrics import record_llm_usage

logger = logging.getLogger(__name__)

MODEL = os.environ.get("BEDROCK_MODEL", "anthropic.claude-opus-5")
FALLBACK_MODEL = os.environ.get("BEDROCK_FALLBACK_MODEL", "anthropic.claude-opus-4-8")
EFFORT = os.environ.get("BEDROCK_EFFORT", "high")

# Thinking shares max_tokens with the answer; below this a short answer can be
# cut off by the model's own reasoning.
_MIN_MAX_TOKENS = 4096

_client = None


class ClaudeTimeout(requests.exceptions.ReadTimeout):
    """A call that ran out of its time budget.

    A ReadTimeout on purpose: the features already treat that as "out of
    time, answer now" (the copilot's budget, category batches), so they
    behave the same whichever provider timed out.
    """


def _get_client() -> AnthropicBedrockMantle:
    """Created on first use, so importing this module needs no AWS setup."""
    global _client
    if _client is None:
        _client = AnthropicBedrockMantle(
            aws_region=os.environ.get("AWS_REGION") or None,
            # Each feature passes its own time budget; the SDK's retries would
            # multiply it, so retry once at most.
            max_retries=1,
            middleware=[BetaRefusalFallbackMiddleware([{"model": FALLBACK_MODEL}])],
        )
    return _client


# ── Format conversion ─────────────────────────────────────────────────────────

def _tools(tools: list[dict] | None) -> list[dict]:
    """Ollama/OpenAI-style schemas → Claude tool definitions."""
    out = []
    for t in tools or []:
        fn = t.get("function", t)
        out.append({
            "name": fn["name"],
            "description": fn.get("description", ""),
            "input_schema": fn.get("parameters") or {"type": "object", "properties": {}},
        })
    return out


def _to_anthropic(messages: list[dict]) -> tuple[str, list[dict]]:
    """(system prompt, messages) in Claude's format.

    Tool results are paired with the tool calls they answer by position: the
    advisor appends one {"role": "tool"} message per call, in call order.
    Consecutive user-side content (tool results, mid-loop instructions) is
    merged into one user turn, as the API requires.
    """
    system = ""
    out: list[dict] = []
    pending_ids: list[str] = []

    def user_blocks() -> list:
        """The content list of the current user turn, starting one if needed."""
        if out and out[-1]["role"] == "user":
            if isinstance(out[-1]["content"], str):
                out[-1]["content"] = [{"type": "text", "text": out[-1]["content"]}]
        else:
            out.append({"role": "user", "content": []})
        return out[-1]["content"]

    for i, m in enumerate(messages):
        role = m.get("role")
        content = m.get("content") or ""
        if role == "system":
            if i == 0 and not out:
                system = content
            elif content:
                # A rule placed right after the data it's about, as the advisor intends
                user_blocks().append({"type": "text", "text": content})
        elif role == "user":
            if out and out[-1]["role"] == "user":
                user_blocks().append({"type": "text", "text": content})
            else:
                out.append({"role": "user", "content": content})
        elif role == "assistant":
            raw = m.get("_anthropic_content")
            if raw is not None:
                blocks = raw
            else:
                blocks = [{"type": "text", "text": content}] if content else []
                for n, call in enumerate(m.get("tool_calls") or []):
                    fn = call.get("function", {})
                    args = fn.get("arguments") or {}
                    if isinstance(args, str):
                        args = json.loads(args or "{}")
                    blocks.append({"type": "tool_use", "id": call.get("id") or f"call_{i}_{n}",
                                   "name": fn.get("name", ""), "input": args})
            pending_ids = [b["id"] for b in blocks if b.get("type") == "tool_use"]
            if blocks:          # the API rejects an empty assistant turn
                out.append({"role": "assistant", "content": blocks})
        elif role == "tool":
            tool_id = pending_ids.pop(0) if pending_ids else m.get("tool_call_id", "unknown")
            user_blocks().append({"type": "tool_result", "tool_use_id": tool_id, "content": content})
    return system, out


def _from_anthropic(response) -> dict:
    """Claude's response → the Ollama-shaped message the features expect."""
    blocks = [b.to_dict() for b in response.content]
    text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text").strip()
    calls = [{"id": b["id"], "function": {"name": b["name"], "arguments": b.get("input") or {}}}
             for b in blocks if b.get("type") == "tool_use"]
    message = {"role": "assistant", "content": text, "_anthropic_content": blocks}
    if calls:
        message["tool_calls"] = calls
    return message


def _record(feature: str, response, started: float) -> None:
    usage = response.usage
    prompt_tokens = (usage.input_tokens or 0) + (getattr(usage, "cache_read_input_tokens", 0) or 0) \
        + (getattr(usage, "cache_creation_input_tokens", 0) or 0)
    # Ollama's field names, so one recorder serves both providers. Duration is
    # the whole call (thinking and network included), not decode time alone.
    # num_ctx=0: a 1M-token window makes "context fill" meaningless here.
    record_llm_usage(feature, {
        "prompt_eval_count": prompt_tokens,
        "eval_count": usage.output_tokens or 0,
        "eval_duration": int((time.monotonic() - started) * 1e9),
    }, 0)


def _create(feature: str, timeout: float, **params):
    started = time.monotonic()
    try:
        with BetaFallbackState():
            response = _get_client().with_options(timeout=timeout).beta.messages.create(
                model=MODEL, output_config={"effort": EFFORT}, **params)
    except anthropic.APITimeoutError as e:
        raise ClaudeTimeout(f"Claude did not answer within {timeout:.0f}s") from e
    except anthropic.APIError as e:
        # The features treat RuntimeError as "model unavailable" and fall back
        raise RuntimeError(f"Bedrock call failed: {type(e).__name__}") from e
    _record(feature, response, started)
    if response.stop_reason == "refusal":
        logger.warning("Claude declined (%s), fallback included",
                       getattr(response.stop_details, "category", None))
    return response


# ── The shared interface ──────────────────────────────────────────────────────

def ask(prompt: str, max_tokens: int = 512, timeout: float = 120.0,
        num_ctx: int = 2048, temperature: float = 0.3, json_mode: bool = False,
        feature: str = "other") -> str:
    if json_mode:
        prompt += "\n\nRespond with the JSON object only, no other text."
    response = _create(feature, timeout, max_tokens=max(max_tokens, _MIN_MAX_TOKENS),
                       messages=[{"role": "user", "content": prompt}])
    if response.stop_reason == "refusal":
        raise RuntimeError("Claude declined this request")
    return _from_anthropic(response)["content"]


def chat(messages: list[dict], tools: list[dict] | None = None,
         max_tokens: int = 512, timeout: float = 120.0, feature: str = "other") -> dict:
    system, converted = _to_anthropic(messages)
    params = {"max_tokens": max(max_tokens, _MIN_MAX_TOKENS), "messages": converted}
    if system:
        params["system"] = system
    if tools:
        params["tools"] = _tools(tools)
    response = _create(feature, timeout, **params)
    if response.stop_reason == "refusal":
        # An empty answer: the copilot's own fallback text takes over
        return {"role": "assistant", "content": ""}
    return _from_anthropic(response)
