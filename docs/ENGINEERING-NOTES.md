# ENGINEERING-NOTES

The eight questions from §5.2 of the assignment brief, answered against this
repository with file-and-line references. Two measured appendices follow the
questions: image hardening, and the local LLM provider.

---

## 1. Three things that differ between a laptop and a CI runner, and the line that freezes each

**The Python interpreter.** A laptop has whatever the user installed. This
machine has Python 3.14.4, and `backend/pyproject.toml:4` declares
`requires-python = "~=3.12.0"`, so a non-editable `pip install .` refuses to run
here at all. The version is frozen in three places, and the redundancy is the
lesson: `backend/Dockerfile:1` and `:9` (`FROM python:3.12.14-slim-bookworm`),
`backend/Dockerfile:6` (the venv the runtime stage copies at `:20`), and
`.github/workflows/ci.yml:28` (`python-version: "3.12"`). Only the container
version travels; the workflow version keeps the linter and the type checker on
the same minor as the image.

**The Node toolchain and therefore the bundle.** `frontend/Dockerfile:2` pins
`node:22-alpine` and `.github/workflows/ci.yml:51` pins `node-version: "22"`.
The line that actually matters is `frontend/Dockerfile:6`, `RUN npm ci` rather
than `npm install`. `npm ci` installs the lockfile exactly and fails if the
lockfile disagrees with `package.json`; `npm install` is free to resolve newer
transitive versions, so a laptop build and a CI build of the same commit produce
different `dist/` output and a green test run tells you nothing about the
artefact that ships.

**The datastores.** `compose.yaml:3` (`postgres:16-alpine`) and `compose.yaml:20`
(`redis:7-alpine`), with the same two tags repeated in
`k8s/base/postgres-statefulset.yaml:38` and `k8s/base/redis-deployment.yaml:34`.
This is not incidental pinning. The schema depends on engine behaviour, not just
Python behaviour: native Postgres enums via `native_enum=True` at
`backend/app/models/complaint.py:76`, and `gen_random_uuid()` as a server default
at `backend/app/models/complaint.py:66`. Both are Postgres 13+ features that a
different major version would not give for free.

A fourth, subtler difference is worth naming because it cost the most time:
**how many backend pods exist.** On a laptop there is one, so the connection
pool bounds at `backend/app/db/session.py:23-24`
(`pool_size=3, max_overflow=2`) are invisible — a cap of 5 per pod is never
approached. At `maxReplicas: 10` the same constants mean 50 connections against
one Postgres, and the design only works because the numbers were chosen for the
cluster rather than for the laptop. Sizing a resource limit for the environment
where it is easiest to measure is how a laptop-tuned pool takes down a cluster.

---

## 2. Where this pipeline sits on the CI/CD maturity ladder, and the next rung

**Rung: Continuous Deployment.** The standard ladder runs Manual → Continuous
Integration → Continuous Delivery → Continuous Deployment, and the distinction
between the last two is not whether a human is involved but *what* they approve.
Here a human approves the code, never the deploy: `main` is protected with one
approving review (`README.md`, CI/CD section), and once that approval lands,
`cd.yml` runs unattended end to end — `test` (`:14`) → `build-push`
(`:81-82`, gated by `needs: test`) → `deploy-k8s` (`:135-136`, gated by
`needs: build-push`), which creates an ephemeral k3d cluster (`:170`), applies
the prod overlay (`:243`), waits on `kubectl rollout status` (`:246`), smoke-tests
the Ingress (`:253`) and the API (`:271`), and prints the HPA (`:294`). No step
waits for a person. That is the definition of Continuous Deployment, and the
`needs:` graph is what makes it safe to automate: nothing publishes or deploys
from a commit that has not passed the full suite.

Worth being precise about one thing that looks like the rung below and is not:
the deploy target is an *ephemeral* cluster created inside the runner and torn
down with it. So the automation is complete but it does not yet reach a
long-lived environment.

**Next rung: GitOps.** Invert the push. Today CI holds cluster credentials and
issues imperative `kubectl apply` calls (`:243`), so the cluster's actual state
is whatever the last successful run left behind. With Argo CD or Flux, the
cluster pulls the desired state from this repository and reconciles itself.
Three concrete things that buys:

1. **Deploy credentials leave CI.** The pipeline would need read access to the
   repo and nothing else — a meaningfully smaller blast radius than a token that
   can `apply` to a live cluster.
2. **Drift is corrected instead of accumulated.** A human `kubectl edit` on a live
   cluster is silently overwritten by the next deploy today. Under GitOps it is
   reverted, and the revert is visible in the controller's status.
3. **Rollback becomes a revert, not an operation.** The rollback question in §3.4
   ("explain when you would use each mechanism") collapses to `git revert`,
   auditable by construction, rather than a `rollout undo` whose history lives
   only in the cluster.

The cost is honest and worth stating: GitOps adds a controller to operate and a
second place to look when a deploy misbehaves. It is the right next rung
precisely because the current rung's weakness — a pipeline that must *hold* the
cluster — is a permissions problem, not a correctness one.

---

## 3. The exact line that guarantees build-once-deploy-many, and what breaks without it

`frontend/Dockerfile:17`:

```dockerfile
COPY nginx.conf /etc/nginx/templates/default.conf.template
```

together with `frontend/nginx.conf:11`:

```nginx
proxy_pass http://${BACKEND_HOST};
```

The `nginx:alpine` entrypoint runs `envsubst` over everything in
`/etc/nginx/templates/` **at container start**, so `${BACKEND_HOST}` is resolved
from the environment when the container boots, not when the image was built. The
browser therefore never holds an absolute backend URL: it issues same-origin
requests to `/api/...` and nginx forwards them. `k8s/base/frontend-deployment.yaml`
sets `BACKEND_HOST` per environment, and the same image serves every environment.

**What breaks without it.** A Vite build inlines `import.meta.env.VITE_API_URL`
into static JavaScript at build time. The URL is then part of the artefact, so
pointing the frontend at a different backend requires a rebuild and a new image —
one image per environment, which is the definition of build-once-run-many. In
this repository it would break concretely: the prod overlay sets
`BACKEND_HOST: backend:8000` for in-cluster routing, and a baked-in URL could not
be repointed at the Ingress host without rebuilding, so the "same artefact in dev
and prod" claim in ADR 0002 would be false.

The secondary benefit: because the frontend is same-origin with the API, the
browser never needs CORS at all. The `CORSMiddleware` in
`backend/app/main.py:90-96` exists for the dev case only, where Vite serves the
app on `:5173` and the API on `:8000`.

Recorded in [ADR 0002](adr/0002-frontend-runtime-config.md).

---

## 4. What "correct" means for a probabilistic component, and how CI stayed deterministic

With `TRIAGE_PROVIDER=llm` the same complaint can produce different output, so
"correct" cannot mean "the category I would have picked". It means three
properties, all of which are enforceable while the model's judgement is not:

1. **The response is structurally valid** — it parses and validates against
   `TriageResult` (`backend/app/providers/triage/base.py:22-26`). Requesting
   valid JSON is not enough; the model will eventually return prose, a code
   fence, or a 400-character "one-line" summary, so the response is validated
   against the Pydantic model regardless of what was asked for.
2. **The output is inside the enum** — the JSON schema passed to the provider is
   derived from the `Category` and `Priority` enums rather than hand-written, so
   it cannot drift from the values the database will accept. Measured effect is
   in the appendix below: with `format: "json"` the 1B model produced output that
   validated 0/6 times; with a schema passed as `format`, 10/10.
3. **A user never sees a 5xx because a third party was slow or wrong.** Hard
   10-second cap (`backend/app/services/triage_service.py:19`), one retry with
   jitter and only on retryable classes — timeout, 429, 5xx
   (`triage_service.py:80-92`, `:69`) — then fall back to `RuleBasedTriage` and
   record `triaged_by = "rules:fallback"`.

So the LLM is an *optimisation* and the rule-based provider is the *contract*.
Correctness lives in the envelope, not in the model. The test the brief asks for
by name is `backend/tests/test_triage_fallback.py`: a provider that always
raises still yields 201 with `triaged_by == "rules:fallback"`.

**How CI stays deterministic.** `TRIAGE_PROVIDER=simulated`. `SimulatedTriage`
(`backend/app/providers/triage/simulated.py`) is a seeded, network-free fake, so
no test in the suite ever calls a hosted model and the same commit produces the
same verdict on every run. A flaky pipeline trains a team to ignore red, which is
worse than having no pipeline, so the failure modes are covered by injecting
providers rather than by retrying: a provider that always raises
(`test_triage_fallback.py`) and a malformed-output provider
(`test_prompt_injection.py`). There is no `time.sleep()` in any test and nothing
is re-run to get a pass.

---

## 5. HPA lag: seconds between offered load rising and replicas rising

**Measured: roughly 90 seconds**, from `docs/evidence/hpa-scaling.txt` §4 and the
raw `kubectl get hpa -w` capture in `docs/evidence/hpa-scaling.log`. The
progression was 2 replicas at 2% CPU → 6 replicas at 208% → 10 replicas at 233%,
then held at 10 for the rest of the run while utilisation sat at 207-232%
against a 60% target.

One caveat on the precision of that number, stated because it affects how much
the figure is worth: every row in `hpa-scaling.log` carries the same timestamp
(`2026-09-25T19:00:26Z`), so the log establishes the *sequence* and the
utilisation values but cannot supply a per-sample delta. The ~90s is the run
summary's figure for time-to-full-scale, not a difference computed from the log.
A capture with a real per-sample clock would be the honest way to report this.

**Where the time goes**, in the order it is incurred:

- metrics-server's scrape and aggregation interval before the HPA has a fresh
  CPU metric to act on (default 15s scrape, 60s aggregation window).
- the HPA controller's own sync loop (default 15s).
- scheduling, image pull and container start for each new pod.
- the `startupProbe` budget: `failureThreshold: 30` × `periodSeconds: 2` allows
  up to 60s before a slow-starting pod is killed. This is the largest single
  term and it is deliberate — it is what stops a slow boot becoming a restart
  loop — but it is a real cost to time-to-capacity.

`scaleUp.stabilizationWindowSeconds: 0` is already the aggressive setting, so
there is no stabilisation delay left to remove. The note in `hpa-scaling.txt` §4
that an earlier capture showed the HPA reacting to a Python-import CPU spike at
startup with no load at all is the flip side of that choice: zero stabilisation
buys the fastest response and also the fastest response to noise.

**What would reduce it:** pre-pulling images onto nodes so a scale-out does not
wait on a registry round trip; tightening the `startupProbe` period so Ready is
reached sooner; shortening the metrics-server aggregation window; and raising
`minReplicas` so less ramp is needed in the first place.

**The learning outcome.** A 90-second lag means a traffic spike is served by a
2-pod floor for a minute and a half. Autoscaling reduces the *duration* of
overload; it does not prevent the first 90 seconds of it, and it cannot help at
all if the cluster has no spare capacity to schedule into. That is why
`minReplicas: 2` is a capacity decision and not merely a configuration default.

---

## 6. Why VPA runs in `Off` mode, and the failure mode of `Auto` alongside this HPA

`k8s/base/backend-vpa.yaml:11-12` sets `updateMode: "Off"` — recommender only.
VPA observes and publishes `target`, `lowerBound` and `upperBound`; it never
evicts.

**Why the conflict is real here specifically.** The HPA scales on CPU
*utilisation*, and utilisation is `usage ÷ request`. VPA in `Auto` mode adjusts
that request. So both controllers are writing to the same equation from opposite
ends, and each one's output is the other's input:

1. VPA sees sustained usage, raises the CPU request.
2. A larger request makes computed utilisation *fall*, even though usage did not.
3. The HPA reads lower utilisation and scales **in**.
4. Fewer pods means each surviving pod handles more load, so real usage rises.
5. Utilisation rises again, the HPA scales **out**, and VPA — watching usage that
   the HPA caused — raises the request further.

Neither controller converges, because each is reacting to a signal the other is
actively moving. The observable symptom is flapping: replica counts and request
sizes oscillating together over minutes, with the cluster never settling.

**Why recommender plus a human decision is the practice instead.** VPA's
recommendation is derived from observed usage, so a recommender in `Auto` is
recommending against a distribution that the HPA is still reshaping. Running it
as an observer and treating its output as a proposal keeps one controller
authoritative for a given signal. That is also the loop actually performed here:
the manifest originally requested 100m CPU / 128Mi memory, the load test ran,
`kubectl describe vpa` was read (`docs/evidence/vpa-recommendations.txt`), and
the requests were updated to 150m / 192Mi.

**And the change had a directly observable HPA consequence**, which is the best
available evidence that the two are coupled: raising the CPU request from 100m
to 150m raised the HPA's 60% target from 60m to 90m of actual CPU per pod, so the
same 50-VU load no longer generated enough per-pod CPU to scale out. The load had
to be raised to 150 VUs to reach `maxReplicas` again (before/after table in
`docs/evidence/hpa-scaling.txt` §1). A team that "fixed" a flaky HPA by letting
VPA manage requests would have made it worse, not better.

---

## 7. `internal: true` blocks egress — where does the LLM-calling service live, and how was it resolved

**The trade-off, stated plainly.** `compose.yaml` and `compose.prod.yaml` both
declare a network `internal` with `internal: true`. Containers attached only to
it have no route to the outside world. That is exactly what is wanted for
Postgres and Redis, and exactly what is fatal for a component whose job is to
call a hosted model.

**The resolution, in Compose: the backend is on both networks.**
`postgres` and `redis` join `internal` only; `frontend` joins `edge` only; the
backend joins **both**. Being attached to `edge` — which is not `internal` —
is what preserves the backend's outbound path to Groq, while its attachment to
`internal` is what lets it reach the datastores. The backend is the only
container that bridges the two segments, which is the same reason it is the only
service holding both the database DSN and the API key.

**In Kubernetes the same result is achieved by omission rather than by
attachment.** There are no "internal" network flags, so
`k8s/base/network-policy.yaml` (8 policies) default-denies egress and then allows
specific destinations: the frontend gets DNS and the backend Service only, the
datastores get no egress at all, and the backend gets what it needs. Verified
empirically rather than assumed — `docs/evidence/network-isolation.txt` records
`frontend -> postgres` exiting 1 (blocked), `frontend -> backend` still 200, and
`backend` retaining datastore access including a real query.

That file also records the non-obvious part: on this CNI, egress is evaluated
*before* DNAT, so a DNS allow-rule written as `podSelector k8s-app=kube-dns`
silently fails, because `/etc/resolv.conf` points at the kube-dns **Service**
ClusterIP and a `podSelector` cannot match a Service IP. Symptom was
`NXDOMAIN` on every lookup while every pod still reported 1/1 Ready. The fix was
to allow both the pod selector and an `ipBlock` for the kube-dns ClusterIP. The
lesson generalises past this repo: *"all pods Ready" is not evidence that a
network policy applied correctly* — readiness probes were served over
already-established TCP connections and needed no fresh DNS lookup, so the
breakage was invisible to every signal except an explicit reachability test.

**The honest caveat, which is a design decision rather than an oversight.** The
cluster does **not** deploy an LLM provider. `TRIAGE_PROVIDER` stays `simulated`
in `k8s/base/configmap.yaml:22`, and Ollama is deliberately not deployed to the
cluster. The reason is the failure mode: selecting a hosted provider inside a
default-deny namespace requires an explicit, correctly-scoped egress rule, and a
missing or mis-scoped one does not fail loudly. Every triage call falls back to
`rules:fallback`, the pod stays healthy, the readiness probe passes, and the
service quietly stops being smart. A system that is up but answering from the
fallback path is harder to notice than one that is down — which is precisely why
`/api/meta/providers` exists as an observability surface, and why
`triage_latency_ms` and the `civicpulse_triage_fallbacks_total` counter are
recorded per complaint rather than inferred.

Enabling it properly is a small, well-understood change: add an egress rule for
the provider's host to the backend's policy. It is left undone because a
default-deny namespace that has not been tested against a real egress path is
worse than one that is honestly documented as local-only.

PII dimension: [ADR 0004](adr/0004-pii-and-data-governance.md).

---

## 8. The failure that cost more than an hour

**The connection-pool cascade.** Full evidence in
`docs/evidence/hpa-scaling.txt`, `pg-connection-ceiling.txt`,
`pg-connections-idle.txt`, `pg-connections-under-load.txt`.

**Symptoms.** At around 7 replicas every backend pod went to 0/1 Ready and would
not recover. Ten *idle* replicas were holding 97 of Postgres's 100 connections.
At the worst point the cluster was so far gone that a superuser `psql` connection
was refused too. Load tests reported 39.63% failed requests, and the HPA could
not rescue it because the pods it was scaling could not become ready.

**What I believed first.** That the cluster was short of CPU, or that the HPA
target was wrong, or — the assumption that turned out to be the most expensive —
that Postgres simply needed a higher `max_connections`. Each of those is a
plausible story that fits "too many pods, not enough connections", and each would
have produced a change that made things look better without making them better.
Raising `max_connections` in particular would have moved the cliff to a higher
replica count rather than removing it.

**What was actually true.** `create_engine()` was being called inside `get_db()`
*and* inside every `/ready` probe. So each request built a brand-new engine and
connection pool, and each readiness probe built another, none of them ever
disposed. The pool was not a pool; it was a factory. The system was leaking a
connection per request and per probe, and at 7 replicas × (1 request-connection
+ probe connections) that exhausted the table — and because the readiness probe
itself needed a connection from the same exhausted table, the pods could not
recover even after pressure subsided. A self-inflicted outage with no path out.

**The command that told the truth.** Sampling `pg_stat_activity` during load
rather than reading pod status: 113 samples at 3-second intervals
(`pg-connections-under-load.txt`). The line that mattered was not the peak count
but the *state* column — connections in `idle` while ten replicas sat at 0/1
Ready. Idle connections held by pods doing no work is the signature of a pool
that is never returned, not of a workload that is too heavy; a genuinely
overloaded service shows `active`. And `pg-connection-ceiling.txt`, showing that
even a superuser connection was refused, ruled out the "no headroom for admin
access" theory and pointed at a genuinely full table rather than a
misconfigured one.

**The fix and the result.** A module-level singleton engine at
`backend/app/db/session.py:20-27` with `pool_size=3, max_overflow=2`,
`pool_pre_ping=True`, `pool_recycle=1800`. The bounds are deliberate, not
tinker-derived: 5 connections per pod × `maxReplicas: 10` = 50, half of
`max_connections=100`, leaving room for admin access. After: 47,551 requests,
**0.00% failed**, 113 req/s (6.9×), stable at 10 replicas, peak 52 of 100
connections — the pool is now the thing limiting connections, which is the point.

**A second failure worth one line, because it is a different shape of trap.** The
first real CD run failed its coverage gate while every test passed. A non-editable
`pip install` had put a *copy* of `app/` into `site-packages` (it is a namespace
package), so pytest ran the checked-out source while coverage.py measured the
copy — a tree that never executed. Output was "No data was collected", `TOTAL
0.00%`, failing `--cov-fail-under=65`. Written up in `.github/workflows/cd.yml:57-70`.
A green test run that is measuring nothing is more dangerous than a red one,
because it reports success. Both failures shared a shape: the symptom pointed at
the resource (connections, coverage) and the cause was one layer of indirection
away from where anyone was looking.

---

# Appendix A — Backend image hardening

- `backend/Dockerfile` uses the pinned `python:3.12.14-slim-bookworm` tag in a
  builder and a separate runtime stage. Dependencies are installed from
  `pyproject.toml` into `/opt/venv` before application source is copied.
- The runtime image contains the virtualenv, application source, scripts, and
  Alembic migrations only. It runs as `appuser`, declares a `/health` liveness
  `HEALTHCHECK`, and starts Uvicorn in exec form with
  `--timeout-graceful-shutdown 10`.
- The `backend/.dockerignore` excludes local environments, caches, tests,
  credentials, coverage output, and Markdown documentation. Tests are not needed
  at runtime; `alembic/versions/` remains included because migrations are needed
  at runtime.
- The digest pin bonus can be applied by appending `@sha256:<verified-digest>` to
  both `FROM python:3.12.14-slim-bookworm` references after verifying the digest
  for the intended platform.

## Build evidence

Measured from the repository root on 2026-09-25:

| Measurement | Result |
| --- | ---: |
| Backend context before `.dockerignore` | 11.73 MiB (12,294,896 bytes) |
| Docker build context after `.dockerignore` | 29.06 kB |
| Built `civicpulse-backend` image | 323 MB (322,955,960 bytes) |

The image build succeeded. `docker run --rm civicpulse-backend which gcc` exited
with code 1, confirming that the final image does not contain the compiler
toolchain. A bare container launch without `DATABASE_URL` and `REDIS_URL` exits
during application configuration; the Compose deployment supplies those required
settings.

---

# Appendix B — Local LLM triage provider

- `backend/app/providers/triage/ollama.py` implements the same `TriageProvider`
  protocol as `llm.py` and reports `triaged_by="llm:ollama"`. It adds no API key
  path at all, which is the point: it is the provider to use when egress or a
  paid key is unavailable.
- Ollama's `format: "json"` is a soft hint and was not sufficient. Every response
  was rejected by the existing strict key-set check because the model emitted
  `{"complaints": [{...}]}`. Passing a JSON schema as `format` moved acceptance
  from 0/6 to 10/10. The schema's enum values are derived from the `Category` and
  `Priority` enums so it cannot drift from the accepted values.
- The provider's own client timeout is set above the 10-second `TriageService`
  budget on purpose. `TriageService` wraps providers in a future with a timeout,
  and only its `TimeoutError` is treated as retryable; an `httpx` timeout below
  10 seconds would raise an exception that is not recognised as retryable and
  would skip the retry.
- `httpx` was promoted from a dev-only dependency to a runtime dependency. It was
  previously present only transitively through `groq`, which is not a safe thing
  to import at runtime.

## Measured evidence

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

The five live complaints returned correct categories (`water`, `streetlights`,
`roads`, `electricity`, `sanitation`) in 2465-2955 ms with no fallback, confirmed
by direct query against Postgres rather than only through the API.

**Known limitation.** Priority classification is not usable on this model: it
returns `high` for every input. Enum definitions, explicit priority definitions,
and few-shot examples were each measured and none improved it. A 1B model lacks
the resolution for a three-way severity judgement. This is the measurable cost of
the fully-offline path and the reason the external provider stays the
recommendation where quality matters. `llama3.2:3b` could not be measured on the
7.6 GiB test machine, where loading it exhausted available memory; `OLLAMA_MODEL`
is a one-variable swap to retry on adequate hardware.

**Fix path, identified but unproven.** A 7B-or-larger model has the headroom for
a three-way severity judgement that 1B lacks, and needs no code change to try
because the schema and prompt are model-agnostic. Failing that, a purpose-built
classifier — fine-tuned on labelled complaint/priority pairs, or a small
supervised model over TF-IDF features — would likely beat 1B outright, since
priority is a learned keyword mapping rather than a reasoning task; the existing
rule-based provider is the un-tuned version of that idea. Neither could be
measured on the available hardware, so the offline path should currently be
described as viable for category triage and not yet for priority.

## Cluster scope

Ollama is intentionally not deployed to Kubernetes. `TRIAGE_PROVIDER` stays
`simulated` in `k8s/base/configmap.yaml` because selecting `ollama` without an
accompanying Ollama Deployment and Service would fail every triage call into
`rules:fallback` while still reporting healthy status. Ollama is a local and
demo-only path for now. See question 7 above for the network-policy reasoning.
