import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import SiteHeader from "../src/components/SiteHeader";

function renderHeader(initialPath = "/") {
	return render(
		<MemoryRouter initialEntries={[initialPath]}>
			<SiteHeader />
		</MemoryRouter>,
	);
}

function mobileNav() {
	// The overlay is always in the DOM; data-open is what shows it.
	return document.querySelector(".nav-overlay") as HTMLElement;
}

afterEach(() => {
	vi.restoreAllMocks();
	delete document.documentElement.dataset.theme;
});

describe("SiteHeader", () => {
	it("offers a way to each of the three pages", () => {
		renderHeader();
		const nav = screen.getByRole("navigation", { name: "Main navigation" });

		expect(within(nav).getByRole("link", { name: "Report an issue" })).toBeInTheDocument();
		expect(within(nav).getByRole("link", { name: "Track reports" })).toBeInTheDocument();
		expect(within(nav).getByRole("link", { name: "City signals" })).toBeInTheDocument();
	});

	it("marks the home link as exact so it is not also current on every page", () => {
		renderHeader("/dashboard");
		const nav = screen.getByRole("navigation", { name: "Main navigation" });
		const links = within(nav).getAllByRole("link");

		// Without end on "/", react-router would keep it active on /dashboard too.
		expect(links.filter((link) => link.getAttribute("aria-current") === "page")).toHaveLength(1);
		expect(within(nav).getByRole("link", { name: "Track reports" })).toHaveAttribute(
			"aria-current",
			"page",
		);
	});

	it("links the brand back to the start of the flow", () => {
		renderHeader();
		expect(screen.getByRole("link", { name: "CivicPulse home" })).toHaveAttribute("href", "/");
	});

	it("keeps the overlay closed until the menu button is used", () => {
		renderHeader();
		expect(mobileNav()).toHaveAttribute("data-open", "false");
		expect(screen.getByRole("button", { name: "Open navigation" })).toHaveAttribute(
			"aria-expanded",
			"false",
		);
	});

	it("opens the overlay and reports the expanded state", async () => {
		const user = userEvent.setup();
		renderHeader();

		await user.click(screen.getByRole("button", { name: "Open navigation" }));

		expect(mobileNav()).toHaveAttribute("data-open", "true");
		expect(screen.getByRole("button", { name: "Open navigation" })).toHaveAttribute(
			"aria-expanded",
			"true",
		);
	});

	it("closes the overlay again from its close button", async () => {
		const user = userEvent.setup();
		renderHeader();

		await user.click(screen.getByRole("button", { name: "Open navigation" }));
		await user.click(screen.getByRole("button", { name: "Close navigation" }));

		expect(mobileNav()).toHaveAttribute("data-open", "false");
	});

	it("closes the overlay on Escape, since it covers the page", async () => {
		const user = userEvent.setup();
		renderHeader();

		await user.click(screen.getByRole("button", { name: "Open navigation" }));
		await user.keyboard("{Escape}");

		expect(mobileNav()).toHaveAttribute("data-open", "false");
	});

	it("closes the overlay after a destination is chosen", async () => {
		const user = userEvent.setup();
		renderHeader();
		await user.click(screen.getByRole("button", { name: "Open navigation" }));

		const nav = within(mobileNav()).getByRole("navigation", { name: "Mobile navigation" });
		await user.click(within(nav).getByRole("link", { name: "Track reports" }));

		expect(mobileNav()).toHaveAttribute("data-open", "false");
	});

	it("names the theme it will switch to, not the one in use", async () => {
		document.documentElement.dataset.theme = "dark";
		const user = userEvent.setup();
		renderHeader();

		const toggle = screen.getByRole("button", { name: "Switch to light theme" });
		await user.click(toggle);

		// The label has to follow the action, otherwise it describes the
		// current state and pressing it does the opposite of what it says.
		expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
	});

	it("stops listening for Escape once the overlay is closed", async () => {
		const user = userEvent.setup();
		const remove = vi.spyOn(window, "removeEventListener");
		renderHeader();

		await user.click(screen.getByRole("button", { name: "Open navigation" }));
		await user.click(screen.getByRole("button", { name: "Close navigation" }));

		expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
	});

	it("reports the service as online in the header", () => {
		renderHeader();
		expect(screen.getByText("Service online")).toBeInTheDocument();
	});
});
