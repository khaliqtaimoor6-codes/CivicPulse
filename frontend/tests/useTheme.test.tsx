import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useTheme from "../src/hooks/useTheme";

const STORAGE_KEY = "civicpulse-theme";

function setDocumentTheme(value?: string) {
	if (value === undefined) delete document.documentElement.dataset.theme;
	else document.documentElement.dataset.theme = value;
}

beforeEach(() => {
	window.localStorage.clear();
	setDocumentTheme("dark");
});

afterEach(() => {
	vi.restoreAllMocks();
	setDocumentTheme("dark");
	document.documentElement.style.colorScheme = "";
});

describe("useTheme", () => {
	it("takes the initial theme from the attribute the inline script already set", () => {
		setDocumentTheme("light");
		const { result } = renderHook(() => useTheme());
		expect(result.current[0]).toBe("light");
	});

	it("falls back to dark when the attribute is missing or unrecognised", () => {
		setDocumentTheme(undefined);
		expect(renderHook(() => useTheme()).result.current[0]).toBe("dark");

		setDocumentTheme("sepia");
		expect(renderHook(() => useTheme()).result.current[0]).toBe("dark");
	});

	it("writes the theme onto the document so CSS can follow it", () => {
		const { result } = renderHook(() => useTheme());
		expect(document.documentElement.dataset.theme).toBe("dark");
		expect(document.documentElement.style.colorScheme).toBe("dark");

		act(() => result.current[1]());

		expect(document.documentElement.dataset.theme).toBe("light");
		expect(document.documentElement.style.colorScheme).toBe("light");
	});

	it("toggles back and forth", () => {
		const { result } = renderHook(() => useTheme());

		act(() => result.current[1]());
		expect(result.current[0]).toBe("light");

		act(() => result.current[1]());
		expect(result.current[0]).toBe("dark");
	});

	it("remembers a chosen theme for the next page load", () => {
		const { result } = renderHook(() => useTheme());
		act(() => result.current[1]());

		// The read-back lives in the inline bootstrap in index.html, which
		// needs this value; the hook only has to write it.
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe("light");
	});

	it("does not persist the default, so it never becomes a choice the user did not make", () => {
		renderHook(() => useTheme());
		expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("keeps working when storage is blocked", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("denied", "SecurityError");
		});

		const { result } = renderHook(() => useTheme());
		expect(result.current[0]).toBe("dark");

		act(() => result.current[1]());

		// The theme still switches; only the memory of it is lost.
		expect(result.current[0]).toBe("light");
		expect(document.documentElement.dataset.theme).toBe("light");
	});

	it("keeps the same toggle identity across renders", () => {
		const { result, rerender } = renderHook(() => useTheme());
		const first = result.current[1];
		rerender();
		expect(result.current[1]).toBe(first);
	});
});
