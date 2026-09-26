from collections import deque

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import get_settings

router = APIRouter(prefix="/meta", tags=["meta"])
recent_triage_outcomes: deque[dict[str, object]] = deque(maxlen=20)


class TriageOutcome(BaseModel):
	provider: str
	latency_ms: int
	was_fallback: bool


class ProviderMetaResponse(BaseModel):
	active_provider: str
	recent_triages: list[TriageOutcome]


def record_triage(provider: str, latency_ms: int) -> None:
	recent_triage_outcomes.append(
		{
			"provider": provider,
			"latency_ms": latency_ms,
			"was_fallback": provider == "rules:fallback",
		}
	)


@router.get("/providers", response_model=ProviderMetaResponse)
def get_provider_meta() -> ProviderMetaResponse:
	return ProviderMetaResponse(
		active_provider=get_settings().triage_provider,
		recent_triages=list(recent_triage_outcomes),
	)
