from app.providers.triage.base import Category
from app.providers.triage.rules import RuleBasedTriage


def test_clamped_pipe_is_not_a_streetlight() -> None:
	"""Regression: "lamp" is a substring of "clamp".

	Before the fix this reported Category.streetlights, so a water
	complaint never reached the water dashboard.
	"""
	provider = RuleBasedTriage()

	# "clamped" is what makes this a regression case: bare "lamp" matched
	# inside it before the word-boundary fix. The water verdict now comes from
	# the word "water" rather than from a bare "leak", which is no longer a
	# water keyword on its own.
	assert provider.triage("Water is leaking from a clamped pipe.", "Main Street").category is (
		Category.water
	)
	assert provider.triage("A lamplight fitting is broken.", "Main Street").category is (
		Category.streetlights
	)


def test_gas_leak_is_not_reported_as_water() -> None:
	"""Regression: bare "leak" was a water keyword.

	A gas leak shares no vocabulary with the water category, but the
	substring test matched the single word "leak" and filed it as water, so
	the complaint never reached the right dashboard. It is still high
	priority; only the category changes.
	"""
	provider = RuleBasedTriage()

	for text in (
		"Gas leak reported at Greenwood substation.",
		"There is a leak of gas near the pump house.",
		"Leak detected in the gas line.",
	):
		assert provider.triage(text, "Main Street").category is not Category.water, text

	assert provider.triage("Gas leak reported at Greenwood substation.", "Main Street").category is (
		Category.other
	)
	# The verb on its own must not drag a water verdict along with it either.
	assert provider.triage("The pipe is clamped and leaking.", "Main Street").category is (
		Category.other
	)


def test_water_leaks_are_still_reported_as_water() -> None:
	"""The specific replacement keywords must cover the ordinary cases."""
	provider = RuleBasedTriage()

	for text in (
		"Water is leaking from the kitchen tap.",
		"There is a pipe leak under the sink.",
		"Burst pipe flooding the flat.",
		"The hydrant leak is flooding the pavement.",
	):
		assert provider.triage(text, "Main Street").category is Category.water, text


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
