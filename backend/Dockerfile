FROM python:3.12.14-slim-bookworm AS builder

WORKDIR /app

COPY pyproject.toml ./
RUN python -m venv /opt/venv \
	&& /opt/venv/bin/pip install --no-cache-dir .

FROM python:3.12.14-slim-bookworm AS runtime

ENV PATH="/opt/venv/bin:$PATH" \
	PYTHONDONTWRITEBYTECODE=1 \
	PYTHONUNBUFFERED=1

RUN groupadd --system appuser \
	&& useradd --system --gid appuser --create-home appuser

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv

COPY app ./app
COPY scripts ./scripts
COPY alembic.ini ./
COPY alembic ./alembic

RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "10"]
