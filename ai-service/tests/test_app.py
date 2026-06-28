"""
Integration tests for the AI service HTTP layer.

These exercise the internal-key auth middleware and request validation without
hitting Ollama or Tesseract — auth rejections and 422 validation errors short-
circuit before any model/OCR call, so the suite is fast and dependency-free.
"""
from fastapi.testclient import TestClient

import app as app_module

client = TestClient(app_module.app)
GOOD_KEY = {"x-internal-key": "test-internal-key"}


# ── Public endpoints (no key) ────────────────────────────────────────────────

def test_health_is_public():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_root_is_public():
    assert client.get("/").status_code == 200


# ── Internal-key guard ───────────────────────────────────────────────────────

def test_protected_route_without_key_is_forbidden():
    r = client.post("/chat", json={"message": "hi", "mode": "Savings Advisor"})
    assert r.status_code == 403


def test_protected_route_with_wrong_key_is_forbidden():
    r = client.post(
        "/chat",
        json={"message": "hi", "mode": "Savings Advisor"},
        headers={"x-internal-key": "wrong-key"},
    )
    assert r.status_code == 403


def test_ocr_route_requires_key():
    assert client.post("/ocr").status_code == 403


# ── Request validation (auth passes, body is invalid) ────────────────────────

def test_chat_missing_mode_is_422():
    r = client.post("/chat", json={"message": "hi"}, headers=GOOD_KEY)
    assert r.status_code == 422


def test_chat_message_too_long_is_422():
    r = client.post(
        "/chat",
        json={"message": "x" * 5000, "mode": "Savings Advisor"},
        headers=GOOD_KEY,
    )
    assert r.status_code == 422


def test_chat_empty_message_is_422():
    r = client.post(
        "/chat",
        json={"message": "", "mode": "Savings Advisor"},
        headers=GOOD_KEY,
    )
    assert r.status_code == 422
