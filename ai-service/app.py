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


# /metrics is public the same way the Spring services' /actuator/prometheus
# is: reachable only on the internal network, scraped by Prometheus, and
# carrying operational counters rather than user data.
_PUBLIC_PATHS = {"/", "/health", "/metrics"}

@app.middleware("http")
async def verify_internal_key(request: Request, call_next):
    # Trailing slash normalised: the mounted /metrics app redirects to
    # "/metrics/", and the redirected request passes through here again.
    if (request.url.path.rstrip("/") or "/") in _PUBLIC_PATHS:
        return await call_next(request)
    key = request.headers.get("x-internal-key", "")
    # Constant-time comparison to avoid leaking the key via response timing.
    if not hmac.compare_digest(key, _INTERNAL_KEY):
        return Response("Forbidden: missing or invalid internal key", status_code=403)
    return await call_next(request)


@app.get("/")
def root():
    return {"message": "FinTwin AI Backend Running"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "FinTwin AI"}


from prometheus_client import make_asgi_app  # noqa: E402
app.mount("/metrics", make_asgi_app())

app.include_router(chatbot_router, tags=["AI Chatbot"])
app.include_router(goal_router, tags=["AI Goal Planner"])
app.include_router(forecast_router, tags=["Forecasting"])
app.include_router(ocr_router, tags=["OCR"])
app.include_router(report_router, prefix="/reports")
app.include_router(investment_router)
app.include_router(coach_router)
app.include_router(statements_router, tags=["Statements"])
