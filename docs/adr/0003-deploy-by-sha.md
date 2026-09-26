# ADR 0003: Deploy Immutable Images by Commit SHA

## Status

Proposed first draft for Stage 4 review. The repository does not yet contain
`cd.yml`, so the deployment workflow details below describe the intended
implementation rather than an already-running pipeline.

## Context

Deploying container images with a mutable tag such as `latest` makes a running
workload difficult to identify and a rollback difficult to reproduce. CivicPulse
needs a direct link between a deployed image and the source revision that built
it, while keeping rollback available during both incidents and normal release
operations.

## Decision

Stage 4 CD should build the backend and frontend images and tag their GHCR
references with `${{ github.sha }}`. Kubernetes overlays should receive the
immutable image references through Kustomize's `images:` field, and production
should never promote `:latest`. The deployment record therefore identifies the
exact commit used for each application image.

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
