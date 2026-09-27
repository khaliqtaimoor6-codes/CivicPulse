# Deploying to Fly.io

The whole stack, as containers, with the images this repository already
builds. Nothing is rebuilt or translated for the platform.

This exists because the frontend bundle alone is not a deployment of
CivicPulse. The API calls are relative and nginx proxies `/api/` to the
backend (ADR 0002), so serving `dist/` from a static host gives you a
frontend that renders and cannot load or submit anything. A container host
runs the backend, Postgres and Redis alongside it.

## Prerequisites

- `flyctl` installed and authenticated (`fly auth login`)
- Two apps created once, by hand, so their names match the `app` keys in the
  toml files:

  ```bash
  fly apps create civicpulse-backend
  fly apps create civicpulse-frontend
  ```

## One-time setup

Attach managed Postgres and Redis. Both write `DATABASE_URL` and `REDIS_URL`
as secrets on the backend app, which is why neither is in `backend.toml`:

```bash
fly postgres create --name civicpulse-db --region iad
fly postgres attach --app civicpulse-backend civicpulse-db

fly redis create --name civicpulse-cache --region iad
fly redis attach --app civicpulse-backend --redis-name civicpulse-cache
```

Point the backend's CORS at the frontend's public origin. Normal traffic
never needs it, since the browser only talks to the frontend origin and nginx
proxies the rest, but it keeps direct API access working for tooling:

```bash
fly secrets set --app civicpulse-backend \
  CORS_ORIGIN=https://civicpulse-frontend.fly.dev
```

If you want real triage rather than the simulated provider:

```bash
fly secrets set --app civicpulse-backend LLM_API_KEY=... TRIAGE_PROVIDER=llm
```

## Deploying

From the repository root. The first argument is the working directory, which is
what becomes the Docker build context, and the `--config` path is resolved
*relative to that working directory* rather than to your shell — so the paths
below climb out of the service directory and back into `deploy/`:

```bash
fly deploy backend  --config ../deploy/fly/backend.toml
fly deploy frontend --config ../deploy/fly/frontend.toml
```

Running `fly deploy` from inside `backend/` instead, with no `--config`, would
deploy the built app with Fly's defaults rather than the settings in this
directory. That is the most likely way to get a half-configured app.

`backend.toml` sets `release_command = "alembic upgrade head"`, so the schema
is applied once per deploy before new instances take traffic. That is the same
job `k8s/base/migration-job.yaml` runs. Check it landed with:

```bash
fly logs --app civicpulse-backend --deployed
```

Then confirm the whole path works, not just that the apps booted:

```bash
curl -s https://civicpulse-backend.fly.dev/health
```

## Updating

`fly deploy` again, backend first. Deploying the backend before the frontend
keeps the API contract stable for a bundle that is already live.

## What this does not cover

- **TLS and DNS.** `force_https` provisions a certificate on the default
  `fly.dev` domain. A custom domain needs `fly certs add` first.
- **Secrets in review.** `backend.toml` deliberately contains no `LLM_API_KEY`
  and no database URL, so nothing sensitive is committed.
- **Vercel.** `frontend/vercel.json` remains for previewing the frontend on its
  own. It is not a deployment of this system, because the backend, Postgres
  and Redis are not there.
