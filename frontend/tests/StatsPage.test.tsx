import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getProviderMeta, getStats } from "../src/api/client";
import type { ProviderMetaResponse, StatsResponse } from "../src/api/types";
import StatsPage from "../src/pages/StatsPage";

vi.mock("../src/api/client", () => ({
	getStats: vi.fn(),
	getProviderMeta: vi.fn(),
}));

const mockedStats = vi.mocked(getStats);
const mockedMeta = vi.mocked(getProviderMeta);

const aggregates: StatsResponse = {
	total: 42,
	by_category: { water: 7, streetlights: 6, other: 8 },
	by_priority: { high: 2, normal: 31, low: 1 },
	by_status: { open: 30, in_progress: 4, resolved: 6, rejected: 2 },
};

const providerMeta: ProviderMetaResponse = {
	active_provider: "simulated",
	recent_triages: [
		{ provider: "simulated", latency_ms: 12, was_fallback: false },
		{ provider: "rules", latency_ms: 40, was_fallback: true },
	],
};

function mockOk(stats: StatsResponse = aggregates, meta: ProviderMetaResponse = providerMeta) {
	mockedStats.mockResolvedValue({ data: stats, cacheStatus: "MISS" });
	mockedMeta.mockResolvedValue(meta);
}

afterEach(() => {
	cleanup();
	mockedStats.mockReset();
	mockedMeta.mockReset();
});

describe("StatsPage", () => {
	it("renders the complaint total and every aggregate group", async () => {
		mockOk();
		render(<StatsPage />);

		await screen.findByText("Complaints on record");
		expect(screen.getByText("42")).toBeInTheDocument();

		for (const heading of ["By priority", "By status", "Triage latency", "By category"]) {
			expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
		}
	});

	it("shows the cache state the server reported rather than assuming it", async () => {
		mockedStats.mockResolvedValue({ data: aggregates, cacheStatus: "HIT" });
		mockedMeta.mockResolvedValue(providerMeta);
		render(<StatsPage />);

		expect(await screen.findByText("Cache HIT")).toBeInTheDocument();
	});

	it("surfaces a failed stats load as an alert and offers a retry", async () => {
		mockedStats.mockRejectedValue(new Error("Request failed."));
		mockedMeta.mockResolvedValue(providerMeta);
		render(<StatsPage />);

		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("Request failed.");
		expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
	});

	it("retries on demand and reports the new cache state", async () => {
		mockedStats.mockResolvedValue({ data: aggregates, cacheStatus: "MISS" });
		mockedMeta.mockResolvedValue(providerMeta);
		const user = userEvent.setup();
		render(<StatsPage />);

		await screen.findByText("Cache MISS");
		mockedStats.mockResolvedValue({ data: aggregates, cacheStatus: "HIT" });

		await user.click(screen.getByRole("button", { name: "Refresh stats" }));

		expect(await screen.findByText("Cache HIT")).toBeInTheDocument();
		expect(mockedStats).toHaveBeenCalledTimes(2);
	});

	it("keeps the figures on screen while a refresh is in flight", async () => {
		mockOk();
		const user = userEvent.setup();
		render(<StatsPage />);

		await screen.findByText("Complaints on record");
		let release: (value: { data: StatsResponse; cacheStatus: "HIT" | "MISS" }) => void = () => {};
		mockedStats.mockReturnValue(
			new Promise((resolve) => {
				release = resolve;
			}),
		);

		await user.click(screen.getByRole("button", { name: "Refresh stats" }));

		// The board must not blank out mid-request. Losing the numbers on
		// every refresh is worse than showing the previous ones.
		expect(screen.getByText("Complaints on record")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Refreshing..." })).toBeDisabled();

		release({ data: aggregates, cacheStatus: "HIT" });
		await screen.findByText("Cache HIT");
	});

	it("renders the latency trace from the provider window and names the active provider", async () => {
		mockOk();
		render(<StatsPage />);

		await screen.findByText("Triage latency");
		expect(screen.getByText("simulated")).toBeInTheDocument();
		expect(screen.getByText("1 of 2 on fallback")).toBeInTheDocument();
	});

	it("does not invent latency points when the provider reports none", async () => {
		mockedStats.mockResolvedValue({ data: aggregates, cacheStatus: "MISS" });
		mockedMeta.mockResolvedValue({ active_provider: "simulated", recent_triages: [] });
		const { container } = render(<StatsPage />);

		await screen.findByText("Triage latency");
		expect(screen.getByText("0 of 0 on fallback")).toBeInTheDocument();

		// Empty telemetry must read as empty: flat placeholders carrying no
		// latency title, rather than bars implying measurements that never
		// happened.
		const bars = Array.from(container.querySelectorAll(".trace__bar"));
		expect(bars.length).toBeGreaterThan(0);
		expect(bars.every((bar) => !bar.getAttribute("title"))).toBe(true);
		expect(bars.every((bar) => bar.getAttribute("data-fallback") === null)).toBe(true);
	});

	it("still renders aggregates when the provider metadata call fails", async () => {
		mockedStats.mockResolvedValue({ data: aggregates, cacheStatus: "MISS" });
		mockedMeta.mockRejectedValue(new Error("providers unavailable"));
		render(<StatsPage />);

		// The two calls are independent. Losing the telemetry trace is
		// acceptable; losing the complaint counts is not.
		await waitFor(() => expect(screen.getByText("Complaints on record")).toBeInTheDocument());
		expect(screen.getByRole("heading", { name: "Triage latency" })).toBeInTheDocument();
		expect(screen.getByText("unavailable")).toBeInTheDocument();
		expect(screen.getByText("0 of 0 on fallback")).toBeInTheDocument();
	});

	it("reports the top category in the signal band", async () => {
		mockOk();
		render(<StatsPage />);

		expect(await screen.findByText("other, 8 reports")).toBeInTheDocument();
	});

	it("says so plainly when nothing has been reported yet", async () => {
		mockedStats.mockResolvedValue({
			data: {
				total: 0,
				by_category: {},
				by_priority: {},
				by_status: {},
			},
			cacheStatus: "MISS",
		});
		mockedMeta.mockResolvedValue(providerMeta);
		render(<StatsPage />);

		expect(await screen.findByText("No reports in the system yet")).toBeInTheDocument();
	});
});
