# ADR 0004: PII and Data Governance

## Status

Accepted as the initial data-governance policy.

## Context

CivicPulse stores citizen-submitted complaint text, locations, and an optional
reporter contact value. Complaint text and locations may contain personal or
identifying information even when the API does not require a person's name.
The triage provider may also receive complaint content, so data handling must
be explicit and must not leak credentials or unnecessary request data into
logs.

## Decision

Treat `reporter_contact` as optional personal data and treat `text` and
`location` as potentially sensitive user input. Store only the fields needed
for complaint processing, triage, status tracking, and operational support.
Validate length at the API and database boundaries, and do not log complaint
text, location, contact information, API keys, or provider request bodies.

Application logs use structured JSON with a generated or caller-supplied
request ID, status and timing context, and selected non-sensitive identifiers.
The request ID is returned in `X-Request-ID` so an incident can be traced
without copying citizen content into log messages. Provider credentials come
from environment variables or Kubernetes Secrets and remain placeholders in
committed manifests.

Access to stored complaints and operational logs is restricted to the service
and authorized operators. Retention and deletion should follow the deployment
owner's applicable civic-data policy; this repository does not claim a legal
retention period. Before production rollout, the owner must set the retention
period, deletion process, incident response contact, and any required consent
or public-record handling rules.

## Consequences

The design reduces accidental PII exposure in logs and source control while
preserving the data required by the complaint workflow. Request IDs make
debugging possible without logging full user submissions, and Secret-backed
configuration keeps credentials out of manifests and images.

The tradeoff is that support staff cannot diagnose every issue from logs alone;
authorized access to the complaint store may be needed. Retention, deletion,
and access-control implementation remain deployment responsibilities and must
be completed before treating the service as production-ready.
