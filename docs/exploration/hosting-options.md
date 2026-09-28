# Hosting options outside the graded scope

**Status: investigated, not used, and deliberately not shipped.**

This is a record of a detour, kept because the reasoning is reusable and
because the failure mode is easy to repeat. There is no deployment
configuration for any third platform in this repository, and there is not
meant to be.

## Why it was out of scope

The assignment defines what "done" means in §1.4: a stranger clones the
repository, runs one command to get the whole system up with seeded data, runs
a second command to put it on Kubernetes, and a push to `main` tests, builds
and deploys it. §5.8 then asks for the repository, a `cd.yml` run, both images
in GHCR, a demo video, `git shortlog -sn`, and an HPA capture.

Compose, the `k8s/` overlays, and `cd.yml` are that. A static host and a
container host are both a third deployment story to build, document and keep
working, in exchange for nothing that is graded. They were dropped on scope
grounds, not because they were found wanting.

## The finding worth keeping

**A frontend bundle on a static host is not a deployment of this system, and
cannot be made into one without changing an accepted decision.**

The frontend calls the API with relative paths (`/api/complaints`) and nginx
proxies that prefix to the backend. This is ADR 0002, and §2.1 of the
assignment offers it as one of two correct ways to solve runtime
configuration. The consequence is that the API is same-origin: the browser
talks only to the frontend, and nginx is the component that reaches the
backend.

A static host runs no nginx, and has no FastAPI, Postgres or Redis behind it.
`/api/...` resolves to the static host itself, which returns the app shell
where the client expects JSON. The client reports an unusable response rather
than pretending, and submitting a complaint, loading the dashboard and loading
stats all fail.

Making that work would have meant a serverless function for the backend plus
managed Postgres and managed Redis, and an env-var API base in the frontend.
That last part contradicts ADR 0002 and §2.1, both of which are graded, so it
was not worth doing for an ungraded destination. Redis is not optional here
either: `redis_url` is a required setting and both the rate limiter and the
stats cache use it unconditionally.

The same reasoning rules out hosting the bundle anywhere that is not the
backend's origin, which is why `frontend/vercel.json` is scoped as a preview
and nothing more.

## What a container host would have needed

Worth recording because the shape is not obvious from the repository:

- A release step running `alembic upgrade head` before new instances take
  traffic, the equivalent of `k8s/base/migration-job.yaml`. The image's `CMD`
  is uvicorn, so nothing applies the schema on startup. This was verified by
  running that command inside the built image against a live Postgres.
- `flyctl` resolves `--config` and the Dockerfile path relative to the working
  directory, which is also the build context, so app definitions held outside
  the service directory need paths that climb out of it. There is no
  `[build] context` key. Getting this wrong deploys with platform defaults
  rather than the intended configuration, and fails quietly.

Both were understood and then discarded, because the destination was wrong.

## What is actually supported

- `docker compose up` for the laptop, which is the §1.4 bar.
- `k8s/overlays/dev` and `k8s/overlays/prod` for a cluster.
- `cd.yml` for the tested, digest-pinned, undoable deploy that §5.8 asks for.

`docs/RUNBOOK.md` has the commands for all three.
