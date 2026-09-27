import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import { listComplaints, getProviderMeta, getStats } from "../src/api/client";
import type { StatsResponse } from "../src/api/types";

/**
 * The routes are the contract everything else is built on: three paths, each
 * with its own page. Nothing tested them together, so a mistyped path or a
 * dropped wrapper would have shown up as a blank page in the browser and
 * nowhere else.
 *
 * App mounts BrowserRouter itself, so the window history is set before render
 * rather than wrapping the tree in a MemoryRouter, which would fight it.
 */

vi.mock("../src/api/client", () => ({
	listComplaints: vi.fn(),
	getStats: vi.fn(),
	getProviderMeta: vi.fn(),
	createComplaint: vi.fn(),
	updateStatus: vi.fn(),
	StatusTransitionError: class StatusTransitionError extends Error {},
}));

const stats: StatsResponse = {
	total: 0,
	by_category: { water: 0, electricity: 0, sanitation: 0, roads: 0, streetlights: 0, other: 0 },
	by_priority: { high: 0, normal: 0, low: 0 },
	by_status: { open: 0, in_progress: 0, resolved: 0, rejected: 0 },
};

function renderAt(path: string) {
	window.history.pushState({}, "", path);
	return render(<App />);
}

/**
 * The page and the footer both use these headings, and the header renders its
 * links twice, so every query is scoped to the region it is actually about.
 */
function main() {
	return within(screen.getByRole("main"));
}

function mainNav() {
	return within(screen.getByRole("navigation", { name: "Main navigation" }));
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("App routing", () => {
	it("renders the report form at the root", async () => {
		renderAt("/");
		expect(await screen.findByLabelText("Complaint")).toBeInTheDocument();
	});

	it("renders the dashboard at /dashboard", async () => {
		vi.mocked(listComplaints).mockResolvedValue({ items: [], total: 0 });
		renderAt("/dashboard");
		expect(await screen.findByRole("main")).toBeInTheDocument();
		expect(main().getByRole("heading", { name: "Complaint dashboard" })).toBeInTheDocument();
	});

	it("renders the stats board at /stats", async () => {
		vi.mocked(getStats).mockResolvedValue({ data: stats, cacheStatus: "MISS" });
		vi.mocked(getProviderMeta).mockResolvedValue({ active_provider: "simulated", recent_triages: [] });
		renderAt("/stats");
		await screen.findByRole("main");
		expect(main().getByRole("heading", { name: "City signals" })).toBeInTheDocument();
	});

	it("keeps the header and footer on every page", async () => {
		renderAt("/");
		await screen.findByLabelText("Complaint");

		expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
		expect(document.querySelector(".site-footer")).not.toBeNull();
	});

	it("offers a skip link to the main content for keyboard users", async () => {
		renderAt("/");
		const skip = await screen.findByRole("link", { name: "Skip to content" });

		expect(skip).toHaveAttribute("href", "#main-content");
		// The target has to be focusable, or the jump moves the viewport but
		// not the keyboard, and the next Tab returns to the header.
		expect(document.querySelector("#main-content")).toHaveAttribute("tabindex", "-1");
	});

	it("marks the decorative grain layer as hidden from assistive tech", async () => {
		const { container } = renderAt("/");
		await waitFor(() => expect(container.querySelector(".grain")).not.toBeNull());
		expect(container.querySelector(".grain")).toHaveAttribute("aria-hidden", "true");
	});

	it("renders only the page belonging to the current path", async () => {
		vi.mocked(getStats).mockResolvedValue({ data: stats, cacheStatus: "MISS" });
		vi.mocked(getProviderMeta).mockResolvedValue({ active_provider: "simulated", recent_triages: [] });
		renderAt("/stats");

		await screen.findByRole("main");
		expect(main().getByRole("heading", { name: "City signals" })).toBeInTheDocument();
		expect(main().queryByLabelText("Complaint")).not.toBeInTheDocument();
	});

	it("navigates between pages without a reload", async () => {
		vi.mocked(listComplaints).mockResolvedValue({ items: [], total: 0 });
		const user = (await import("@testing-library/user-event")).default.setup();
		renderAt("/");

		await screen.findByLabelText("Complaint");
		await user.click(mainNav().getByRole("link", { name: "Track reports" }));

		expect(await screen.findByRole("main")).toBeInTheDocument();
		expect(main().getByRole("heading", { name: "Complaint dashboard" })).toBeInTheDocument();
		expect(window.location.pathname).toBe("/dashboard");
	});

	/**
	 * The header and footer link with react-router, so those routes swap without
	 * a document load. The landing page's own "Track reports" CTA was a bare
	 * <a href>, so the two links to the same route behaved differently: the nav
	 * one kept you in the running app, the hero one re-requested the page and
	 * could serve a stale cached shell. Nothing caught it because the routing
	 * test above only exercised the header.
	 *
	 * A router Link calls preventDefault on the click; a bare anchor does not,
	 * and that difference is the whole bug. React's listener is on the root
	 * container, so by the time the event reaches document the default is
	 * already resolved.
	 */
	it("sends the landing page CTA through the router rather than reloading", async () => {
		vi.mocked(listComplaints).mockResolvedValue({ items: [], total: 0 });
		const user = (await import("@testing-library/user-event")).default.setup();
		renderAt("/");

		await screen.findByLabelText("Complaint");
		const cta = main().getByRole("link", { name: "Track reports" });
		expect(cta).toHaveAttribute("href", "/dashboard");

		let defaultPrevented = false;
		const record = (event: Event) => {
			defaultPrevented = defaultPrevented || (event as MouseEvent).defaultPrevented;
		};
		document.addEventListener("click", record);
		await user.click(cta);
		document.removeEventListener("click", record);

		expect(defaultPrevented).toBe(true);
		expect(main().getByRole("heading", { name: "Complaint dashboard" })).toBeInTheDocument();
		expect(window.location.pathname).toBe("/dashboard");
	});
});
