"""/metrics: guarded by METRICS_TOKEN, and summed across uvicorn workers."""
import os
import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient

import app as app_module

client = TestClient(app_module.app)
SERVICE_DIR = Path(__file__).resolve().parent.parent


def test_metrics_needs_the_bearer_token():
    assert client.get("/metrics").status_code == 401
    assert client.get("/metrics", headers={"Authorization": "Bearer wrong"}).status_code == 401
    # the internal key is for the backend, not for scrapers
    assert client.get("/metrics", headers={"x-internal-key": "test-internal-key"}).status_code == 401


def test_metrics_with_the_token_serves_prometheus_text():
    r = client.get("/metrics", headers={"Authorization": "Bearer test-metrics-token"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/plain")
    assert "fintwin_ai_llm_tokens_total" in r.text


def test_trailing_slash_is_guarded_too():
    assert client.get("/metrics/", follow_redirects=False).status_code == 401


def test_metrics_is_closed_when_no_token_is_configured(monkeypatch):
    monkeypatch.setattr(app_module, "_METRICS_TOKEN", "")
    r = client.get("/metrics", headers={"Authorization": "Bearer test-metrics-token"})
    assert r.status_code == 404


_WORKER = """
from utils.metrics import record_llm_usage
record_llm_usage("coach", {"prompt_eval_count": %d, "eval_count": 10, "eval_duration": 10**9}, 2048)
"""

_SCRAPER = """
from fastapi.testclient import TestClient
import app
r = TestClient(app.app).get("/metrics", headers={"Authorization": "Bearer test-metrics-token"})
line = [l for l in r.text.splitlines()
        if l.startswith('fintwin_ai_llm_tokens_total{direction="input",feature="coach"}')][0]
print(float(line.split()[-1]))
"""


def _run(code, env):
    return subprocess.run([sys.executable, "-c", code], cwd=SERVICE_DIR, env=env,
                          capture_output=True, text=True, check=True).stdout.strip()


def test_metrics_sum_every_worker_process(tmp_path):
    env = {**os.environ, "PROMETHEUS_MULTIPROC_DIR": str(tmp_path),
           "AI_INTERNAL_KEY": "test-internal-key", "METRICS_TOKEN": "test-metrics-token"}
    _run(_WORKER % 300, env)   # worker 1
    _run(_WORKER % 500, env)   # worker 2
    assert float(_run(_SCRAPER, env)) == 800.0
