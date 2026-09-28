# CivicPulse Runbook

## Deploy

### Local dev cluster

Two prerequisites are not in the Kustomize output, so `kubectl apply -k
k8s/overlays/dev` cannot succeed on a brand-new cluster without them. Both are
created by CI in the pipeline; locally you have to do it by hand.

**1. The VerticalPodAutoscaler CRD.** `k8s/base/backend-vpa.yaml` is part of
the base, and the base is part of the dev overlay. Without the CRD installed the
apply stops at `no matches for kind "VerticalPodAutoscaler"` and never creates
the VPA:

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/vertical-pod-autoscaler-1.5.0/vertical-pod-autoscaler/deploy/vpa-v1-crd-gen.yaml
kubectl wait --for=condition=Established crd/verticalpodautoscalers.autoscaling.k8s.io --timeout=60s
```

**2. The runtime Secret.** `civicpulse-secrets` is deliberately *not* in
Kustomize, so that a real key never lands in git. Every `secretKeyRef` in the
manifests is non-optional, including `LLM_API_KEY`, so a missing key means
`CreateContainerConfigError` on the backend, the migration Job and Postgres:

```bash
kubectl create secret generic civicpulse-secrets -n civicpulse \
  --from-literal=DATABASE_URL='postgresql+psycopg2://civicpulse:civicpulse_dev_password@postgres:5432/civicpulse' \
  --from-literal=REDIS_URL='redis://redis:6379/0' \
  --from-literal=LLM_API_KEY='' \
  --from-literal=POSTGRES_USER='civicpulse' \
  --from-literal=POSTGRES_PASSWORD='civicpulse_dev_password' \
  --from-literal=POSTGRES_DB='civicpulse'
```

Those are the development credentials, matching `compose.yaml`. An empty
`LLM_API_KEY` is deliberate: it is a present key with no usable value, which is
what lets the Pod start while leaving `TRIAGE_PROVIDER` the only thing that
decides whether a model is actually called. Never reuse these values outside a
local cluster.

Now create the cluster. The `--port` mapping is load-bearing: k3d publishes
only the API server without it, so the Ingress is unreachable from the host and
every host-side check below fails with a connection refused.

```bash
k3d cluster create civicpulse --port "80:80@loadbalancer"
```

Then point `civicpulse.local` at the load balancer. On Windows this is
`C:\Windows\System32\drivers\etc\hosts`; elsewhere it is `/etc/hosts`. Either way
the line is the same:

```
127.0.0.1 civicpulse.local
```

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

The backend only serves requests once the migration Job has succeeded, so on a
brand-new cluster wait for that too -- it is a separate Job, not part of the
Deployment's rollout:

```bash
kubectl wait --for=condition=complete job/civicpulse-migrate -n civicpulse --timeout=180s
```

Verify the Ingress is actually serving before anything else is measured, then
seed if you want demo data (the script is idempotent, so re-running it is safe):

```bash
curl -s http://civicpulse.local/api/stats -o /dev/null -w '%{http_code}\n'   # expect 200
kubectl exec -n civicpulse deploy/civicpulse-backend -- python scripts/seed.py
```

### Reaching the backend in the local cluster

Three paths, and only the first one is usable while a rollout is in progress:

| Path | Command | Use it for |
| --- | --- | --- |
| Ingress | `curl http://civicpulse.local/api/...` | load tests, anything that must survive a rollout |
| `kubectl port-forward` | `kubectl port-forward -n civicpulse svc/civicpulse-backend 8000:8000` | quick one-off reads while debugging |
| in-cluster Pod | `kubectl exec -n civicpulse deploy/civicpulse-backend -- curl ...` | checking network policy from inside |

Do not load test through `port-forward`. It targets a single Pod by name, so
every replica set change during a scale-up tears the connection down and the run
reports failures that have nothing to do with the application.

### Proving the HPA scales

Four things have to be true at once, and each one has bitten this runbook before.

1. **The Ingress is serving.** `curl http://civicpulse.local/api/stats` must
   return 200 before a load run means anything. This needs the
   `--port "80:80@loadbalancer"` mapping at cluster creation.
2. **The cluster is already at `minReplicas`.** `scaleUp.stabilizationWindowSeconds`
   is 0 but the *first* sample still has to land, so starting from 10 replicas
   shows nothing.
3. **The rate limit is raised.** The limiter counts per client per minute, and
   k6 sends every request from one address. Left at 30, a load run is almost
   entirely `429`s and the HPA never sees real work. Raise it, then put it back:
   ```bash
   kubectl patch cm civicpulse-config -n civicpulse --type merge \
     -p '{"data":{"RATE_LIMIT_PER_MINUTE":"100000"}}'
   kubectl rollout restart deployment/civicpulse-backend -n civicpulse
   # ... run the load test ...
   kubectl patch cm civicpulse-config -n civicpulse --type merge \
     -p '{"data":{"RATE_LIMIT_PER_MINUTE":"30"}}'
   kubectl rollout restart deployment/civicpulse-backend -n civicpulse
   ```
4. **You wait out the scale-down window before repeating a run.**
   `scaleDown.stabilizationWindowSeconds` is 300, so after a run the HPA holds
   its peak for five minutes. A second run started inside that window begins at
   the previous peak and looks like the HPA did nothing. `kubectl scale
   deployment/civicpulse-backend -n civicpulse --replicas=2` does not help
   either -- the HPA scales it straight back up.

With all four satisfied, 150 VUs through the Ingress take the backend from 2 to
`maxReplicas` (10) and the target reads well past 100% on the way:

```bash
kubectl get hpa -n civicpulse -w &          # watch replicas climb
BASE_URL=http://civicpulse.local VUS=150 RAMP=30s HOLD=90s DOWN=30s \
  k6 run load/k6-script.js
```

`RAMP`/`HOLD`/`DOWN` above give a ~2.5 minute run; the script's defaults are the
7 minute evidence run. If `civicpulse.local` does not resolve, use
`BASE_URL=http://127.0.0.1:80 HOST_HEADER=civicpulse.local` -- the Ingress
routes on the `Host` header, which is why the name has to be present one way or
the other.

`kubectl get hpa -w` needs a TTY; in a script or a CI log, poll it instead
(`kubectl get hpa -n civicpulse --no-headers`) or the watch writes nothing.

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

### Hosting outside the graded scope

Compose, the Kubernetes overlays, and the `cd.yml` pipeline are the deployment
paths this project supports and the ones §1.4 and §5.8 ask for. A static host
such as Vercel can serve the frontend bundle for previewing, but it is not a
deployment of this system, and no third platform is configured. What was
looked at, and why it was dropped, is written up in
[exploration/hosting-options.md](exploration/hosting-options.md).

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
stack or the Kubernetes manifests.

## Roll Back

`kubectl rollout undo` can only move to a ReplicaSet that still exists, so on
a cluster that has only ever had one revision there is nothing to roll back to
and the command fails. Check first:

```bash
kubectl rollout history deployment/civicpulse-backend -n civicpulse
```

If that lists only revision 1, the rollback history has to be created once by
deploying the previous version explicitly, which leaves revision 2 as the
thing to undo back to:

```bash
# 1. Move to the version you want to roll back FROM. Use an immutable digest
#    in production; a tag is fine for a rehearsal.
kubectl set image deployment/civicpulse-backend -n civicpulse \
  backend=civicpulse-backend:<previous-tag>
kubectl rollout status deployment/civicpulse-backend -n civicpulse

# 2. The rollback is now available, and reverts to the prior ReplicaSet.
kubectl rollout undo deployment/civicpulse-backend -n civicpulse
kubectl rollout status deployment/civicpulse-backend -n civicpulse
```

Verify the rollback actually changed the running code rather than only the pod
names, by checking the image that is now serving and confirming the cluster
matches Git:

```bash
kubectl get deployment civicpulse-backend -n civicpulse \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

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
