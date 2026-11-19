import asyncio
import os
import sys
from pathlib import Path

# Before anything imports the service: a test key, the made-up persona, memory
# storage, and no route to a real model or backend
os.environ["AI_INTERNAL_KEY"] = "test-internal-key"
os.environ["GUARD_PERSONA"] = "1"
os.environ["GUARD_CHECKIN_MINUTES"] = "0"
for name in ("GUARD_STORE", "BACKEND_URL", "GUARD_AI", "GOOGLE_API_KEY", "GEMINI_API_KEY",
             "GOOGLE_GENAI_USE_VERTEXAI", "GOOGLE_CLOUD_PROJECT"):
    os.environ.pop(name, None)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest                                   # noqa: E402
from fastapi.testclient import TestClient       # noqa: E402

import main                                     # noqa: E402
import rules                                    # noqa: E402
import usage                                    # noqa: E402
from samples import NOON                        # noqa: E402
from store import MemoryStore                   # noqa: E402

KEY = {"X-Internal-Key": "test-internal-key"}


class FakeConversation:
    def __init__(self, brain, key, state):
        self.brain, self.key, self.state = brain, key, state

    async def ask(self, text):
        self.brain.asked.append((self.key, text, self.state))
        script = self.brain.answers.get(self.key) or []
        assert script, f"no scripted answer left for the {self.key} agent"
        item = script.pop(0)
        usage.add(f"guard_{self.key}", 100, 20, 1)
        if item == "slow":
            await asyncio.sleep(30)
        if isinstance(item, BaseException):
            raise item
        return item

    async def close(self):
        self.brain.closed += 1


class FakeBrain:
    """Stands in for the Gemini agents: scripted answers per agent, and a record of what each was asked."""

    def __init__(self):
        self.answers: dict[str, list] = {}
        self.asked: list[tuple] = []
        self.ready: str | None = None     # None = the AI is available
        self.closed = 0

    def availability(self, persona):
        return self.ready

    def conversation(self, key, state=None):
        return FakeConversation(self, key, state)


@pytest.fixture
def clock(monkeypatch):
    holder = {"now": NOON}
    monkeypatch.setattr(rules, "now", lambda: holder["now"])
    return holder


@pytest.fixture
def brain(monkeypatch):
    fake = FakeBrain()
    monkeypatch.setattr(main, "brain", fake)
    return fake


@pytest.fixture
def api(monkeypatch, clock, brain):
    """api("check", qr=..., amount=...) posts as the backend would for user 42."""
    monkeypatch.setattr(main, "store", MemoryStore())
    client = TestClient(main.app)

    def call(action, user_id=42, **body):
        return client.post(f"/guard/{action}", json={"userId": user_id, "toolToken": "tok", **body}, headers=KEY)

    call.client = client
    return call
