# ENGINEERING-NOTES

## Backend image hardening

- `backend/Dockerfile` uses the pinned `python:3.12.14-slim-bookworm` tag in a builder and a separate runtime stage. Dependencies are installed from `pyproject.toml` into `/opt/venv` before application source is copied.
- The runtime image contains the virtualenv, application source, scripts, and Alembic migrations only. It runs as `appuser`, declares a `/health` liveness `HEALTHCHECK`, and starts Uvicorn in exec form with `--timeout-graceful-shutdown 10`.
- The `backend/.dockerignore` excludes local environments, caches, tests, credentials, coverage output, and Markdown documentation. Tests are not needed at runtime; `alembic/versions/` remains included because migrations are needed at runtime.
- The digest pin bonus can be applied by appending `@sha256:<verified-digest>` to both `FROM python:3.12.14-slim-bookworm` references after verifying the digest for the intended platform.

### Build evidence

Measured from the repository root on 2026-09-25:

| Measurement | Result |
| --- | ---: |
| Backend context before `.dockerignore` | 11.73 MiB (12,294,896 bytes) |
| Docker build context after `.dockerignore` | 29.06 kB |
| Built `civicpulse-backend` image | 323 MB (322,955,960 bytes) |

The image build succeeded. `docker run --rm civicpulse-backend which gcc` exited with code 1, confirming that the final image does not contain the compiler toolchain. A bare container launch without `DATABASE_URL` and `REDIS_URL` exits during application configuration; the Compose deployment supplies those required settings.

## Local LLM triage provider

- `backend/app/providers/triage/ollama.py` implements the same `TriageProvider` protocol as
  `llm.py` and reports `triaged_by="llm:ollama"`. It adds no API key path at all, which is the
  point: it is the provider to use when egress or a paid key is unavailable.
- Ollama's `format: "json"` is a soft hint and was not sufficient. Every response was rejected by
  the existing strict key-set check because the model emitted `{"complaints": [{...}]}`. Passing a
  JSON schema as `format` moved acceptance from 0/6 to 10/10. The schema's enum values are derived
  from the `Category` and `Priority` enums so it cannot drift from the accepted values.
- The provider's own client timeout is set above the 10-second `TriageService` budget on purpose.
  `TriageService` wraps providers in a future with a timeout, and only its `TimeoutError` is treated
  as retryable; an `httpx` timeout below 10 seconds would raise an exception that is not recognised
  as retryable and would skip the retry.
- `httpx` was promoted from a dev-only dependency to a runtime dependency. It was previously present
  only transitively through `groq`, which is not a safe thing to import at runtime.

### Measured evidence

Measured on 2026-09-26 with Ollama 0.34.4 and `llama3.2:1b`, CPU-only.

| Measurement | Result |
| --- | ---: |
| Responses accepted with `format: "json"` | 0/6 |
| Responses accepted with a JSON schema | 10/10 |
| Category accuracy, category-defining prompt | 9/10 (90%) |
| Category accuracy, abstract enum prompt | 4/10 (40%) |
| Category accuracy, three few-shot examples | 3/10 (30%) |
| Priority accuracy, all three prompt strategies | 3/9 (33%) |
| Priority values returned across 9 inputs | `high` 9/9 |
| Latency with default `num_ctx` 4096 | ~100 s |
| Latency with `num_ctx` 2048 | 2.4 s mean, 3.0 s max |
| Live complaints triaged as `llm:ollama` | 5/5 |
| `civicpulse_triage_fallbacks_total` after those 5 | 0 |

The five live complaints returned correct categories (`water`, `streetlights`, `roads`,
`electricity`, `sanitation`) in 2465-2955 ms with no fallback, confirmed by direct query against
Postgres rather than only through the API.

**Known limitation.** Priority classification is not usable on this model: it returns `high` for
every input. Enum definitions, explicit priority definitions, and few-shot examples were each
measured and none improved it. A 1B model lacks the resolution for a three-way severity judgement.
This is the measurable cost of the fully-offline path and the reason the external provider stays
the recommendation where quality matters. `llama3.2:3b` could not be measured on the 7.6 GiB test
machine, where loading it exhausted available memory; `OLLAMA_MODEL` is a one-variable swap to
retry on adequate hardware.

**Fix path, identified but unproven.** A 7B-or-larger model has the headroom for a three-way
severity judgement that 1B lacks, and needs no code change to try because the schema and prompt are
model-agnostic. Failing that, a purpose-built classifier -- fine-tuned on labelled complaint/priority
pairs, or a small supervised model over TF-IDF features -- would likely beat 1B outright, since
priority is a learned keyword mapping rather than a reasoning task; the existing rule-based provider
is the un-tuned version of that idea. Neither could be measured on the available hardware, so the
offline path should currently be described as viable for category triage and not yet for priority.

### Cluster scope

Ollama is intentionally not deployed to Kubernetes. `TRIAGE_PROVIDER` stays `simulated` in
`k8s/base/configmap.yaml` because selecting `ollama` without an accompanying Ollama Deployment and
Service would fail every triage call into `rules:fallback` while still reporting healthy status.
Ollama is a local and demo-only path for now.

