# CivicPulse Runbook

## Deploy

### Local dev cluster

Build or import the local images, then render and apply the dev overlay:

```bash
docker build -t civicpulse-backend:dev ./backend
docker build -t civicpulse-frontend:dev ./frontend
k3d image import civicpulse-backend:dev civicpulse-frontend:dev -c civicpulse
kubectl apply -k k8s/overlays/dev
kubectl rollout status statefulset/postgres -n civicpulse --timeout=180s
kubectl rollout status deployment/civicpulse-backend -n civicpulse --timeout=180s
kubectl rollout status deployment/civicpulse-frontend -n civicpulse --timeout=180s
```

### Production pipeline

`.github/workflows/cd.yml` runs on pushes to `main`. It re-runs backend and
frontend tests, builds and pushes SHA-tagged GHCR images, captures their
digests, creates an ephemeral kind cluster, replaces the prod overlay image
references with those digests, creates the runtime Kubernetes Secret from
GitHub Secrets, applies the overlay, waits for rollouts, and runs a smoke test.

To render the same production manifests locally without applying them:

```bash
kustomize build k8s/overlays/prod
```

Rotating a value in the runtime Secret does not restart pods on its own, because
the Secret is not part of the Kustomize resource list and nothing else changes
the pod template. After rotating a Secret out-of-band, restart the consumers by
hand:

```bash
kubectl rollout restart statefulset/postgres -n civicpulse
kubectl rollout restart deployment/civicpulse-backend -n civicpulse
```

This is a deliberate scope decision, not an oversight. The CD deploy job was
reordered to create the Secret and then apply the overlay, and the unconditional
`rollout restart` was dropped from it: on a normal deploy the new ReplicaSet
already picks up the current Secret, so the restart was redundant work. The
trade-off is that the manual step above now exists for the rotation case, which
CD does not perform. Revisit if automated rotation is ever added.

### Container host (Fly.io)

`deploy/fly/` holds app definitions that deploy the images this repository
already builds, unmodified, as containers. Choose this over a static host when
you want the system online, because the backend, Postgres and Redis have to run
somewhere and a static host runs none of them.

```bash
fly apps create civicpulse-backend
fly apps create civicpulse-frontend

fly postgres create --name civicpulse-db --region iad
fly postgres attach --app civicpulse-backend civicpulse-db
fly redis create --name civicpulse-cache --region iad
fly redis attach --app civicpulse-backend --redis-name civicpulse-cache

fly secrets set --app civicpulse-backend CORS_ORIGIN=https://civicpulse-frontend.fly.dev

fly deploy backend  --config ../deploy/fly/backend.toml
fly deploy frontend --config ../deploy/fly/frontend.toml
```

The working directory argument is the build context, and `--config` is resolved
relative to it, hence the `../deploy/...` paths from the repository root. See
`deploy/fly/README.md` for the reasoning and for what the setup does not cover.

`backend.toml` sets `release_command = "alembic upgrade head"` so the schema is
applied once per deploy before new instances take traffic, which is the job
`k8s/base/migration-job.yaml` does on Kubernetes. Deploy the backend before the
frontend so the API contract stays stable for a bundle that is already live.

### Static host (frontend preview only)

The frontend builds to a static bundle, so it can be uploaded to a static host
to preview the UI. `frontend/vercel.json` holds the Vercel settings: `npm run
build`, output directory `dist`, and a catch-all rewrite to `/index.html`. Set
the project's Root Directory to `frontend`.

The rewrite is load-bearing, not cosmetic. `/dashboard` and `/stats` exist only
inside the router, so without a fallback a direct load or a shared link returns
the host's 404 page while the same routes work fine when clicked. Vercel checks
the filesystem before applying rewrites, so hashed `/assets/*` files, the
favicon, and the fonts are still served as files rather than being swallowed by
the fallback.

**This is a preview of the frontend, not a deployment of CivicPulse.** API calls
are relative (`/api/complaints`) and Nginx proxies that prefix to the backend
per ADR 0002. A static host has no Nginx, so `/api/...` resolves to the static
host itself and comes back as the app shell, which the client reports as an
unusable response instead of data. Submitting a complaint, loading the dashboard
and loading stats will all fail there. For a working system use the Compose
stack, the Kubernetes manifests, or the Fly.io definitions above.

## Roll Back

For an active incident, use the fast imperative rollback:

```bash
kubectl rollout undo deployment/civicpulse-backend -n civicpulse
kubectl rollout undo deployment/civicpulse-frontend -n civicpulse
kubectl rollout status deployment/civicpulse-backend -n civicpulse
kubectl rollout status deployment/civicpulse-frontend -n civicpulse
```

This restores the previous ReplicaSet quickly, but the cluster can temporarily
diverge from Git. For the long-term, auditable fix, re-apply the previous
production overlay with the previous immutable image SHA:

```bash
kustomize edit set image ghcr.io/khaliqtaimoor6-codes/civicpulse-backend@sha256:<previous-digest>
kustomize edit set image ghcr.io/khaliqtaimoor6-codes/civicpulse-frontend@sha256:<previous-digest>
kustomize build k8s/overlays/prod | kubectl apply -f -
```

Commit the restored image references so the next CD run does not reintroduce
the bad revision.

## Read Logs

The backend writes structured JSON to stdout. Read logs from a Kubernetes pod:

```bash
kubectl logs deployment/civicpulse-backend -n civicpulse --since=15m
```

Every request receives or propagates an `X-Request-ID`. Filter JSON logs for a
single request ID with `jq`:

```bash
kubectl logs deployment/civicpulse-backend -n civicpulse --since=15m \
	| jq -c 'select(.request_id == "<request-id>")'
```

## Triage Failures

Check provider activity and recent fallback outcomes first:

```bash
kubectl port-forward -n civicpulse svc/civicpulse-backend 18000:8000
curl --fail http://127.0.0.1:18000/api/meta/providers
kubectl logs deployment/civicpulse-backend -n civicpulse --since=15m \
	| jq -c 'select(.message == "triage_fallback")'
```

Run the `curl` check from your host against the port-forward above; the backend
image ships no `curl`, so `kubectl exec ... -- curl` will not work.

Then verify `TRIAGE_PROVIDER` and the Groq API key in the runtime Secret and
Deployment environment. Do not print the Secret value:

```bash
kubectl exec -n civicpulse deployment/civicpulse-backend -- printenv TRIAGE_PROVIDER
test -n "$(kubectl get secret civicpulse-secrets -n civicpulse -o jsonpath='{.data.LLM_API_KEY}')" \
	&& echo "LLM_API_KEY is present"
```

The service uses `RuleBasedTriage` as the fallback. A provider failure should
therefore produce `triaged_by = "rules:fallback"` and a warning log while
complaint submission continues to return a result instead of a 500 response.

### Connection pool ceiling

`pool_size=3` in `backend/app/db/session.py` is a **per-process** cap, and it is
only safe today because `backend/Dockerfile` runs uvicorn with a single worker.
If uvicorn is ever run with `--workers > 1`, the `pool_size=3` per-process cap
must be reduced proportionally, or the same `max_connections` ceiling that caused
the HPA cascade failure will reoccur at fewer replicas.

## Known issues

- **FastAPI must be bumped past 0.115.x before 2026-10-03** to clear the suppressed starlette CVEs, notably CVE-2026-54283 (DoS on an exposed endpoint). See `.trivyignore.yaml` for full justification.
