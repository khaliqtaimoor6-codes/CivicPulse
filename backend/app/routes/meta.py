from collections import deque

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import get_settings

router = APIRouter(prefix="/meta", tags=["meta"])


class TriageOutcome(BaseModel):
	provider: str
	latency_ms: int
	was_fallback: bool


class ProviderMetaResponse(BaseModel):
	active_provider: str
	recent_triages: list[TriageOutcome]


# Typed as deque[TriageOutcome], not deque[dict[str, object]]. The previous
# annotation described the dicts this buffer used to hold, and Pydantic silently
# coerced each one on the way into ProviderMetaResponse. Storing the model
# directly makes the buffer's contents the same type the response declares, so
# the /api/meta/providers payload is validated once, on write, instead of on
# every read of the last-20 window.
recent_triage_outcomes: deque[TriageOutcome] = deque(maxlen=20)


def record_triage(provider: str, latency_ms: int) -> None:
	recent_triage_outcomes.append(
		TriageOutcome(
			provider=provider,
			latency_ms=latency_ms,
			was_fallback=provider == "rules:fallback",
		)
	)


@router.get("/providers", response_model=ProviderMetaResponse)
def get_provider_meta() -> ProviderMetaResponse:
	return ProviderMetaResponse(
		active_provider=get_settings().triage_provider,
		recent_triages=list(recent_triage_outcomes),
	)
