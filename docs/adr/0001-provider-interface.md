# ADR 0001: Provider Interface

## Status

Accepted as the initial implementation decision.

## Context

CivicPulse triages complaints, but the classification mechanism should not be
coupled to a single external AI provider or require a network call in every
environment. The backend also needs deterministic behavior for tests and
local development, while production may use an LLM when its credentials and
service are available.

## Decision

Define the triage contract as the `TriageProvider` Python `Protocol` in
`backend/app/providers/triage/base.py`. A provider exposes a `name` and a
synchronous `triage(text, location)` method that returns the shared
`TriageResult` model.

Select the primary provider through the `TRIAGE_PROVIDER` environment setting
in `get_triage_provider`. The implemented values are:

- `simulated`, implemented by `SimulatedTriage`, for deterministic local and
	CI execution without network calls.
- `rules`, implemented by `RuleBasedTriage`, for local deterministic
	classification.
- `llm`, implemented by `LLMTriage` using the Groq client.

`TriageService` receives the selected provider through this interface and
uses `RuleBasedTriage` as its documented fallback when the primary provider
fails or times out. This keeps provider selection and failure handling outside
the complaint route and makes the boundary explicit for future providers.

## Consequences

The system is decoupled from any one AI provider: the service depends on the
small protocol and result model rather than Groq-specific calls. Tests can
select `TRIAGE_PROVIDER=simulated` and exercise complaint workflows without
network access or an LLM key. The fallback path is visible in the service and
can be tested independently, and a future provider can be added by
implementing the protocol and registering one factory branch.

The tradeoff is an additional abstraction layer and a factory for a small
team. Each provider must preserve the same result contract, and the factory
must be updated when a new configured provider is introduced. The LLM option
also retains an external service dependency, so deterministic CI uses the
simulated provider rather than the network-backed implementation.
