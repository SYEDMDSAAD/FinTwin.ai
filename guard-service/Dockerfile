FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

# Dependencies first, cached unless requirements.txt changes
COPY requirements.txt .
RUN pip install --no-cache-dir --retries 10 --timeout 120 -r requirements.txt

COPY . .

# Never run as root
RUN useradd --create-home --uid 10001 guard
USER guard

# Cloud Run sets PORT. One worker: Cloud Run scales by adding instances.
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --timeout-graceful-shutdown 10"]
