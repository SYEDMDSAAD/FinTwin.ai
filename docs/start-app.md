# FinTwin.ai — Local Dev Startup Guide

Start services in this exact order. Each service must be healthy before starting the next.

---

## Prerequisites (one-time)

```bash
# From the repo root
cp .env.example .env
# Fill in at minimum:
#   POSTGRES_PASSWORD, JWT_SECRET, FINTWIN_ENCRYPTION_KEY, AI_INTERNAL_KEY
```

Required tools: `java 17+`, `maven`, `python 3.11+`, `node 18+`, `ollama`  
Database: Supabase (cloud) — no local PostgreSQL required

---

## Step 1 — Supabase (cloud PostgreSQL)

The database is hosted on Supabase — no local PostgreSQL needed.

Set these in `backend/.env` (and `identity-service` uses the same values):

```env
# Session-mode pooler — used by the app (HikariCP)
DB_URL=jdbc:postgresql://aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require
DB_USERNAME=postgres
DB_PASSWORD=<your-supabase-password>

# Direct connection — used by Flyway only (pooler doesn't support DDL)
FLYWAY_DB_URL=jdbc:postgresql://db.wfmixqcopbatzbmjzzvv.supabase.co:5432/postgres?sslmode=require

# Required for Supabase (public schema is non-empty by default)
FLYWAY_BASELINE=true
```

> Flyway migrations (`V1__baseline.sql`, `V2__indexes.sql`, `V3__audit_log_partition.sql`) run automatically on backend startup — no manual DB setup required.

Verify connectivity: open the Supabase dashboard → Table Editor and confirm the `users` table exists after first backend start.

---

## Step 2 — Ollama (LLM backend for AI service)

The AI service calls Ollama locally. Start it and pull the model before the AI service starts.

```bash
# Terminal 1
ollama serve
```

First-time only — pull the model (in a separate terminal):

```bash
ollama pull qwen2.5:3b
```

Verify: `curl http://localhost:11434/api/tags`

---

## Step 3 — Identity Service (port 8090)

Handles refresh tokens, account lockout, change-password, and token introspection.
Shares the same DB and `JWT_SECRET` as the main backend.

```bash
# Terminal 2
cd identity-service

# Load env and run (identity-service shares backend's .env)
set -a && source ../backend/.env && set +a
mvn spring-boot:run
```

Wait for: `Tomcat started on port 8090`

Verify: `curl http://localhost:8090/actuator/health`

---

## Step 4 — Backend (port 8080)

Main Spring Boot API. Flyway migrations run on startup.

```bash
# Terminal 3
cd backend
./run.sh
```

`run.sh` sources `.env` automatically and runs `mvn spring-boot:run`.

Wait for: `Tomcat started on port 8080`

Verify: `curl http://localhost:8080/actuator/health`

> **Note:** If `.env` is missing, `run.sh` will exit with an error. Copy `.env.example` and fill in the values first.

---

## Step 5 — AI Service (port 8000)

FastAPI service for chat, forecasting, OCR, spending coach, and investment recommendations.

```bash
# Terminal 4
cd ai-service

# First-time only: create and activate the virtual env
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Subsequent runs — just activate and start
source venv/bin/activate
source .env   # ai-service has its own .env

uvicorn app:app --reload
```

Wait for: `Application startup complete`

Verify: `curl http://localhost:8000/docs`

> **Env vars needed:** `AI_INTERNAL_KEY` (must match `AI_INTERNAL_KEY` in backend `.env`)  
> Optional: `OLLAMA_URL` (default: `http://localhost:11434/api/generate`), `OLLAMA_MODEL` (default: `qwen2.5:3b`)

---

## Step 6 — Frontend (port 5173)

React + Vite app. Proxies `/api` requests to the backend at `localhost:8080`.

```bash
# Terminal 5
cd frontend

# First-time only
npm install

# Dev server
npm run dev
```

Open: [http://localhost:5173](http://localhost:5173)

---

## Quick-reference: ports

| Service          | Port  | URL                              |
|------------------|-------|----------------------------------|
| Supabase (cloud) | 5432  | `db.wfmixqcopbatzbmjzzvv.supabase.co` |
| Ollama           | 11434 | `http://localhost:11434`         |
| Identity Service | 8090  | `http://localhost:8090`          |
| Backend          | 8080  | `http://localhost:8080`          |
| AI Service       | 8000  | `http://localhost:8000`          |
| Frontend         | 5173  | `http://localhost:5173`          |

---

## Stopping everything

`Ctrl+C` in each terminal. Supabase stays up in the cloud — nothing to stop there.

To stop Ollama: `Ctrl+C` in its terminal or `pkill ollama`.

---

## Running Tests

### Backend (48 integration tests — needs Docker)

```bash
cd backend
set -a && source .env && set +a
mvn test
```

> Testcontainers spins up a real PostgreSQL container. Docker must be running.

### Identity Service (15 integration tests — needs Docker)

```bash
cd identity-service
set -a && source ../backend/.env && set +a
mvn test
```

### AI Service (129 unit tests — no Docker, no Ollama)

```bash
cd ai-service
source venv/bin/activate
python -m pytest tests/ -v
```

> Fast (~0.5s). All Ollama calls are mocked.

### Frontend (17 unit tests)

```bash
cd frontend
npm test
```

### Run all at once (from repo root)

```bash
# AI service
(cd ai-service && source venv/bin/activate && python -m pytest tests/ -q)

# Frontend
(cd frontend && npm test)

# Backend (needs Docker)
(cd backend && set -a && source .env && set +a && mvn test -q)

# Identity service (needs Docker)
(cd identity-service && set -a && source ../backend/.env && set +a && mvn test -q)
```

ngrok http 5173 --domain=shout-strongly-naturist.ngrok-free.dev

cloudflared tunnel --url http://localhost:8080