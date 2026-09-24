# CivicPulse — API Contract (FROZEN — Stage 0)

> **Status:** frozen. partner B must read this against
> `Software_Construction_and_Design_Assignment_1.md` §2.2, §2.3, §2.5 line by
> line before checking the box below. Once both agree, change the status
> line above to `FROZEN <5:21 PM , 24TH SEP>`, commit, and do not change response
> shapes without telling your partner in the same hour.
>
> - [ tick ] Partner A verified against source PDF
> - [  ] Partner B verified against source PDF

---

## 2.2 Endpoints

| Method | Path | Behaviour |
|---|---|---|
| POST | `/api/complaints` | Validate → triage → persist. **201**. **400** with a field-level error body. **429** when the caller exceeds the rate limit. |
| GET | `/api/complaints/{id}` | **200** / **404** |
| GET | `/api/complaints` | Filter by `category`, `priority`, `status`; paginate (`page`, `page_size` ≤ 100); return `total`. |
| PATCH | `/api/complaints/{id}/status` | Enforce the state machine. Invalid transition → **409** naming the attempted transition. |
| GET | `/api/stats` | Aggregates, Redis-cached, TTL 30s, `X-Cache: HIT`/`MISS` header. |
| GET | `/api/meta/providers` | Which triage provider is active, and the last 20 triage outcomes (provider, latency ms, fallback y/n). |
| GET | `/health` | Liveness. Process is alive. Must **not** touch the database. |
| GET | `/ready` | Readiness. **200** only if Postgres and Redis are both reachable; **503** naming the failed dependency. |
| GET | `/metrics` | Prometheus text format: request count, request latency histogram, triage latency, fallback counter. |

**Why `/health` and `/ready` are separate:** Kubernetes uses them for different decisions — a failing liveness probe restarts your pod, a failing readiness probe removes it from the Service. Wiring them backwards turns a slow database into a restart loop across the whole deployment.

### Domain rule — status state machine
```
open → in_progress → resolved
open → rejected
in_progress → rejected
```
`resolved` and `rejected` are terminal. Everything else not listed above → **409**.
Implement as an explicit transition table, not a chain of `if`s.

---

## 2.3 Data layer — schema (PostgreSQL 16, Alembic-managed)

| Column | Notes |
|---|---|
| `id` | UUID, server-generated |
| `text` | 10–2000 chars, enforced in the DB as well as the app |
| `location` | 3–200 chars |
| `reporter_contact` | nullable |
| `category` | enum: `water` · `electricity` · `sanitation` · `roads` · `streetlights` · `other` |
| `priority` | enum: `high` · `normal` · `low` |
| `status` | enum: `open` · `in_progress` · `resolved` · `rejected`, default `open` |
| `ai_summary` | nullable — one line, ≤ 140 chars |
| `triaged_by` | `llm:groq` · `llm:ollama` · `rules` · `rules:fallback` |
| `triage_latency_ms` | integer |
| `created_at` / `updated_at` | timestamptz, UTC |

Required indexes: `(status, priority)` and `created_at` — document which query each one serves in engineering notes.

No `CREATE TABLE` in application startup code, ever — migrations only.

---

## 2.5 AI layer — the interface (verbatim, do not rename/add fields)

```python
class TriageResult(BaseModel):
    category: Category
    priority: Priority
    summary: str = Field(max_length=140)
    confidence: float = Field(ge=0.0, le=1.0)

class TriageProvider(Protocol):
    name: str
    def triage(self, text: str, location: str) -> TriageResult: ...
```

Four implementations, selected by `TRIAGE_PROVIDER` env var:

| Provider | Use |
|---|---|
| `LLMTriage` | Production path. Calls a free-tier hosted model (Groq / Gemini / other). |
| `OllamaTriage` | Fully offline path, a container in Compose. Same interface. |
| `RuleBasedTriage` | Deterministic keyword fallback. Always available, never fails. |
| `SimulatedTriage` | Deterministic fake for CI — seeded, no network, configurable failure injection. |

Non-negotiable behaviours around the interface (engineering marks live here):
1. Structured output requested from the model, **then validated against the Pydantic model anyway**. Never trust raw output.
2. Hard timeout: **10 seconds** on every LLM call.
3. Retry **once**, with jitter — only on timeout, 429, 5xx. Never retry a 400.
4. Fall back to `RuleBasedTriage` on exhaustion. Record `triaged_by = "rules:fallback"`. User must never see a 500 because a third party rate-limited you.
5. Cache by content hash in Redis, 24h TTL.
6. Never log the API key.
7. Prompt-injection guardrail: complaint text is untrusted data, not instruction — delimit clearly, constrain output to the enum, reject anything outside it.

**Must-write test:** given a provider that always raises, `POST /api/complaints` still returns **201** and `triaged_by == "rules:fallback"`.

---

## Cache/rate-limit contract (§2.4, referenced by routes above)

- **Stats cache:** read-through, TTL 30s, `X-Cache: HIT|MISS`, invalidate on write (new complaint → stats reflect it immediately, not after 30s).
- **Rate limiter:** distributed (Redis, not in-process — HPA will scale you to N pods), fixed-window or token-bucket, keyed by client IP, on `POST /api/complaints`. Exceeded → **429** + `Retry-After` header.
