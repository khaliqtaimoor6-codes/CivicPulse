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

### Static host (frontend only)

The frontend builds to a static bundle, so it can be uploaded to a static host.
`frontend/vercel.json` holds the Vercel settings: `npm run build`, output
directory `dist`, and a catch-all rewrite to `/index.html`. Set the project's
Root Directory to `frontend`.

The rewrite is load-bearing, not cosmetic. `/dashboard` and `/stats` exist only
inside the router, so without a fallback a direct load or a shared link returns
the host's 404 page while the same routes work fine when clicked. Vercel checks
the filesystem before applying rewrites, so hashed `/assets/*` files, the
favicon, and the fonts are still served as files rather than being swallowed by
the fallback.

This does not produce a working CivicPulse on its own. API calls are relative
(`/api/complaints`) and Nginx is the component that proxies that prefix to the
backend, per ADR 0002. A static host has no Nginx, so `/api/...` resolves to
the static host itself and comes back as the app shell, which the client reports
as an unusable response instead of data. Two ways out:

- Add a serverless function or proxy rewrite for `/api/*` on the host, pointing
  at a reachable backend. Keeps the frontend static, but adds a hop and a
  platform-specific piece to a design that is currently origin-agnostic.
- Serve the built `dist/` from the same origin as the backend and keep the
  Nginx proxy in front of it, which is what Compose and Kubernetes already do.

Prefer the second for anything real. Treat a static-host deploy as a way to
review the frontend, not as a deployment of the system.

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
