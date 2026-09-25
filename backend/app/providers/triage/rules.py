from .base import Category, Priority, TriageResult


class RuleBasedTriage:
	name = "rules"

	def triage(self, text: str, location: str) -> TriageResult:
		lowered_text = text.lower()

		return TriageResult(
			category=self._category_for(lowered_text),
			priority=self._priority_for(lowered_text),
			summary=self._summary_for(text),
			confidence=0.6,
		)

	@staticmethod
	def _category_for(lowered_text: str) -> Category:
		if any(keyword in lowered_text for keyword in ("streetlight", "lamp")):
			return Category.streetlights
		if any(keyword in lowered_text for keyword in ("water", "leak", "flooding")):
			return Category.water
		if any(keyword in lowered_text for keyword in ("wire", "power", "electric")):
			return Category.electricity
		if any(keyword in lowered_text for keyword in ("garbage", "sewage", "drain")):
			return Category.sanitation
		if any(keyword in lowered_text for keyword in ("pothole", "road")) or (
			"street" in lowered_text and "streetlight" not in lowered_text
		):
			return Category.roads
		return Category.other

	@staticmethod
	def _priority_for(lowered_text: str) -> Priority:
		if any(
			keyword in lowered_text
			for keyword in (
				"flooding",
				"fire",
				"exposed wire",
				"burst",
				"gas leak",
				"life-threatening",
				"life threatening",
				"killed",
				"fatal",
				"death",
				"dead",
				"injured",
				"injury",
			)
		):
			return Priority.high
		if any(keyword in lowered_text for keyword in ("minor", "cosmetic")):
			return Priority.low
		return Priority.normal

	@staticmethod
	def _summary_for(text: str) -> str:
		summary = " ".join(text.split())
		if len(summary) <= 100:
			return summary

		truncated = summary[:100].rsplit(" ", 1)[0]
		return f"{truncated}..." if truncated else f"{summary[:100]}..."

