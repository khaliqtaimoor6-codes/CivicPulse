from __future__ import annotations

import sys
import uuid
from pathlib import Path
from time import perf_counter

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from app.models import Complaint, Status
from app.providers.triage.simulated import SimulatedTriage


SEED_NAMESPACE = uuid.UUID("8d3d8df9-7ae0-4c18-9d29-4f6aa3d2b5c1")
SEED_COMPLAINTS = [
    ("Water", "Mohalla tap has no water since morning, please check the line."),
    ("Water", "Gali water pipe is leaking near the masjid and making the road wet."),
    ("Water", "Boring water is dirty and smells bad in our street, kindly inspect."),
    ("Water", "Burst water pipe outside the market is flooding the footpath."),
    ("Water", "Low water pressure in the colony house lines for many days."),
    ("Electricity", "Bijli goes off every evening in our block, please check the feeder."),
    ("Electricity", "Exposed electric wire is hanging beside the school gate."),
    ("Electricity", "Power pole is sparking near the chai hotel and needs urgent repair."),
    ("Electricity", "Street electricity meter box is broken and open to rain."),
    ("Electricity", "No electricity in three houses since last night, kindly restore."),
    ("Sanitation", "Garbage has not been collected from our gali for one week."),
    ("Sanitation", "Sewage water is standing outside the houses after the rain."),
    ("Sanitation", "Drain is blocked near the bus stop and there is a bad smell."),
    ("Sanitation", "Kachra bins are overflowing beside the market, please clean them."),
    ("Sanitation", "Open sewage line is unsafe for children in our neighbourhood."),
    ("Roads", "Large pothole on the main road is damaging bikes and rickshaws."),
    ("Roads", "Road surface has broken near the school, kindly repair this patch."),
    ("Roads", "Street is full of mud after rain and vehicles cannot pass properly."),
    ("Roads", "Pothole beside the clinic is getting wider every day."),
    ("Roads", "Road divider is damaged near the bus stand and needs fixing."),
    ("Streetlights", "Streetlight is not working outside our lane, it becomes dark."),
    ("Streetlights", "Lamp near the park gate is broken and children cannot see."),
    ("Streetlights", "Three streetlights are off on the road to the mosque."),
    ("Streetlights", "Streetlight pole is leaning dangerously near the corner shop."),
    ("Streetlights", "New lamp is needed in the dark gali behind the clinic."),
    ("Other", "Public park bench is broken and residents cannot sit there."),
    ("Other", "Community notice board is damaged and needs replacement."),
    ("Other", "Civic office sign is missing from the service centre entrance."),
    ("Other", "Playground gate is broken and should be repaired for children."),
    ("Other", "Footpath railing is loose near the community hall."),
]


def seed() -> tuple[int, int]:
	settings = get_settings()
	engine = create_engine(settings.database_url, pool_pre_ping=True)
	provider = SimulatedTriage()
	created = 0
	skipped = 0

	with Session(engine) as session:
		with session.begin():
			for _, complaint_text in SEED_COMPLAINTS:
				complaint_id = uuid.uuid5(SEED_NAMESPACE, complaint_text)
				if session.get(Complaint, complaint_id) is not None:
					skipped += 1
					continue

				started_at = perf_counter()
				triage_result = provider.triage(complaint_text, "CivicPulse ward")
				triage_latency_ms = int((perf_counter() - started_at) * 1000)
				session.add(
					Complaint(
						id=complaint_id,
						text=complaint_text,
						location="CivicPulse ward",
						reporter_contact=None,
						category=triage_result.category,
						priority=triage_result.priority,
						status=Status.open,
						ai_summary=triage_result.summary,
						triaged_by=provider.name,
						triage_latency_ms=triage_latency_ms,
					)
				)
				created += 1

	engine.dispose()
	return created, skipped


if __name__ == "__main__":
	created_count, skipped_count = seed()
	print(f"Created: {created_count}; skipped-as-existing: {skipped_count}")