import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useActiveStep from "../src/hooks/useActiveStep";

class MarkerObserver {
	readonly observed: Element[] = [];
	disconnect = vi.fn();
	readonly root = null;
	readonly rootMargin = "";
	readonly thresholds: readonly number[] = [];
	readonly scrollMargin = "";
	takeRecords = () => [] as IntersectionObserverEntry[];

	private readonly callback: IntersectionObserverCallback;

	constructor(callback: IntersectionObserverCallback) {
		this.callback = callback;
		observers.push(this);
	}

	observe(target: Element): void {
		this.observed.push(target);
	}

	report(index: number) {
		this.callback(
			[{ isIntersecting: true, target: this.observed[index] } as IntersectionObserverEntry],
			this as unknown as IntersectionObserver,
		);
	}

	reportAllDisjoint() {
		this.callback([], this as unknown as IntersectionObserver);
	}

	reportElement(target: Element) {
		this.callback(
			[{ isIntersecting: true, target } as IntersectionObserverEntry],
			this as unknown as IntersectionObserver,
		);
	}
}

let observers: MarkerObserver[] = [];

function stubObserver() {
	observers = [];
	vi.stubGlobal("IntersectionObserver", MarkerObserver as unknown as typeof globalThis.IntersectionObserver);
	return () => observers;
}

function removeObserver() {
	vi.stubGlobal("IntersectionObserver", undefined);
}

function addMarkers(count: number) {
	document.body.innerHTML = Array.from(
		{ length: count },
		(_, index) => `<section data-pipeline-marker="true" id="marker-${index}"></section>`,
	).join("");
}

afterEach(() => {
	vi.unstubAllGlobals();
	document.body.innerHTML = "";
});

describe("useActiveStep", () => {
	/**
	 * The marker that owns the centre of the viewport is the active one. A
	 * collapsed layout has no centre to speak of, so nothing is ever reported
	 * and the first step is what shows. That fallback is the reason this
	 * reports 0 rather than throwing when there is nothing to observe.
	 */
	it("reports the first step when there is nothing to observe", () => {
		stubObserver();
		document.body.innerHTML = "";
		const { result } = renderHook(() => useActiveStep(3));
		expect(result.current).toBe(0);
	});

	it("reports the first step when no observer is available", () => {
		removeObserver();
		addMarkers(3);
		const { result } = renderHook(() => useActiveStep(3));
		expect(result.current).toBe(0);
	});

	it("observes every marker up to the requested count", () => {
		const getObservers = stubObserver();
		addMarkers(4);
		renderHook(() => useActiveStep(3));

		expect(getObservers()[0].observed).toHaveLength(3);
	});

	it("reports the marker that overlaps the centre band", () => {
		const getObservers = stubObserver();
		addMarkers(3);
		const { result } = renderHook(() => useActiveStep(3));

		act(() => getObservers()[0].report(2));
		expect(result.current).toBe(2);
	});

	it("moves as a different marker takes the centre", () => {
		const getObservers = stubObserver();
		addMarkers(3);
		const { result } = renderHook(() => useActiveStep(3));

		act(() => getObservers()[0].report(1));
		expect(result.current).toBe(1);

		act(() => getObservers()[0].report(0));
		expect(result.current).toBe(0);
	});

	it("holds the current step when a report contains no overlap", () => {
		const getObservers = stubObserver();
		addMarkers(3);
		const { result } = renderHook(() => useActiveStep(3));

		act(() => getObservers()[0].report(1));
		expect(result.current).toBe(1);

		act(() => getObservers()[0].reportAllDisjoint());
		expect(result.current).toBe(1);
	});

	it("ignores a target that is not one of the markers", () => {
		const getObservers = stubObserver();
		addMarkers(2);
		const { result } = renderHook(() => useActiveStep(2));

		act(() => getObservers()[0].reportElement(document.createElement("div")));
		expect(result.current).toBe(0);
	});

	it("disconnects on unmount so it stops observing detached nodes", () => {
		const getObservers = stubObserver();
		addMarkers(2);
		const { unmount } = renderHook(() => useActiveStep(2));

		const observer = getObservers()[0];
		unmount();
		expect(observer.disconnect).toHaveBeenCalled();
	});
});
