FROM python:3.14-slim

WORKDIR /app

# Install dependencies first — cached unless requirements.txt changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# UVICORN_WORKERS: number of worker processes.
# Rule of thumb: 2 × CPU_count + 1. Set via env var in docker-compose / k8s.
# Default 2 is safe for a 1-2 vCPU container.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-2}"]
