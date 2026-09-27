import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CountUp from "../src/components/CountUp";

type Frame = FrameRequestCallback;

function stubMotion(matches: boolean) {
	vi.stubGlobal("matchMedia", (query: string) => ({
		matches,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	}));
}

function captureFrames() {
	const frames: Frame[] = [];
	vi.stubGlobal("requestAnimationFrame", (callback: Frame) => {
		frames.push(callback);
		return frames.length;
	});
	vi.stubGlobal("cancelAnimationFrame", vi.fn());
	return frames;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("CountUp", () => {
	it("renders the formatted figure before any animation runs", () => {
		stubMotion(false);
		captureFrames();
		render(<CountUp value={1234} />);
		expect(screen.getByText("1,234")).toBeInTheDocument();
	});

	it("settles on the exact value rather than a rounded remainder", async () => {
		stubMotion(false);
		const frames = captureFrames();
		render(<CountUp value={137} duration={1500} />);

		await waitFor(() => expect(frames.length).toBeGreaterThan(0));
		frames[0](performance.now() + 1500);

		await waitFor(() => expect(screen.getByText("137")).toBeInTheDocument());
	});

	it("writes the final value once and requests no frame under reduced motion", () => {
		stubMotion(true);
		const frames = captureFrames();
		render(<CountUp value={88} />);

		expect(screen.getByText("88")).toBeInTheDocument();
		expect(frames).toHaveLength(0);
	});

	/**
	 * Regression test. CountUp used to read window.matchMedia unguarded, which
	 * threw during mount wherever the API is missing; React then unmounted the
	 * surrounding tree, so the whole page went blank rather than one number
	 * failing to animate.
	 */
	it("renders the value instead of throwing when matchMedia is missing", () => {
		vi.stubGlobal("matchMedia", undefined);
		const frames = captureFrames();

		expect(() => render(<CountUp value={246} />)).not.toThrow();
		expect(screen.getByText("246")).toBeInTheDocument();
		expect(frames).toHaveLength(0);
	});

	it("renders the value when requestAnimationFrame is unavailable", () => {
		stubMotion(false);
		vi.stubGlobal("requestAnimationFrame", undefined);

		expect(() => render(<CountUp value={9} />)).not.toThrow();
		expect(screen.getByText("9")).toBeInTheDocument();
	});

	it("does not animate a zero figure", () => {
		stubMotion(false);
		const frames = captureFrames();
		render(<CountUp value={0} />);

		expect(screen.getByText("0")).toBeInTheDocument();
		expect(frames).toHaveLength(0);
	});

	it("cancels its pending frame on unmount so no write lands on a detached node", () => {
		stubMotion(false);
		captureFrames();
		const cancel = vi.fn();
		vi.stubGlobal("cancelAnimationFrame", cancel);

		const { unmount } = render(<CountUp value={500} />);
		unmount();

		expect(cancel).toHaveBeenCalled();
	});
});
