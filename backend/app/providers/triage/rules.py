from .base import Category, Priority, TriageResult

# Ordered most-specific first. Sequence is load-bearing: "flooding" must be
# tested before "water" or a flooding report lands in the wrong category, and
# the roads entry only matches "street" once "streetlight" has been ruled out.
CATEGORY_KEYWORDS: tuple[tuple[Category, tuple[str, ...]], ...] = (
	(Category.streetlights, ("streetlight", "lamp")),
	(Category.water, ("flooding", "water", "leak")),
	(Category.electricity, ("wire", "power", "electric")),
	(Category.sanitation, ("garbage", "sewage", "drain")),
	(
		Category.roads,
		("pothole", "road", "street"),
	),
)


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
		for category, keywords in CATEGORY_KEYWORDS:
			if any(keyword in lowered_text for keyword in keywords):
				return category
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

