# Spend Guard (guard-service)

A prototype for the Google Startup Buildathon: AI agents that help a user stop
careless spending before it happens. They split the salary on payday, keep the
week's money in a separate spending account, and pause before a payment that
the user is likely to regret.

FinTwin never holds or moves money. A payment goes to the user's own UPI app as
the merchant's QR link, and a top-up is a link to pay their own spending
account. The balances in this service are pretend (`"demo": true`).

## The agents

All four are Google ADK `LlmAgent`s on Gemini (`GUARD_MODEL`, default
`gemini-3.8-flash`), each with a fixed answer shape and explicit safety
settings.

| Agent | When | Decides |
|---|---|---|
| Spend Guard (`scan`) | a QR code is scanned | go, or pause with one line naming the trade-off |
| Top-up Guard (`topup`) | the user asks for more money | approve, approve less, wait, or wishlist |
| Budget Rebalancer (`rebalance`) | after an overspend or a top-up | which budgets give way, and by how much |
| Payday Planner (`payday`) | the salary arrives | bills, goals, buffer and four weekly allowances, using its `get_budgets` and `get_goals` tools |

The code has the last word (`rules.py`):

- The payee only ever comes from the scanned QR code.
- The merchant's link is passed on unchanged, apart from adding the amount.
- Every figure in an answer must appear in the facts.
- Shaming words and links are rejected.
- Bill money and essentials can't be touched.
- Essentials and small payments never wait on the AI.
- There are at most three pauses a day.

A broken answer goes back to the agent with the reason. A slow, broken or
missing answer falls back to fixed rules (`flows.py`), and every decision
records its `source` (`ai`, `fast_lane`, `rules` or `fallback`).

## How it's called

```
browser ─► FinTwin backend (GuardController) ─► guard-service ─► Gemini
           login, USE_SPEND_GUARD,               POST /guard/<action>
           allowlist, rate limit                 X-Internal-Key + user id + tool token
```

Browsers never call this service. Everything except `/health` needs
`X-Internal-Key`. The backend sets the user id and a 5-minute tool token on
every request.

## Run it on a laptop

```bash
cd guard-service
python3 -m venv venv && ./venv/bin/pip install -r requirements-dev.txt
./venv/bin/python -m pytest                                   # 94 tests, offline

export AI_INTERNAL_KEY=...   # the same value as the backend's AI_INTERNAL_KEY
export GUARD_PERSONA=1       # made-up budgets and goals, no backend needed
export GOOGLE_API_KEY=...    # optional: without it, the fixed rules decide
./venv/bin/uvicorn main:app --port 8091
```

With `GUARD_PERSONA=1` everything is made up, so an AI Studio free-tier key is
fine. Real FinTwin data (`BACKEND_URL` set, no persona) only ever goes to
Vertex AI. On AI Studio the code refuses and uses the rules instead
(`needs_vertex_for_real_data`).

To run the agents on 21 made-up cases, including prompt-injection attempts and
Hindi or Telugu messages:

```bash
./venv/bin/python evals/run_evals.py -v --out ~/Documents/FinTwin-Buildathon/evals.json
```

## Settings

| Variable | What it does |
|---|---|
| `AI_INTERNAL_KEY` | required; the shared key with the backend |
| `GUARD_PERSONA=1` | use the made-up persona instead of FinTwin's data |
| `BACKEND_URL` | the FinTwin backend, for `/internal/ai/{userId}/budgets` and `/goals` |
| `GUARD_STORE=firestore` | keep data in Firestore (default: in memory, lost on restart) |
| `GOOGLE_GENAI_USE_VERTEXAI=TRUE`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION=global` | Gemini on Vertex AI |
| `GOOGLE_API_KEY` | Gemini on AI Studio (made-up data only) |
| `GUARD_MODEL` | default `gemini-3.8-flash`. Gemini 2.5 models work on AI Studio too (they get a thinking budget instead of a level); Vertex's global endpoint doesn't serve `gemini-2.5-flash` |
| `GUARD_AI=off` | the fixed rules decide everything |
| `GUARD_SCAN_SECONDS` and the others in `main.py` | time limits per agent; each request fits inside the backend's 20 s |

## Deploy (after the credits are redeemed)

```bash
gcloud run deploy guard-service --source . --region asia-south1 \
  --service-account guard-service@PROJECT.iam.gserviceaccount.com \
  --memory 1Gi --min-instances 0 --max-instances 3 --allow-unauthenticated \
  --set-env-vars GUARD_STORE=firestore,GOOGLE_GENAI_USE_VERTEXAI=TRUE,GOOGLE_CLOUD_PROJECT=PROJECT,GOOGLE_CLOUD_LOCATION=global,BACKEND_URL=https://... \
  --set-secrets AI_INTERNAL_KEY=ai-internal-key:latest
```

`--allow-unauthenticated` is needed because the backend runs on Azure, not
Google Cloud. The internal key is what protects the service, so keep it in
Secret Manager. The service account needs only `roles/datastore.user` and
`roles/aiplatform.user`.

Then set `GUARD_SERVICE_URL` and `GUARD_ALLOWED_USERS` on the backend.
