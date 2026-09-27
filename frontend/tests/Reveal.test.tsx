import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Reveal from "../src/components/Reveal";

class MockObserver {
	readonly observed: Element[] = [];
	disconnect = vi.fn();
	unobserve = vi.fn();
	readonly root = null;
	readonly rootMargin = "";
	readonly thresholds: readonly number[] = [];
	takeRecords = () => [] as IntersectionObserverEntry[];

	constructor(public callback: IntersectionObserverCallback) {
		observers.push(this);
	}

	observe(target: Element): void {
		this.observed.push(target);
	}

	trigger(isIntersecting: boolean) {
		this.callback(
			[{ isIntersecting, target: this.observed[0] } as IntersectionObserverEntry],
			this as unknown as IntersectionObserver,
		);
	}
}

let observers: MockObserver[] = [];

function stubObserver() {
	observers = [];
	vi.stubGlobal(
		"IntersectionObserver",
		MockObserver as unknown as typeof globalThis.IntersectionObserver,
	);
	return () => observers;
}

function removeObserver() {
	vi.stubGlobal("IntersectionObserver", undefined);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("Reveal", () => {
	it("renders its children without waiting when no observer exists", () => {
		removeObserver();
		render(
			<Reveal>
				<p>Report content</p>
			</Reveal>,
		);

		expect(screen.getByText("Report content")).toBeInTheDocument();
	});

	it("does not mark itself revealed until the observer reports an intersection", () => {
		stubObserver();
		const { container } = render(
			<Reveal>
				<p>Report content</p>
			</Reveal>,
		);

		expect(container.firstElementChild).toHaveAttribute("data-reveal", "");
	});

	it("reveals and stops observing once the element enters the viewport", async () => {
		const getObservers = stubObserver();
		const { container } = render(
			<Reveal>
				<p>Report content</p>
			</Reveal>,
		);

		const observer = getObservers()[0];
		observer.trigger(true);

		await waitFor(() =>
			expect(container.firstElementChild).toHaveAttribute("data-reveal", "in"),
		);
		expect(observer.disconnect).toHaveBeenCalled();
	});

	it("stays revealed if the element later leaves the viewport", async () => {
		const getObservers = stubObserver();
		const { container } = render(
			<Reveal>
				<p>Report content</p>
			</Reveal>,
		);

		const observer = getObservers()[0];
		observer.trigger(true);
		await waitFor(() => expect(container.firstElementChild).toHaveAttribute("data-reveal", "in"));

		observer.trigger(false);
		expect(container.firstElementChild).toHaveAttribute("data-reveal", "in");
	});

	it("disconnects on unmount so it does not observe a detached node", () => {
		const getObservers = stubObserver();
		const { unmount } = render(
			<Reveal>
				<p>Report content</p>
			</Reveal>,
		);

		const observer = getObservers()[0];
		unmount();
		expect(observer.disconnect).toHaveBeenCalled();
	});

	it("renders the requested element with the delay as a CSS variable", () => {
		removeObserver();
		const { container } = render(
			<Reveal as="section" delay={120} className="trace">
				<p>Report content</p>
			</Reveal>,
		);

		const node = container.firstElementChild as HTMLElement;
		expect(node.tagName).toBe("SECTION");
		expect(node).toHaveClass("trace");
		expect(node.style.getPropertyValue("--reveal-delay")).toBe("120ms");
	});
});
