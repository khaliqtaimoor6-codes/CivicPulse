from enum import Enum
from typing import Protocol

from pydantic import BaseModel, Field


class Category(str, Enum):
	water = "water"
	electricity = "electricity"
	sanitation = "sanitation"
	roads = "roads"
	streetlights = "streetlights"
	other = "other"


class Priority(str, Enum):
	high = "high"
	normal = "normal"
	low = "low"


class TriageResult(BaseModel):
	category: Category
	priority: Priority
	summary: str = Field(max_length=140)
	confidence: float = Field(ge=0.0, le=1.0)


class TriageProvider(Protocol):
	name: str

	def triage(self, text: str, location: str) -> TriageResult: ...
