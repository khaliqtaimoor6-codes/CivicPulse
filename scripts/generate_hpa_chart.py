"""Render docs/evidence/hpa-scaling-vs-load.png from the raw HPA capture.

Reads `kubectl get hpa -w` output captured during the post-fix k6 run and plots
replicas against the offered load that drove them, so the brief's "replicas
against offered load over time" deliverable is regenerable from committed evidence
rather than being a hand-drawn picture of a memory.

Run from the repository root:

    python scripts/generate_hpa_chart.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent.parent
HPA_LOG = ROOT / "docs" / "evidence" / "hpa-scaling.log"
K6_SUMMARY = ROOT / "docs" / "evidence" / "k6-summary.json"
OUTPUT = ROOT / "docs" / "evidence" / "hpa-scaling-vs-load.png"

# The HPA controller writes the object on each sync, whose default period is
# `--horizontal-pod-autoscaler-sync-period=15s`. Rows are therefore spaced by
# approximately this long. The capture's own TIME column repeated the same value
# on every row, so it cannot be used as an x axis -- this estimate, stated
# openly on the chart, is the only honest substitute.
SECONDS_PER_SAMPLE = 15

TARGET_UTILIZATION_PCT = 60

UTILIZATION_RE = re.compile(r"averageUtilization:(\d+)")
# Trailing columns after the TARGETS map are MIN MAX REPLICAS DESIRED.
COLUMNS_RE = re.compile(r"\]\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$")


def parse_hpa_log(path: Path) -> list[dict[str, int]]:
	"""Return one record per `kubectl get hpa -w` row."""
	records: list[dict[str, int]] = []
	for line in path.read_text().splitlines():
		if not line.strip() or line.startswith("TIME"):
			continue
		utilization = UTILIZATION_RE.search(line)
		columns = COLUMNS_RE.search(line)
		if not utilization or not columns:
			continue
		min_replicas, max_replicas, replicas, desired = map(int, columns.groups())
		records.append(
			{
				"utilization_pct": int(utilization.group(1)),
				"replicas": replicas,
				"desired": desired,
				"min_replicas": min_replicas,
				"max_replicas": max_replicas,
			}
		)
	if not records:
		raise SystemExit(f"no usable rows parsed from {path}")
	return records


def main() -> None:
	records = parse_hpa_log(HPA_LOG)
	summary = json.loads(K6_SUMMARY.read_text())

	x = [i * SECONDS_PER_SAMPLE for i in range(len(records))]
	replicas = [record["replicas"] for record in records]
	desired = [record["desired"] for record in records]
	utilization = [record["utilization_pct"] for record in records]
	max_replicas = records[0]["max_replicas"]

	run = summary["run"]
	load = f'{run["vus_max"]} VUs · {run["stages"]}'
	results = summary["results"]

	fig, (ax_replicas, ax_utilization) = plt.subplots(
		2, 1, figsize=(11, 7), sharex=True, gridspec_kw={"height_ratios": [3, 2]}
	)

	fig.suptitle(
		"HPA scale-out under sustained load — CivicPulse backend",
		fontsize=14,
		fontweight="bold",
	)

	# --- Panel 1: replicas vs offered load --------------------------------
	ax_replicas.step(x, replicas, where="post", linewidth=2.4, label="Replicas (actual)")
	ax_replicas.step(
		x, desired, where="post", linewidth=1.6, linestyle="--", label="Desired"
	)

	# Annotate each scale-out transition where actual replicas changed.
	previous = replicas[0]
	for index, current in enumerate(replicas):
		if current == previous:
			continue
		ax_replicas.annotate(
			f"{previous} → {current}",
			xy=(x[index], current),
			xytext=(x[index] + 12, current - 1.6),
			arrowprops={"arrowstyle": "->", "color": "#b03030", "lw": 1.4},
			fontsize=10,
			color="#b03030",
			fontweight="bold",
		)
		previous = current

	ax_replicas.set_ylabel("Backend replicas")
	ax_replicas.set_ylim(0, max_replicas + 1)
	ax_replicas.set_yticks(range(0, max_replicas + 1, 2))
	ax_replicas.grid(axis="y", alpha=0.3)
	ax_replicas.legend(loc="upper left", framealpha=0.9)

	# --- Panel 2: offered load as observed CPU demand ---------------------
	ax_utilization.plot(x, utilization, linewidth=2.2, color="#d97706")
	ax_utilization.axhline(
		TARGET_UTILIZATION_PCT,
		color="#b03030",
		linestyle=":",
		linewidth=1.6,
		label=f"HPA target: {TARGET_UTILIZATION_PCT}% of request",
	)
	ax_utilization.fill_between(x, 0, utilization, alpha=0.12, color="#d97706")
	ax_utilization.set_ylabel("CPU utilisation (%)")
	ax_utilization.set_xlabel("Elapsed seconds since load started (≈15 s per HPA sync)")
	ax_utilization.set_ylim(bottom=0)
	ax_utilization.grid(axis="y", alpha=0.3)
	ax_utilization.legend(loc="upper left", framealpha=0.9)

	# The offered load itself, so the chart answers the brief literally rather
	# than only showing its server-side symptom.
	fig.text(
		0.5,
		0.005,
		(
			f"Offered load: k6, {load} · "
			f'{results["http_reqs"]:,} requests · {results["http_reqs_per_sec"]:.1f} req/s · '
			f'{results["http_req_failed_pct"]:.2f}% failed · p95 {results["duration_p95_s"]} s\n'
			"Source: docs/evidence/hpa-scaling.log (kubectl get hpa -w) + k6-summary.json. "
			"X axis is sample index × 15 s (HPA controller sync period); the capture's TIME "
			"column was identical on every row, so elapsed time is estimated, not measured."
		),
		ha="center",
		va="bottom",
		fontsize=8.5,
		color="#444444",
	)

	fig.tight_layout(rect=(0, 0.07, 1, 0.95))
	OUTPUT.parent.mkdir(parents=True, exist_ok=True)
	fig.savefig(OUTPUT, dpi=150, bbox_inches="tight")
	plt.close(fig)
	print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(records)} samples)")


if __name__ == "__main__":
	main()
