import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * jsdom implements neither matchMedia nor IntersectionObserver, and both are
 * read by real components. Without these stubs a component that touches a
 * browser API in an effect fails during mount, React tears down the tree, and
 * the test then reports missing page content instead of the assertion it meant
 * to check.
 *
 * Assigned directly rather than through vi.stubGlobal, because a test that
 * calls vi.unstubAllGlobals must not strip the environment the rest of the
 * suite depends on.
 */

function define(target: object, key: string, value: unknown): void {
	Object.defineProperty(target, key, { configurable: true, writable: true, value });
}

define(window, "matchMedia", (query: string) => ({
	matches: false,
	media: query,
	onchange: null,
	addListener: () => {},
	removeListener: () => {},
	addEventListener: () => {},
	removeEventListener: () => {},
	dispatchEvent: () => false,
}));

class VisibleObserver {
	readonly root = null;
	readonly rootMargin = "";
	readonly thresholds: readonly number[] = [];
	readonly scrollMargin = "";
	readonly #callback: IntersectionObserverCallback;

	constructor(callback: IntersectionObserverCallback) {
		this.#callback = callback;
	}

	observe(target: Element): void {
		// Report the element as visible straight away, which is the same
		// outcome the components fall back to when no observer exists, so
		// reveal animations need no timer control in tests.
		this.#callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as never);
	}

	unobserve(): void {}
	disconnect(): void {}
	takeRecords(): IntersectionObserverEntry[] {
		return [];
	}
}

define(window, "IntersectionObserver", VisibleObserver);
define(globalThis, "IntersectionObserver", VisibleObserver);

afterEach(() => {
	cleanup();
});
