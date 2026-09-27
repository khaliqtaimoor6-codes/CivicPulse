import { useEffect, useRef } from "react";

type CountUpProps = {
	value: number;
	duration?: number;
	className?: string;
};

function format(value: number): string {
	return value.toLocaleString("en-US");
}

/**
 * True when the viewer has asked for reduced motion.
 *
 * `matchMedia` is missing in jsdom and in some embedded webviews, and reading
 * it unguarded threw inside the effect below, which took the whole surrounding
 * page down with it rather than just skipping an animation. Where the
 * preference cannot be read we report `true`: showing the figure at its final
 * value is always correct, and animating is the part that can go wrong.
 */
function prefersReducedMotion(): boolean {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Counts a figure up to its final value on mount.
 *
 * The animation writes straight to the DOM node's textContent rather than
 * going through React state, so sixty frames a second never trigger a
 * re-render of the surrounding tree. Under `prefers-reduced-motion` the final
 * value is written once and no frame is requested at all.
 */
export default function CountUp({ value, duration = 1500, className }: CountUpProps) {
	const ref = useRef<HTMLSpanElement | null>(null);

	useEffect(() => {
		const node = ref.current;
		if (!node) return;

		if (value <= 0 || prefersReducedMotion()) {
			node.textContent = format(value);
			return;
		}

		if (typeof requestAnimationFrame !== "function") {
			node.textContent = format(value);
			return;
		}

		let frame = 0;
		const startedAt = performance.now();
		const element: HTMLSpanElement = node;

		const step = (now: number) => {
			const progress = Math.min(1, (now - startedAt) / duration);
			const eased = 1 - (1 - progress) ** 3;
			element.textContent = format(Math.round(value * eased));
			if (progress < 1) {
				frame = requestAnimationFrame(step);
			}
		};

		frame = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frame);
	}, [value, duration]);

	return (
		<span ref={ref} className={className}>
			{format(value)}
		</span>
	);
}
