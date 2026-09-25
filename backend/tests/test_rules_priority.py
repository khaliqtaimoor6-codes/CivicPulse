from app.providers.triage.base import Priority
from app.providers.triage.rules import RuleBasedTriage


def test_explicitly_dangerous_complaints_are_high_priority() -> None:
	provider = RuleBasedTriage()

	for text in (
		"This is a life-threatening gas leak on Main Street.",
		"Someone was killed by the unsafe structure near the market.",
		"A resident was injured by a fallen power cable.",
	):
		assert provider.triage(text, "Main Street").priority is Priority.high