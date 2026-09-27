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

		if (value <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
