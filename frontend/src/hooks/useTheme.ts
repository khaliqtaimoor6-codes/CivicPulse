import { useCallback, useEffect, useState } from "react";

import { storeTheme, type Theme } from "../lib/theme";

/**
 * Reads and writes the page theme.
 *
 * The initial value comes off the `data-theme` attribute that an inline script
 * in index.html already set before first paint, so there is no flash of the
 * wrong theme and no second source of truth. This hook only owns changes made
 * after that point.
 */
export default function useTheme(): [Theme, () => void] {
	const [theme, setTheme] = useState<Theme>(() => {
		if (typeof document === "undefined") return "dark";
		return document.documentElement.dataset.theme === "light" ? "light" : "dark";
	});

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
		document.documentElement.style.colorScheme = theme;
	}, [theme]);

	const toggle = useCallback(() => {
		setTheme((current) => {
			const next: Theme = current === "dark" ? "light" : "dark";
			storeTheme(next);
			return next;
		});
	}, []);

	return [theme, toggle];
}
