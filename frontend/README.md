# CivicPulse Frontend

React 18 + Vite + TypeScript SPA for Citizen complaint intake and the
operations dashboard. It is built once and served by `nginx:alpine` from the
multi-stage image in this directory.

## Routes

| Path | View | What it does |
| --- | --- | --- |
| `/` | Submit | Free-text complaint, location, optional contact. Mirrors the server's validation, renders the loading state honestly, and shows the returned category, priority, AI summary and the provider that produced it. |
| `/dashboard` | Dashboard | Paginated, filterable complaint list (category, priority, status). Operator can advance status; an invalid transition surfaces the server's `409` message verbatim. |
| `/stats` | Stats | Aggregate counts by category and priority, plus the cache-hit state read from the `X-Cache` header. |

## Runtime configuration

API calls are relative (`/api/...`) and Nginx proxies that prefix to the
backend at container start, resolving `BACKEND_HOST` from the environment (see
`nginx.conf` and `docs/adr/0002-frontend-runtime-config.md`). No absolute
backend URL is ever baked into the bundle, so one image runs in any
environment.

## Scripts

```bash
npm run dev          # Vite dev server (HMR) on :5173
npm run build        # tsc -b && vite build
npm run lint         # ESLint
npm run test         # Vitest component tests
npm run check:openapi # drift-check src/api/types.ts against a live /openapi.json
```

## Contract checking

`check:openapi` proves the typed client has not rotted against the backend's
OpenAPI schema. It needs a running API:

```bash
curl -s http://localhost:8000/openapi.json -o /tmp/openapi.json \
  && node scripts/check-openapi-drift.js
```

The CI `test-backend` job boots the API and runs this check automatically.

## Tests

115 Vitest tests with Testing Library (`npm run test`), covering the submit
form, dashboard pagination/filtering, status transitions including the `409`
message, the stats view's cache badge, and the error boundary.