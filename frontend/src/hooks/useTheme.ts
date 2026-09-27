import { useCallback, useEffect, useRef, useState } from "react";

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

	// Only a deliberate toggle is worth remembering. Persisting the initial
	// value would turn the default into an apparent choice, and the user would
	// then keep getting it even after changing their OS appearance.
	const isChosen = useRef(false);

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
		document.documentElement.style.colorScheme = theme;
		if (isChosen.current) storeTheme(theme);
	}, [theme]);

	const toggle = useCallback(() => {
		isChosen.current = true;
		setTheme((current) => (current === "dark" ? "light" : "dark"));
	}, []);

	return [theme, toggle];
}
