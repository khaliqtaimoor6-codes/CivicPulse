import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The static-host config is the kind of file nothing complains about when it is
 * wrong. Drop the rewrite and the app still builds, still passes every test, and
 * still works when you click through it in a session, because the router is
 * doing the navigation in memory. What breaks is a direct load of /dashboard or
 * a link pasted to someone else, which returns the host's 404 page instead of
 * the app. Nothing in CI would catch that, so it is asserted here.
 */
// Vitest's jsdom environment gives import.meta.url an http origin, so
// import.meta.url cannot be turned into a path here. The runner's cwd is this
// package root, which is where the config lives.
const config = JSON.parse(
	readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
) as {
	buildCommand: string;
	outputDirectory: string;
	rewrites: { source: string; destination: string }[];
};

describe("static host config", () => {
	it("builds the Vite bundle and serves it from dist", () => {
		expect(config.buildCommand).toBe("npm run build");
		expect(config.outputDirectory).toBe("dist");
	});

	it("falls back to the app shell so deep links do not 404", () => {
		const catchAll = config.rewrites.find((r) => r.source === "/(.*)");
		expect(catchAll?.destination).toBe("/index.html");
	});
});
