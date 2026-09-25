# Stage 0 — Contract Freeze: What Happened & What's Locked

**Date/time completed:** 5:21 PM , 24TH SEP
**Present:** Partner A (Taimoor), Partner B (Eman) — same call/room, as required.
**AI used for:** boilerplate only (`.gitignore`, `.env.example` skeleton, repo-settings
checklist). **Not used for:** the contract content itself — §2.2, §2.3, §2.5 were
transcribed from the assignment PDF and verified line-by-line by both partners.

---

## What was produced

1. `docs/API-CONTRACT.md` — endpoint table, status state machine, DB schema,
   `TriageResult`/`TriageProvider` Protocol, cache/rate-limit contract. Both
   partners checked it against the source PDF and ticked the verification
   boxes at the top of that file.
2. `.gitignore` — Python + Node + Docker + IDE junk excluded (see prompt below).
3. `.env.example` — every env var referenced anywhere in the contract, with
   placeholder (non-secret) values.
4. Branch protection enabled on `main`; `dev` branch created.
5. GitHub Issues created from the rubric lines being attempted this sprint.

## What is now FROZEN (do not change without telling your partner in the same hour)

- Every field name, type, and enum value in `docs/API-CONTRACT.md`.
- The exact status codes per endpoint (201/400/429 on POST, 404 on GET-by-id,
  409 on invalid PATCH, etc.).
- The `TriageResult` / `TriageProvider` shapes — these are graded specifically
  as given in §2.5. No renamed or added fields, ever.
- The status state machine transitions (`open→in_progress→resolved`,
  `open→rejected`, `in_progress→rejected`; everything else is 409).

## Ownership going forward (per the battle plan)

- **Partner A** owns the response shape. If A needs to change it, A tells B
  immediately — B's typed frontend client depends on it.
- **Partner B**'s Stage 2 typed client (`frontend/src/api/client.ts`,
  `types.ts`) will be generated/checked against this contract's shape once
  the OpenAPI schema exists — so drift here is expensive later, not just now.

## Known open decisions deferred to later stages (not frozen here)

- Which LLM provider (Groq / Gemini / Ollama) — Stage 2, `providers/triage/llm.py`.
- PII handling for whichever hosted provider is chosen — ADR `0004`, Stage 3.
- Runtime config mechanism (`/config.js` vs nginx `/api` proxy) — ADR `0002`, Stage 3.

## Verification before moving to Stage 1

- [ ] Both partners re-read `docs/API-CONTRACT.md` once more, cold, no PDF open
- [ ] Branch protection confirmed active (try a direct push to `main` — it should fail)
- [ ] `dev` branch exists and is the default working branch
- [ ] GitHub Issues created, one per rubric line being attempted
- [ ] `.env.example` has no real secrets, only placeholders

## Stage 1 verification

- [x] Backend and frontend enum values match the frozen contract exactly.
- [x] Frontend Submit, Dashboard, and Stats routes compile successfully.
- [x] PostgreSQL 16, Redis 7, backend, and frontend Compose services run together.
- [x] Frontend image builds with Node 22 and nginx; backend image builds with Python 3.12.
- [x] Host API responds on port 8000 and the frontend is reachable on port 5173.
- [x] Seed data is idempotent: the second run creates 0 rows and skips 30 existing rows.
- [x] The Stage 1 frontend branch is merged into `dev` after the backend branch baseline.
