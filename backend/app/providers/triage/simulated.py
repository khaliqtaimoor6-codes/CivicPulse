from app.providers.triage.base import Category, Priority, TriageProvider, TriageResult


class SimulatedTriage:
	name = "simulated"

	def triage(self, text: str, location: str) -> TriageResult:
		return TriageResult(
			category=Category.other,
			priority=Priority.normal,
			summary=" ".join(text.split())[:100],
			confidence=0.5,
		)
