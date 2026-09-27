import { afterEach, describe, expect, it, vi } from "vitest";

import indexHtml from "../index.html?raw";

/**
 * The inline script in index.html is the only thing standing between a saved
 * light theme and a page that paints dark first and then corrects itself. It
 * cannot be covered by a component test because it runs before React exists,
 * so it is read out of the real file and executed here instead. If the script
 * is ever removed or renamed, this fails rather than silently losing the
 * guarantee.
 */

const STORAGE_KEY = "civicpulse-theme";

function readBootstrap(): string {
	const match = indexHtml.match(/<script>([\s\S]*?)<\/script>/);
	if (!match) throw new Error("index.html no longer contains the inline theme bootstrap");
	return match[1];
}

const BOOTSTRAP = readBootstrap();

function runBootstrap() {
	new Function(BOOTSTRAP)();
}

function stubSystemLight(matches: boolean) {
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

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	window.localStorage.clear();
	delete document.documentElement.dataset.theme;
	document.documentElement.style.colorScheme = "";
});

describe("index.html theme bootstrap", () => {
	it("defaults to dark, which is the brand look", () => {
		stubSystemLight(false);
		runBootstrap();

		expect(document.documentElement.dataset.theme).toBe("dark");
	});

	it("prefers a stored light theme over the system setting", () => {
		window.localStorage.setItem(STORAGE_KEY, "light");
		stubSystemLight(false);
		runBootstrap();

		expect(document.documentElement.dataset.theme).toBe("light");
	});

	it("restores a stored dark theme even on a light system", () => {
		window.localStorage.setItem(STORAGE_KEY, "dark");
		stubSystemLight(true);
		runBootstrap();

		expect(document.documentElement.dataset.theme).toBe("dark");
	});

	it("follows the system setting when nothing has been stored", () => {
		stubSystemLight(true);
		runBootstrap();

		expect(document.documentElement.dataset.theme).toBe("light");
	});

	it("ignores a stored value that is not a theme", () => {
		window.localStorage.setItem(STORAGE_KEY, "chartreuse");
		stubSystemLight(false);
		runBootstrap();

		expect(document.documentElement.dataset.theme).toBe("dark");
	});

	it("sets colorScheme alongside the attribute so form controls match", () => {
		stubSystemLight(false);
		runBootstrap();
		expect(document.documentElement.style.colorScheme).toBe("dark");

		window.localStorage.setItem(STORAGE_KEY, "light");
		runBootstrap();
		expect(document.documentElement.style.colorScheme).toBe("light");
	});

	it("still paints dark when storage is blocked outright", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new DOMException("denied", "SecurityError");
		});
		stubSystemLight(false);

		expect(() => runBootstrap()).not.toThrow();
		expect(document.documentElement.dataset.theme).toBe("dark");
	});

	it("agrees with the storage key the theme hook writes", () => {
		// A rename on either side would silently lose every saved preference.
		expect(BOOTSTRAP).toContain(STORAGE_KEY);
	});
});
