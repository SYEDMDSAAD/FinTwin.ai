"""Runs Spend Guard's ADK agents on a model served by Ollama on this machine.

GUARD_MODEL=ollama/<name> (e.g. ollama/qwen2.5:3b) picks it. OLLAMA_URL says where
Ollama listens (default http://127.0.0.1:11434). Real user data may go to it only
when that address is this machine: availability() in brain.py checks is_local().

It turns ADK's request (instructions, history, tools, answer shape) into one call
to Ollama's /api/chat and the reply back into ADK's response. Safety settings and
thinking levels are Gemini features and are left out: every answer still goes
through the same checks in rules.py.
"""
import ipaddress
import json
import os
from typing import AsyncGenerator
from urllib.parse import urlparse

import httpx
from google.adk.models import BaseLlm, LlmRequest, LlmResponse
from google.adk.models._capabilities import LlmCapabilities
from google.genai import types
from pydantic import BaseModel

PREFIX = "ollama/"


def url() -> str:
    return os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")


def is_local(address: str | None = None) -> bool:
    """True only when Ollama runs on this machine (a loopback address)."""
    host = urlparse(address or url()).hostname or ""
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _json_schema(schema) -> dict | None:
    """An answer shape or tool parameters as plain JSON Schema."""
    if schema is None:
        return None
    if isinstance(schema, type) and issubclass(schema, BaseModel):
        return schema.model_json_schema()
    if isinstance(schema, dict):
        return schema
    if isinstance(schema, types.Schema):
        return _lower(schema.model_dump(exclude_none=True))
    return None


def _lower(node):
    """google-genai Schema dumps use "OBJECT", "STRING"...; JSON Schema wants lowercase."""
    if isinstance(node, dict):
        return {k: (v.lower() if k == "type" and isinstance(v, str) else _lower(v)) for k, v in node.items()}
    if isinstance(node, list):
        return [_lower(v) for v in node]
    return node


def _text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, types.Content):
        return "".join(p.text or "" for p in value.parts or [])
    return str(value)


def _messages(req: LlmRequest) -> list[dict]:
    out = []
    system = _text(req.config.system_instruction if req.config else None)
    if system:
        out.append({"role": "system", "content": system})
    for content in req.contents or []:
        role = "assistant" if content.role == "model" else "user"
        text, calls = [], []
        for part in content.parts or []:
            if part.function_response is not None:
                out.append({"role": "tool", "tool_name": part.function_response.name,
                            "content": json.dumps(part.function_response.response, ensure_ascii=False)})
            elif part.function_call is not None:
                calls.append({"function": {"name": part.function_call.name,
                                           "arguments": part.function_call.args or {}}})
            elif part.text and not part.thought:
                text.append(part.text)
        if text or calls:
            msg = {"role": role, "content": "".join(text)}
            if calls:
                msg["tool_calls"] = calls
            out.append(msg)
    return out


def _tools(req: LlmRequest) -> list[dict]:
    out = []
    for tool in (req.config.tools if req.config else None) or []:
        for fn in getattr(tool, "function_declarations", None) or []:
            params = (_json_schema(fn.parameters_json_schema) or _json_schema(fn.parameters)
                      or {"type": "object", "properties": {}})
            out.append({"type": "function",
                        "function": {"name": fn.name, "description": fn.description or "", "parameters": params}})
    return out


class OllamaLlm(BaseLlm):
    """model: the Ollama model name, without the "ollama/" prefix."""

    @property
    def capabilities(self) -> LlmCapabilities:
        # With tools, ADK asks for the answer through its set_model_response tool
        return LlmCapabilities(output_schema_and_tools=False)

    async def generate_content_async(self, llm_request: LlmRequest,
                                     stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        cfg = llm_request.config
        body = {
            "model": self.model,
            "messages": _messages(llm_request),
            "stream": False,
            "keep_alive": "30m",
            "options": {"temperature": 0.2,
                        "num_predict": (cfg.max_output_tokens if cfg and cfg.max_output_tokens else 1024)},
        }
        tools = _tools(llm_request)
        if tools:
            body["tools"] = tools
        else:
            fmt = _json_schema(cfg.response_json_schema if cfg else None) or _json_schema(
                cfg.response_schema if cfg else None)
            if fmt:
                body["format"] = fmt
        async with httpx.AsyncClient(timeout=60) as client:
            res = await client.post(f"{url()}/api/chat", json=body)
            res.raise_for_status()
            data = res.json()
        msg = data.get("message") or {}
        parts = [types.Part(function_call=types.FunctionCall(
                     name=c["function"]["name"], args=c["function"].get("arguments") or {}))
                 for c in msg.get("tool_calls") or []]
        if not parts:
            parts = [types.Part(text=msg.get("content") or "")]
        yield LlmResponse(
            content=types.Content(role="model", parts=parts),
            usage_metadata=types.GenerateContentResponseUsageMetadata(
                prompt_token_count=data.get("prompt_eval_count") or 0,
                candidates_token_count=data.get("eval_count") or 0),
        )
