FROM python:3.12-slim

WORKDIR /app

# Install dependencies first — cached unless requirements.txt changes
COPY requirements.txt .
RUN pip install --no-cache-dir --retries 10 --timeout 120 -r requirements.txt

COPY . .

EXPOSE 8000

# UVICORN_WORKERS: number of worker processes.
# Rule of thumb: 2 × CPU_count + 1. Set via env var in docker-compose / k8s.
# Default 2 is safe for a 1-2 vCPU container.
# PROMETHEUS_MULTIPROC_DIR: the workers share their metric values through this
# directory so /metrics reports the sum; emptied on every start, since values
# left by a previous container would be added to the new totals.
ENV PROMETHEUS_MULTIPROC_DIR=/tmp/prometheus-multiproc
CMD ["sh", "-c", "rm -rf \"$PROMETHEUS_MULTIPROC_DIR\" && mkdir -p \"$PROMETHEUS_MULTIPROC_DIR\" && exec uvicorn app:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-2}"]
