import type { CSSProperties, ReactNode } from "react";

type MarqueeProps = {
	children: ReactNode;
	duration?: number;
	label: string;
};

/**
 * A single continuous horizontal run of content.
 *
 * The track holds two identical groups and translates by exactly half its
 * width, so the seam is invisible and the loop is seamless. Only one of the
 * two groups is announced to assistive tech, otherwise every item is read
 * twice. The animation is CSS, and the stylesheet stops it entirely under
 * `prefers-reduced-motion`, where the strip simply sits still and scrolls
 * horizontally if it overflows.
 */
export default function Marquee({ children, duration = 52, label }: MarqueeProps) {
	return (
		<div className="marquee" role="group" aria-label={label}>
			<div
				className="marquee__track"
				style={{ "--marquee-duration": `${duration}s` } as CSSProperties}
			>
				<div className="marquee__group">{children}</div>
				<div className="marquee__group" aria-hidden="true">
					{children}
				</div>
			</div>
		</div>
	);
}
