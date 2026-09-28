from app.providers.triage.base import Category
from app.providers.triage.rules import RuleBasedTriage


def test_clamped_pipe_is_not_a_streetlight() -> None:
	"""Regression: "lamp" is a substring of "clamp".

	Before the fix this reported Category.streetlights, so a water
	complaint never reached the water dashboard.
	"""
	provider = RuleBasedTriage()

	assert provider.triage("The pipe is clamped and leaking.", "Main Street").category is (
		Category.water
	)
	assert provider.triage("A lamplight fitting is broken.", "Main Street").category is (
		Category.streetlights
	)


def test_streetlight_is_not_reported_as_a_road() -> None:
	"""The roads entry matches bare "street", so order is load-bearing."""
	provider = RuleBasedTriage()

	assert provider.triage("The streetlight outside 12 is out.", "Main Street").category is (
		Category.streetlights
	)


def test_flooding_wins_over_water() -> None:
	"""A flooding report must be water, not roads, however it is worded."""
	provider = RuleBasedTriage()

	assert provider.triage("Flooding on the road after the storm.", "Main Street").category is (
		Category.water
	)
