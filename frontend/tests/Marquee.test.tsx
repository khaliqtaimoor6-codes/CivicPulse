import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Marquee from "../src/components/Marquee";

describe("Marquee", () => {
	it("repeats the content so the strip can loop without a visible seam", () => {
		const { container } = render(
			<Marquee label="Triage activity">
				<p>Report</p>
			</Marquee>,
		);

		// Two identical groups: the track translates by half its own width,
		// so the second group covers the gap the first one leaves.
		const groups = container.querySelectorAll(".marquee__group");
		expect(groups).toHaveLength(2);
		expect(groups[0].innerHTML).toBe(groups[1].innerHTML);
	});

	it("hides the duplicate group from assistive tech so items are read once", () => {
		const { container } = render(
			<Marquee label="Triage activity">
				<p>Report</p>
			</Marquee>,
		);

		const groups = container.querySelectorAll(".marquee__group");
		expect(groups[0]).not.toHaveAttribute("aria-hidden");
		expect(groups[1]).toHaveAttribute("aria-hidden", "true");

		expect(within(groups[0] as HTMLElement).getAllByText("Report")).toHaveLength(1);
	});

	it("exposes the label the strip was given", () => {
		render(
			<Marquee label="Triage activity">
				<p>Report</p>
			</Marquee>,
		);

		expect(screen.getByRole("group", { name: "Triage activity" })).toBeInTheDocument();
	});

	it("passes the duration to the stylesheet as a CSS variable", () => {
		const { container } = render(
			<Marquee label="Triage activity" duration={30}>
				<p>Report</p>
			</Marquee>,
		);

		const track = container.querySelector(".marquee__track") as HTMLElement;
		expect(track.style.getPropertyValue("--marquee-duration")).toBe("30s");
	});

	it("defaults the duration rather than leaving the animation unset", () => {
		const { container } = render(
			<Marquee label="Triage activity">
				<p>Report</p>
			</Marquee>,
		);

		const track = container.querySelector(".marquee__track") as HTMLElement;
		expect(track.style.getPropertyValue("--marquee-duration")).toBe("52s");
	});
});
