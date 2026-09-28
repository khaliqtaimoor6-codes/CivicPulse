from .base import Category, Priority, TriageResult

# Ordered most-specific first. Sequence is load-bearing: "flooding" must be
# tested before "water" or a flooding report lands in the wrong category, and
# the roads entry only matches "street" once "streetlight" has been ruled out.
CATEGORY_KEYWORDS: tuple[tuple[Category, tuple[str, ...]], ...] = (
	# Bare "lamp" matched inside "clamp" and "lamplight", so a report about a
	# clamped pipe was filed as a streetlight and never reached the water
	# dashboard. These are the two spellings people actually use, and the
	# substring test the rest of this table relies on still works.
	(Category.streetlights, ("streetlight", "lamp post", "lamppost", "lamplight")),
	# Bare "leak" matched any leak at all, so a gas leak was filed as a water
	# complaint and never reached the engineer qualified to handle it. The
	# water-specific compounds people actually write are listed instead; a
	# report that only says "leak" with no water context now falls through to
	# `other` and keeps its high priority.
	(Category.water, ("flooding", "water", "water main", "pipe leak", "leaking pipe", "burst pipe", "hydrant leak")),
	(Category.electricity, ("wire", "power", "electric")),
	(Category.sanitation, ("garbage", "sewage", "drain")),
	# A bare "street" would also catch "streetlight" and "Main Street" in
	# every address, so it is only a match once the entries above have been
	# ruled out. Keep this last.
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

