import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { listComplaints, StatusTransitionError, updateStatus } from "../src/api/client";
import type { Complaint } from "../src/api/types";
import DashboardPage from "../src/pages/DashboardPage";

vi.mock("../src/api/client", () => ({
	listComplaints: vi.fn(),
	updateStatus: vi.fn(),
	StatusTransitionError: class StatusTransitionError extends Error {
		readonly status = 409;
	},
}));

const mockedList = vi.mocked(listComplaints);
const mockedUpdate = vi.mocked(updateStatus);

function complaint(overrides: Partial<Complaint> = {}): Complaint {
	return {
		id: "complaint-1",
		text: "Streetlight outside the school has been dark for four nights",
		location: "12 Wellesley Road",
		category: "streetlights",
		priority: "normal",
		status: "open",
		ai_summary: "Streetlight outage near a school.",
		triaged_by: "simulated",
		triage_latency_ms: 12,
		created_at: "2026-09-25T00:00:00Z",
		updated_at: "2026-09-25T00:00:00Z",
		...overrides,
	};
}

afterEach(() => {
	cleanup();
	mockedList.mockReset();
	mockedUpdate.mockReset();
});

async function renderLoaded(items: Complaint[], total = items.length) {
	mockedList.mockResolvedValue({ items, total });
	const user = userEvent.setup();
	render(<DashboardPage />);
	await screen.findByText(items[0]?.text ?? "anything");
	return user;
}

/**
 * The status filter chips carry the same labels as the per-record transition
 * buttons, so every transition query has to be scoped to the record itself.
 * Without this the two sets collide and the query is ambiguous.
 */
function recordScope(text: string): HTMLElement {
	const record = screen.getByText(text).closest("article");
	if (!record) throw new Error(`No record rendered for "${text}"`);
	return record;
}

describe("DashboardPage", () => {
	it("requests the first page unfiltered and renders each complaint", async () => {
		mockedList.mockResolvedValue({
			items: [complaint(), complaint({ id: "complaint-2", text: "Burst main flooding the road" })],
			total: 2,
		});
		render(<DashboardPage />);

		await screen.findByText("Streetlight outside the school has been dark for four nights");
		expect(screen.getByText("Burst main flooding the road")).toBeInTheDocument();
		expect(mockedList).toHaveBeenCalledWith({}, 1, 20);
	});

	it("shows the total in the header, not just the rows on screen", async () => {
		await renderLoaded([complaint()], 137);
		expect(screen.getByText("137")).toBeInTheDocument();
	});

	it("surfaces a failed load as an alert instead of an empty list", async () => {
		mockedList.mockRejectedValue(new Error("Request failed."));
		render(<DashboardPage />);

		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("Request failed.");
	});

	it("offers a way back when filters match nothing", async () => {
		mockedList.mockResolvedValue({ items: [], total: 0 });
		render(<DashboardPage />);

		expect(await screen.findByText("No complaints match these filters")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
	});

	it("refetches with the chosen filter and marks the chip pressed", async () => {
		const user = await renderLoaded([complaint()]);
		mockedList.mockClear();

		await user.click(screen.getByRole("button", { name: "water" }));

		await waitFor(() => {
			expect(mockedList).toHaveBeenCalledWith({ category: "water" }, 1, 20);
		});
		expect(screen.getByRole("button", { name: "water" })).toHaveAttribute("aria-pressed", "true");
	});

	it("clears every filter at once rather than one at a time", async () => {
		const user = await renderLoaded([complaint()]);

		await user.click(screen.getByRole("button", { name: "water" }));
		await waitFor(() => expect(mockedList).toHaveBeenCalledWith({ category: "water" }, 1, 20));

		mockedList.mockClear();
		await user.click(screen.getByRole("button", { name: "Clear filters" }));

		await waitFor(() => expect(mockedList).toHaveBeenCalledWith({}, 1, 20));
	});

	it("disables the button for the status the record is already in", async () => {
		await renderLoaded([complaint({ status: "in_progress" })]);

		const actions = within(recordScope("Streetlight outside the school has been dark for four nights"));

		expect(actions.getByRole("button", { name: "in progress" })).toBeDisabled();
		expect(actions.getByRole("button", { name: "resolved" })).toBeEnabled();
	});

	it("sends the transition and reflects the new status on the record", async () => {
		const user = await renderLoaded([complaint()]);
		mockedUpdate.mockResolvedValue(complaint({ status: "in_progress" }));

		await user.click(
			within(recordScope("Streetlight outside the school has been dark for four nights")).getByRole("button", {
				name: "in progress",
			}),
		);

		await waitFor(() => {
			expect(mockedUpdate).toHaveBeenCalledWith("complaint-1", "in_progress");
		});
		await waitFor(() => {
			expect(
				within(recordScope("Streetlight outside the school has been dark for four nights")).getByRole("button", {
					name: "in progress",
				}),
			).toBeDisabled();
		});
	});

	it("shows the server's 409 message verbatim rather than a generic failure", async () => {
		const user = await renderLoaded([complaint()]);
		mockedUpdate.mockRejectedValue(
			new StatusTransitionError("Cannot transition from open to resolved", {
				detail: "Cannot transition from open to resolved",
			}),
		);

		await user.click(
			within(recordScope("Streetlight outside the school has been dark for four nights")).getByRole("button", {
				name: "resolved",
			}),
		);

		const alerts = await screen.findAllByRole("alert");
		expect(alerts.some((node) => node.textContent === "Cannot transition from open to resolved")).toBe(true);
	});

	it("keeps the record visible when a transition is rejected", async () => {
		const user = await renderLoaded([complaint()]);
		mockedUpdate.mockRejectedValue(new StatusTransitionError("Cannot transition from open to resolved", null));

		await user.click(
			within(recordScope("Streetlight outside the school has been dark for four nights")).getByRole("button", {
				name: "resolved",
			}),
		);

		await screen.findAllByRole("alert");
		expect(screen.getByText("Streetlight outside the school has been dark for four nights")).toBeInTheDocument();
	});
});
