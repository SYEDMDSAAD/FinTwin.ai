"""Gemini on Google Cloud's Vertex AI, behind the same ask()/chat() as Ollama.

Selected with LLM_PROVIDER=gemini, the default (see utils/llm_client.py).
Configuration:

    GOOGLE_CLOUD_PROJECT     required — the Google Cloud project billed for the calls
    GOOGLE_CLOUD_LOCATION    default global
    GEMINI_MODEL             default gemini-3.7-flash: the copilot's chat() turns,
                             where tool use needs the model to think
    GEMINI_FAST_MODEL        default gemini-3.5-flash-lite: every one-shot ask()
                             (coach, goal planner, report, investments,
                             categories), which must answer inside 15 s
    GEMINI_THINKING          LOW (default) | MEDIUM | HIGH, for the thinking model
    Credentials              Application Default Credentials: `gcloud auth
                             application-default login` on a laptop, the
                             service's own identity on Cloud Run

Vertex AI only, never an AI Studio API key: every feature here sends the
user's real figures, and those go only to a model under a Cloud project's
data terms. The client is built from explicit credentials and a project, so a
GOOGLE_API_KEY lying around in the environment can't redirect it.

What differs from qwen, and how it's handled here:

- Gemini 3 Flash thinks before answering and can't be told not to (MINIMAL is
  rejected). Measured 2026-11-20 on a coach-sized prompt: 13-18 s at LOW, too
  close to the features' 15 s budgets and the backend's 20 s, while Flash-Lite
  answered the same prompt in ~1 s without thinking. So one-shot ask() calls
  go to the fast model, and only the copilot's tool loop uses the thinking one.
- Thinking counts toward the output limit, and the features' max_tokens were
  sized for qwen's answer alone, so headroom is added on top; the prompts
  still ask for short answers.
- Temperature is left at the model's default: Google advises against lowering
  it for Gemini 3 (it can loop), and a lower one was only ever there to keep a
  3B model on task. Gemini 2.x models still get the caller's temperature.
- json_mode asks for application/json output, as Ollama's format=json did.
- Function calls must go back with the model's own content (it carries
  signatures the next request is checked against). chat() returns the
  familiar Ollama shape plus "_gemini_content", which the advisor's loop
  appends as-is and this module sends back unchanged.
- The advisor sends mid-loop instructions as {"role": "system"} messages;
  they're passed as text after that turn's tool results.
- A trial project's Vertex AI sometimes refuses a call with a quick 403; it's
  retried briefly, along with 429 and 503 (see _vertex_retry).
"""
import json
import logging
import os
import time

import requests

from utils.metrics import record_llm_usage

logger = logging.getLogger(__name__)

MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.7-flash")
FAST_MODEL = os.environ.get("GEMINI_FAST_MODEL", "gemini-3.5-flash-lite")
THINKING = os.environ.get("GEMINI_THINKING", "LOW").strip().upper()

# Thinking shares the output limit with the answer; this much is added to each
# feature's max_tokens so the answer itself isn't cut off.
_THINKING_HEADROOM = 2048

_client = None


class GeminiTimeout(requests.exceptions.ReadTimeout):
    """A call that ran out of its time budget.

    A ReadTimeout on purpose: the features already treat that as "out of
    time, answer now" (the copilot's budget, category batches), so they
    behave the same whichever provider timed out.
    """


def _get_client():
    """Created on first use, so importing this module needs no Google setup."""
    global _client
    if _client is None:
        import google.auth
        from google import genai
        from google.genai import types

        project = os.environ.get("GOOGLE_CLOUD_PROJECT", "").strip()
        if not project:
            raise RuntimeError("GOOGLE_CLOUD_PROJECT is not set: Gemini runs on Vertex AI only")
        credentials, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"])
        _client = genai.Client(
            vertexai=True,
            project=project,
            location=os.environ.get("GOOGLE_CLOUD_LOCATION", "global").strip() or "global",
            credentials=credentials,
            http_options=types.HttpOptions(retry_options=_vertex_retry()),
        )
    return _client


def _vertex_retry():
    """A quick refusal (403 on a free-trial billing account), busy (429) or
    unavailable (503) is tried again, up to six attempts in all.

    Measured 2026-11-20 on gemini-3.7-flash, global: a trial project refused
    roughly one call in three, at random, each refusal back in ~0.2 s, so six
    attempts cost about 3 s at worst and almost never all fail. Each
    feature's own time budget still bounds the call. Activating the full
    billing account ends the refusals."""
    from google.genai import types
    return types.HttpRetryOptions(attempts=6, initial_delay=0.2, max_delay=0.8,
                                  http_status_codes=[403, 429, 503])


# ── Format conversion ─────────────────────────────────────────────────────────

def _tools(tools: list[dict] | None):
    """Ollama/OpenAI-style schemas → one Gemini tool with a declaration each."""
    from google.genai import types
    declarations = []
    for t in tools or []:
        fn = t.get("function", t)
        declarations.append(types.FunctionDeclaration(
            name=fn["name"],
            description=fn.get("description", ""),
            parameters_json_schema=fn.get("parameters") or {"type": "object", "properties": {}},
        ))
    return [types.Tool(function_declarations=declarations)] if declarations else None


def _to_gemini(messages: list[dict]):
    """(system instruction, contents) in Gemini's format.

    Tool results are paired with the calls they answer by position: the
    advisor appends one {"role": "tool"} message per call, in call order.
    All of a turn's tool results go into one user turn, as Gemini expects
    them together. Text (a question, a mid-loop instruction) goes into a user
    turn of its own: Vertex AI rejects a turn that mixes tool results and text
    ("Requests ending with a model turn are not supported").
    """
    from google.genai import types

    system = ""
    contents: list = []
    pending: list[tuple[str, str | None]] = []      # (name, id) of calls awaiting results

    def is_results(turn) -> bool:
        return any(p.function_response for p in (turn.parts or []))

    def user_parts(results: bool = False) -> list:
        """The parts of the current user turn of this kind, starting one if needed."""
        last = contents[-1] if contents else None
        if last is None or last.role != "user" or (bool(last.parts) and is_results(last) != results):
            contents.append(types.Content(role="user", parts=[]))
        return contents[-1].parts

    for i, m in enumerate(messages):
        role = m.get("role")
        content = m.get("content") or ""
        if role == "system":
            if i == 0 and not contents:
                system = content
            elif content:
                # A rule placed right after the data it's about, as the advisor intends
                user_parts().append(types.Part.from_text(text=content))
        elif role == "user":
            user_parts().append(types.Part.from_text(text=content))
        elif role == "assistant":
            raw = m.get("_gemini_content")
            if raw is not None:
                turn = raw
            else:
                parts = [types.Part.from_text(text=content)] if content else []
                for call in m.get("tool_calls") or []:
                    fn = call.get("function", {})
                    args = fn.get("arguments") or {}
                    if isinstance(args, str):
                        args = json.loads(args or "{}")
                    parts.append(types.Part(function_call=types.FunctionCall(
                        name=fn.get("name", ""), args=args, id=call.get("id"))))
                turn = types.Content(role="model", parts=parts)
            pending = [(p.function_call.name, p.function_call.id)
                       for p in (turn.parts or []) if p.function_call]
            if turn.parts:      # an empty model turn is rejected
                contents.append(turn)
        elif role == "tool":
            name, call_id = pending.pop(0) if pending else (m.get("name") or "tool", None)
            user_parts(results=True).append(types.Part(function_response=types.FunctionResponse(
                name=name, id=call_id, response={"result": content})))
    return system, contents


def _from_gemini(response) -> dict:
    """Gemini's response → the Ollama-shaped message the features expect."""
    candidate = (response.candidates or [None])[0]
    turn = candidate.content if candidate is not None else None
    parts = (turn.parts if turn is not None else None) or []
    text = "".join(p.text for p in parts if p.text and not p.thought).strip()
    calls = [{"id": p.function_call.id,
              "function": {"name": p.function_call.name, "arguments": dict(p.function_call.args or {})}}
             for p in parts if p.function_call]
    message = {"role": "assistant", "content": text}
    if turn is not None and parts:
        message["_gemini_content"] = turn
    if calls:
        message["tool_calls"] = calls
    return message


def _record(feature: str, response, started: float) -> None:
    usage = response.usage_metadata
    if usage is None:
        return
    # Ollama's field names, so one recorder serves every provider. Thinking is
    # output the call paid for, so it counts with the answer. Duration is the
    # whole call (thinking and network included), not decode time alone.
    # num_ctx=0: a million-token window makes "context fill" meaningless here.
    record_llm_usage(feature, {
        "prompt_eval_count": usage.prompt_token_count or 0,
        "eval_count": (usage.candidates_token_count or 0) + (usage.thoughts_token_count or 0),
        "eval_duration": int((time.monotonic() - started) * 1e9),
    }, 0)


def _config(model: str, max_tokens: int, timeout: float, temperature: float | None = None,
            system: str = "", tools=None, json_mode: bool = False):
    from google.genai import types
    config = types.GenerateContentConfig(
        max_output_tokens=max_tokens + _THINKING_HEADROOM,
        http_options=types.HttpOptions(timeout=max(1000, int(timeout * 1000)),
                                       retry_options=_vertex_retry()),
    )
    if "lite" in model:
        # Flash-Lite answers without thinking unless asked; the caller's
        # temperature keeps short structured answers steady
        config.max_output_tokens = max_tokens
        if temperature is not None:
            config.temperature = temperature
    elif model.startswith("gemini-2"):
        config.thinking_config = types.ThinkingConfig(thinking_budget=1024)
        if temperature is not None:
            config.temperature = temperature
    else:
        config.thinking_config = types.ThinkingConfig(
            thinking_level=getattr(types.ThinkingLevel, THINKING, types.ThinkingLevel.LOW))
    if system:
        config.system_instruction = system
    if tools:
        config.tools = tools
        # The advisor runs its own tool loop; the SDK must not call anything itself
        config.automatic_function_calling = types.AutomaticFunctionCallingConfig(disable=True)
    if json_mode:
        config.response_mime_type = "application/json"
    return config


def _generate(model: str, feature: str, timeout: float, contents, config):
    from google.genai import errors
    started = time.monotonic()
    try:
        response = _get_client().models.generate_content(model=model, contents=contents, config=config)
    except errors.APIError as e:
        if e.code == 504:
            # Vertex's own deadline, set from our timeout: out of time, not down
            raise GeminiTimeout(f"Gemini did not answer within {timeout:.0f}s") from e
        # The features treat RuntimeError as "model unavailable" and fall back
        raise RuntimeError(f"Vertex AI call failed: HTTP {e.code}") from e
    except Exception as e:
        if "timeout" in type(e).__name__.lower():
            raise GeminiTimeout(f"Gemini did not answer within {timeout:.0f}s") from e
        raise
    _record(feature, response, started)
    return response


def _blocked(response) -> str | None:
    """Why Gemini gave no answer (a safety block, say), or None if it answered."""
    feedback = response.prompt_feedback
    if feedback is not None and feedback.block_reason:
        return str(feedback.block_reason)
    candidate = (response.candidates or [None])[0]
    if candidate is None:
        return "NO_CANDIDATE"
    reason = str(candidate.finish_reason or "")
    if any(word in reason for word in ("SAFETY", "BLOCKLIST", "PROHIBITED", "SPII")):
        return reason
    return None


# ── The shared interface ──────────────────────────────────────────────────────

def ask(prompt: str, max_tokens: int = 512, timeout: float = 120.0,
        num_ctx: int = 2048, temperature: float = 0.3, json_mode: bool = False,
        feature: str = "other") -> str:
    response = _generate(FAST_MODEL, feature, timeout, prompt,
                         _config(FAST_MODEL, max_tokens, timeout, temperature=temperature,
                                 json_mode=json_mode))
    reason = _blocked(response)
    if reason:
        logger.warning("Gemini gave no answer for %s: %s", feature, reason)
        raise RuntimeError(f"Gemini gave no answer ({reason})")
    return _from_gemini(response)["content"]


def chat(messages: list[dict], tools: list[dict] | None = None,
         max_tokens: int = 512, timeout: float = 120.0, feature: str = "other") -> dict:
    system, contents = _to_gemini(messages)
    response = _generate(MODEL, feature, timeout, contents,
                         _config(MODEL, max_tokens, timeout, system=system, tools=_tools(tools)))
    reason = _blocked(response)
    if reason:
        logger.warning("Gemini gave no answer for %s: %s", feature, reason)
        # An empty answer: the copilot's own fallback text takes over
        return {"role": "assistant", "content": ""}
    return _from_gemini(response)
