# ADR 0003: Deploy Immutable Images by Commit SHA

## Status

Accepted and implemented. `.github/workflows/cd.yml` exists and runs on every
push to `main`: `test` → `build-push` → `deploy-k8s`, each gated by `needs:`.
Images are pushed to GHCR by `${{ github.sha }}` and the deploy job promotes the
captured image **digest** into the prod overlay, which is stronger than the
SHA-tag-only decision originally recorded here.

This ADR previously said the repository did not yet contain `cd.yml` and that the
details below described intent rather than a running pipeline. That was true when
written and stopped being true; the status has been corrected rather than left to
rot, and the Decision section records what was actually built.

## Context

Deploying container images with a mutable tag such as `latest` makes a running
workload difficult to identify and a rollback difficult to reproduce. CivicPulse
needs a direct link between a deployed image and the source revision that built
it, while keeping rollback available during both incidents and normal release
operations.

## Decision

CD builds the backend and frontend images and pushes their GHCR references
tagged with `${{ github.sha }}` (plus `latest`, which is published but never
deployed). SBOMs are emitted with Syft and the image digest is captured as a job
output. Kubernetes overlays receive the immutable image reference through
Kustomize's `images:` field, and production never promotes `:latest`. The
deployment record therefore identifies the exact commit used for each
application image.

**Deploying by digest rather than by SHA tag** is the bonus item, and it is what
the pipeline actually does: `cd.yml` publishes the digest as a job output and the
`deploy-k8s` job substitutes it into the overlay. Answering "what is production
running?" with a digest is strictly stronger than answering it with a tag,
because a tag can in principle be re-pushed while a digest cannot.

Two rollback paths are supported:

- `kubectl rollout undo deployment/civicpulse-backend` or the equivalent
  frontend command is the fast, imperative response during an incident. It
  reverts to the Deployment's previous ReplicaSet and is useful when service
  restoration matters more than immediately updating the repository.
- Re-applying a previous Kustomize overlay with its previous SHA is the
  declarative and auditable path for a normal rollback. It records the desired
  image revision in version control and lets the next CD run converge the
  cluster back to that known state.

## Consequences

Each image can be traced to an immutable source revision, and a deployment can
be reproduced without guessing what a mutable tag pointed to at a particular
time. Rollbacks are explicit: the imperative path is fast, while the previous
SHA path leaves the durable desired state and release intent in Git.

The tradeoff is that image tags and Kustomize overlays must be updated together,
and the registry must retain old SHA-tagged images for rollback. A rollback via
`rollout undo` can temporarily diverge from Git, so it should be followed by a
repository change or a declarative re-application once the incident is over.

Deploying by digest adds one operational obligation that tagging by SHA does not:
the registry must retain the old digests, because a digest that has been garbage
collected cannot be rolled back to at all. Retention policy is therefore part of
this decision, not a separate concern.
