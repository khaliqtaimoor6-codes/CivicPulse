from app.providers.triage.base import TriageResult
from app.providers.triage.rules import RuleBasedTriage


class SimulatedTriage:
	name = "simulated"

	def triage(self, text: str, location: str) -> TriageResult:
		result = RuleBasedTriage().triage(text, location)
		return result.model_copy(update={"confidence": 0.5})
