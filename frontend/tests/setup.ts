import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * jsdom implements neither matchMedia nor IntersectionObserver, and both are
 * used by real components. Without these stubs a component that reads a
 * browser API in an effect throws during mount, React tears down the tree, and
 * the test fails on missing content rather than on the real assertion.
 *
 * jsdom's IntersectionObserver stub reports the element as visible, matching
 * the "nothing to wait for" fallback the components use in its absence, so
 * reveal animations do not need timers to be advanced in tests.
 */

if (!window.matchMedia) {
	window.matchMedia = ((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})) as unknown as typeof window.matchMedia;
}

if (!("IntersectionObserver" in window)) {
	class TestIntersectionObserver implements IntersectionObserver {
		readonly root = null;
		readonly rootMargin = "";
		readonly thresholds: readonly number[] = [];
		constructor(private readonly callback: IntersectionObserverCallback) {}
		observe(target: Element): void {
			this.callback(
				[
					{
						isIntersecting: true,
						target,
					} as IntersectionObserverEntry,
				],
				this,
			);
		}
		unobserve(): void {}
		disconnect(): void {}
		takeRecords(): IntersectionObserverEntry[] {
			return [];
		}
	}
	window.IntersectionObserver = TestIntersectionObserver as unknown as typeof IntersectionObserver;
	globalThis.IntersectionObserver =
		window.IntersectionObserver as unknown as typeof globalThis.IntersectionObserver;
}

afterEach(() => {
	cleanup();
});
