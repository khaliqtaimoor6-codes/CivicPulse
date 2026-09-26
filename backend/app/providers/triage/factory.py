from app.config import Settings
from app.providers.triage.base import TriageProvider
from app.providers.triage.llm import LLMTriage
from app.providers.triage.ollama import OllamaTriage
from app.providers.triage.rules import RuleBasedTriage
from app.providers.triage.simulated import SimulatedTriage


def get_triage_provider(settings: Settings) -> TriageProvider:
	if settings.triage_provider == "llm":
		if settings.llm_api_key is None:
			raise ValueError("LLM_TRIAGE_PROVIDER requires LLM_API_KEY")
		return LLMTriage(api_key=settings.llm_api_key)
	if settings.triage_provider == "ollama":
		# Deliberately key-free: this is the local/offline path, so there is
		# no LLM_API_KEY check here the way the groq branch has one.
		return OllamaTriage(
			base_url=settings.ollama_base_url,
			model=settings.ollama_model,
		)
	if settings.triage_provider == "rules":
		return RuleBasedTriage()
	if settings.triage_provider == "simulated":
		return SimulatedTriage()

	raise ValueError(f"Unsupported triage provider: {settings.triage_provider}")
