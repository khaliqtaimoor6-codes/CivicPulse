/**
 * The CivicPulse mark, redrawn from the shipped favicon so the wordmark and
 * the tab icon stay the same glyph. The trace draws itself once on load.
 */
export default function BrandMark({ size = 26 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
			<path
				className="brand-pulse"
				d="M6 27.5h11l4-13 6 22 4-13h11"
				stroke="currentColor"
				strokeWidth="4"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<circle cx="6" cy="27.5" r="4" fill="currentColor" />
		</svg>
	);
}
