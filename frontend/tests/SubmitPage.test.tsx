import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createComplaint } from "../src/api/client";
import SubmitPage from "../src/pages/SubmitPage";

vi.mock("../src/api/client", () => ({
	createComplaint: vi.fn(),
}));

const mockedCreateComplaint = vi.mocked(createComplaint);

afterEach(() => {
	cleanup();
	mockedCreateComplaint.mockReset();
});

const successfulComplaint = {
	id: "complaint-1",
	text: "A broken streetlight needs attention",
	location: "Civic Center",
	category: "streetlights" as const,
	priority: "normal" as const,
	status: "open" as const,
	ai_summary: "Streetlight outage reported.",
	triaged_by: "simulated",
	triage_latency_ms: 12,
	created_at: "2026-09-25T00:00:00Z",
	updated_at: "2026-09-25T00:00:00Z",
};

function renderForm() {
	return render(<SubmitPage />);
}

describe("SubmitPage", () => {
	it("renders complaint, location, and optional contact fields", () => {
		renderForm();

		expect(screen.getByLabelText("Complaint")).toBeInTheDocument();
		expect(screen.getByLabelText("Location")).toBeInTheDocument();
		expect(screen.getByLabelText("Contact information (optional)")).toBeInTheDocument();
	});

	it("shows a validation message for complaint text shorter than 10 characters", async () => {
		const user = userEvent.setup();
		renderForm();

		await user.type(screen.getByLabelText("Complaint"), "Too short");
		await user.click(screen.getByRole("button", { name: /send report/i }));

		expect(screen.getByText("Complaint text must be between 10 and 2000 characters.")).toBeVisible();
	});

	it("shows a validation message for a location shorter than 3 characters", async () => {
		const user = userEvent.setup();
		renderForm();

		await user.type(screen.getByLabelText("Complaint"), "The streetlight is broken");
		await user.type(screen.getByLabelText("Location"), "No");
		await user.click(screen.getByRole("button", { name: /send report/i }));

		expect(screen.getByText("Location must be between 3 and 200 characters.")).toBeVisible();
	});

	it("disables the submit button while the API call is in flight", async () => {
		const user = userEvent.setup();
		let resolveComplaint: (value: typeof successfulComplaint) => void = () => undefined;
		mockedCreateComplaint.mockReturnValue(
			new Promise((resolve) => {
				resolveComplaint = resolve;
			}),
		);
		renderForm();

		await user.type(screen.getByLabelText("Complaint"), "The streetlight is broken");
		await user.type(screen.getByLabelText("Location"), "Civic Center");
		await user.click(screen.getByRole("button", { name: /send report/i }));

		expect(screen.getByRole("button", { name: /analyzing/i })).toBeDisabled();
		resolveComplaint(successfulComplaint);
	});

	it("renders category, priority, summary, and provider after success", async () => {
		const user = userEvent.setup();
		mockedCreateComplaint.mockResolvedValue(successfulComplaint);
		renderForm();

		await user.type(screen.getByLabelText("Complaint"), "The streetlight is broken");
		await user.type(screen.getByLabelText("Location"), "Civic Center");
		await user.click(screen.getByRole("button", { name: /send report/i }));

		expect(await screen.findByText("streetlights")).toBeVisible();
		expect(screen.getByText("normal")).toBeVisible();
		expect(screen.getByText("Streetlight outage reported.")).toBeVisible();
		expect(screen.getByText("simulated")).toBeVisible();
	});
});