# ENGINEERING-NOTES

## Backend image hardening

- `backend/Dockerfile` uses the pinned `python:3.12.11-slim-bookworm` tag in a builder and a separate runtime stage. Dependencies are installed from `pyproject.toml` into `/opt/venv` before application source is copied.
- The runtime image contains the virtualenv, application source, scripts, and Alembic migrations only. It runs as `appuser`, declares a `/health` liveness `HEALTHCHECK`, and starts Uvicorn in exec form with `--timeout-graceful-shutdown 10`.
- The `backend/.dockerignore` excludes local environments, caches, tests, credentials, coverage output, and Markdown documentation. Tests are not needed at runtime; `alembic/versions/` remains included because migrations are needed at runtime.
- The digest pin bonus can be applied by appending `@sha256:<verified-digest>` to both `FROM python:3.12.11-slim-bookworm` references after verifying the digest for the intended platform.

### Build evidence

Measured from the repository root on 2026-09-25:

| Measurement | Result |
| --- | ---: |
| Backend context before `.dockerignore` | 11.73 MiB (12,294,896 bytes) |
| Docker build context after `.dockerignore` | 29.06 kB |
| Built `civicpulse-backend` image | 323 MB (322,955,960 bytes) |

The image build succeeded. `docker run --rm civicpulse-backend which gcc` exited with code 1, confirming that the final image does not contain the compiler toolchain. A bare container launch without `DATABASE_URL` and `REDIS_URL` exits during application configuration; the Compose deployment supplies those required settings.
