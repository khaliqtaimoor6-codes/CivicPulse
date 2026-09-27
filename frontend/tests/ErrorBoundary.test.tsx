import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ErrorBoundary from "../src/components/ErrorBoundary";

function Boom({ shouldThrow }: { shouldThrow: boolean }) {
	if (shouldThrow) throw new Error("component exploded");
	return <p>Page content</p>;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
	it("renders its children while nothing has gone wrong", () => {
		render(
			<ErrorBoundary>
				<Boom shouldThrow={false} />
			</ErrorBoundary>,
		);

		expect(screen.getByText("Page content")).toBeInTheDocument();
		expect(screen.queryByText("Something went wrong.")).not.toBeInTheDocument();
	});

	it("replaces a crashed subtree with a recovery message", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		render(
			<ErrorBoundary>
				<Boom shouldThrow />
			</ErrorBoundary>,
		);

		expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
		expect(screen.queryByText("Page content")).not.toBeInTheDocument();
	});

	it("announces the failure assertively so it is not missed", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		render(
			<ErrorBoundary>
				<Boom shouldThrow />
			</ErrorBoundary>,
		);

		const alert = screen.getByRole("alert");
		expect(alert).toHaveAttribute("aria-live", "assertive");
	});

	it("logs the error with context rather than swallowing it", () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		render(
			<ErrorBoundary>
				<Boom shouldThrow />
			</ErrorBoundary>,
		);

		expect(log).toHaveBeenCalledWith(
			"CivicPulse render error",
			expect.any(Error),
			expect.objectContaining({ componentStack: expect.any(String) }),
		);
	});

	it("reassures the reader that filed reports are untouched", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		render(
			<ErrorBoundary>
				<Boom shouldThrow />
			</ErrorBoundary>,
		);

		// The failure is a render problem, not a data problem, and saying so
		// stops someone re-filing reports they already submitted.
		expect(screen.getByText(/already filed are unaffected/i)).toBeInTheDocument();
	});

	it("remounts the children after a retry", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { rerender } = render(
			<ErrorBoundary>
				<Boom shouldThrow />
			</ErrorBoundary>,
		);

		expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();

		rerender(
			<ErrorBoundary>
				<Boom shouldThrow={false} />
			</ErrorBoundary>,
		);
		screen.getByRole("button", { name: "Try again" }).click();

		expect(await screen.findByText("Page content")).toBeInTheDocument();
	});
});
