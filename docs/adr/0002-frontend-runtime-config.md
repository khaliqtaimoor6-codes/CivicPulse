# ADR 0002: Frontend Runtime Backend Configuration

## Status

Accepted as the current frontend deployment decision.

## Context

The frontend is built once with Vite and served by Nginx. The backend address
differs between local Compose, Kubernetes, and deployed environments. Baking a
specific backend origin into the JavaScript bundle during `vite build` would
require a separate frontend image or rebuild for every environment and could
make environment changes difficult to audit.

## Decision

Keep frontend API calls relative, using paths such as `/api/complaints`, and
let the Nginx runtime configuration proxy `/api/` to the backend. The current
`frontend/nginx.conf` is an Nginx template: its startup entrypoint expands the
runtime `BACKEND_HOST` value and uses `proxy_pass http://${BACKEND_HOST};`.
The frontend container therefore receives the backend host at startup rather
than compiling it into the Vite bundle.

The same approach is used in Compose and Kubernetes: Compose supplies
`BACKEND_HOST=backend:8000`, while the Kubernetes frontend Deployment points
to the in-cluster backend Service. The proxy preserves the `/api` prefix,
which matches the backend routers mounted under `/api`.

## Consequences

One immutable frontend image can run in multiple environments with only runtime
configuration changes. Backend URLs are kept out of browser JavaScript, and
the browser uses one same-origin API path, avoiding environment-specific CORS
origins for normal frontend requests.

The tradeoff is that Nginx becomes part of the API routing contract and must
be configured correctly. A broken `BACKEND_HOST` or proxy template is detected
at runtime rather than at frontend build time, and direct browser access to a
different backend origin is not provided by this design.

The alternative considered was generating a `/config.js` file at container
startup and reading a backend URL from it in the application. That would make
the runtime value explicit to the browser but would add a configuration file,
startup generation logic, and another client-side code path. The existing
Nginx proxy already provides the required runtime flexibility with a smaller
surface, so the generated-config approach was not selected.
