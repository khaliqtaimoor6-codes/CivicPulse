import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type RevealProps = {
	as?: "div" | "section" | "article" | "li" | "span" | "header";
	delay?: number;
	className?: string;
	children: ReactNode;
};

/**
 * Reveals its children once they enter the viewport.
 *
 * Uses IntersectionObserver rather than a scroll listener: the observer fires
 * on threshold crossings, not on every scroll frame, so it costs nothing while
 * the page is idle. Once shown, the observer disconnects and the element stays
 * revealed. Motion is entirely CSS-driven, so `prefers-reduced-motion` is
 * honoured in the stylesheet rather than here.
 *
 * The base state lives on `[data-reveal]`, which is only ever applied from
 * JavaScript, so content is never hidden if the observer is unavailable.
 */
export default function Reveal({ as = "div", delay = 0, className, children }: RevealProps) {
	const Tag = as as "div";
	const ref = useRef<HTMLDivElement | null>(null);
	// Where IntersectionObserver is missing there is nothing to wait for, so
	// the content is treated as visible from the first render and the CSS
	// transition simply never runs.
	const [isVisible, setIsVisible] = useState(() => typeof IntersectionObserver === "undefined");

	useEffect(() => {
		const node = ref.current;
		if (!node || typeof IntersectionObserver === "undefined") return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					setIsVisible(true);
					observer.disconnect();
				}
			},
			{ rootMargin: "0px 0px -10% 0px", threshold: 0.04 },
		);

		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	return (
		<Tag
			ref={ref}
			className={className}
			data-reveal={isVisible ? "in" : ""}
			style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
		>
			{children}
		</Tag>
	);
}
