import hmac
import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from chatbot.routes import router as chatbot_router
from chatbot.goal_routes import router as goal_router
from forecasting.routes import router as forecast_router
from ocr.routes import router as ocr_router
from report_routes import router as report_router
from investments.routes import router as investment_router
from spending_coach.routes import router as coach_router
from statements.routes import router as statements_router
from categories.routes import router as categories_router
from market.routes import router as market_router
from utils import llm_usage

_INTERNAL_KEY = os.environ.get("AI_INTERNAL_KEY", "")
if not _INTERNAL_KEY:
    raise RuntimeError(
        "AI_INTERNAL_KEY env var is not set. "
        "Generate with: openssl rand -hex 32 and set the same value in both services."
    )

_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]

app = FastAPI(
    title="FinTwin AI API",
    description="AI-powered Financial Operating System",
    version="1.0.0",
)

# This is an internal, server-to-server API (called by the Spring backend with
# X-Internal-Key) — browsers never call it directly. CORS is therefore minimal:
# no credentials, and only the methods/headers actually used.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Internal-Key"],
)


_PUBLIC_PATHS = {"/", "/health"}

# /metrics is scraped by Prometheus or Grafana Cloud, which send
# "Authorization: Bearer <METRICS_TOKEN>" rather than the internal key. On App
# Service this app has a public URL, so with no token set the endpoint is
# closed (404), never open.
_METRICS_TOKEN = os.environ.get("METRICS_TOKEN", "")

@app.middleware("http")
async def verify_internal_key(request: Request, call_next):
    # Trailing slash normalised, so "/metrics/" is guarded like "/metrics"
    path = request.url.path.rstrip("/") or "/"
    if path in _PUBLIC_PATHS:
        return await call_next(request)
    if path == "/metrics":
        if not _METRICS_TOKEN:
            return Response("Not found", status_code=404)
        given = request.headers.get("authorization", "")
        if not hmac.compare_digest(given.encode(), f"Bearer {_METRICS_TOKEN}".encode()):
            return Response("Unauthorized", status_code=401, headers={"WWW-Authenticate": "Bearer"})
        return await call_next(request)
    key = request.headers.get("x-internal-key", "")
    # Constant-time comparison to avoid leaking the key via response timing.
    if not hmac.compare_digest(key, _INTERNAL_KEY):
        return Response("Forbidden: missing or invalid internal key", status_code=403)
    return await call_next(request)


# Tokens this request's model calls used, per feature, returned in the
# X-LLM-Usage header so the backend can attribute them to the user it knows
# the request is for. See utils/llm_usage.py.
@app.middleware("http")
async def report_llm_usage(request: Request, call_next):
    tally = llm_usage.start()
    response = await call_next(request)
    if tally:
        response.headers[llm_usage.USAGE_HEADER] = llm_usage.header_value(tally)
    return response


@app.get("/")
def root():
    return {"message": "FinTwin AI Backend Running"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "FinTwin AI"}


from prometheus_client import (  # noqa: E402
    CONTENT_TYPE_LATEST, REGISTRY, CollectorRegistry, generate_latest, multiprocess,
)


@app.get("/metrics", include_in_schema=False)
def metrics():
    # uvicorn runs several worker processes, each with its own counters. With
    # PROMETHEUS_MULTIPROC_DIR set (the Dockerfiles do) every worker writes its
    # values there and this sums them; without it, a scrape would read one
    # worker at random and the totals would jump between scrapes.
    if os.environ.get("PROMETHEUS_MULTIPROC_DIR"):
        registry = CollectorRegistry()
        multiprocess.MultiProcessCollector(registry)
    else:
        registry = REGISTRY
    return Response(generate_latest(registry), media_type=CONTENT_TYPE_LATEST)

app.include_router(chatbot_router, tags=["AI Chatbot"])
app.include_router(goal_router, tags=["AI Goal Planner"])
app.include_router(forecast_router, tags=["Forecasting"])
app.include_router(ocr_router, tags=["OCR"])
app.include_router(report_router, prefix="/reports")
app.include_router(investment_router)
app.include_router(coach_router)
app.include_router(statements_router, tags=["Statements"])
app.include_router(market_router, tags=["Discover"])
app.include_router(categories_router, tags=["Categories"])
