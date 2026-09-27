import { useEffect, useState } from "react";

/**
 * Reports which of a set of scroll markers currently owns the centre of the
 * viewport.
 *
 * Each marker is a full-height block beside a sticky panel. Instead of
 * measuring scroll on every frame, the marker is observed against a thin band
 * of the viewport pinned to the vertical centre. Whichever marker overlaps
 * that band is the active one, and the observer only fires when the overlap
 * changes. A collapsed layout, where the panel is no longer sticky and every
 * marker is on screen at once, simply reports the first.
 */
export default function useActiveStep(count: number): number {
	const [activeStep, setActiveStep] = useState(0);

	useEffect(() => {
		if (typeof IntersectionObserver === "undefined") return;

		const markers = Array.from(
			document.querySelectorAll<HTMLElement>("[data-pipeline-marker]"),
		).slice(0, count);
		if (markers.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				const hit = entries.find((entry) => entry.isIntersecting);
				if (!hit) return;
				const index = markers.indexOf(hit.target as HTMLElement);
				if (index >= 0) setActiveStep(index);
			},
			{ rootMargin: "-45% 0px -45% 0px", threshold: 0 },
		);

		markers.forEach((marker) => observer.observe(marker));
		return () => observer.disconnect();
	}, [count]);

	return activeStep;
}
