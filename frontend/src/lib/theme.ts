export type Theme = "dark" | "light";

const STORAGE_KEY = "civicpulse-theme";

export function storeTheme(theme: Theme): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, theme);
	} catch {
		// Private browsing and blocked storage both throw here. A theme that
		// does not survive a reload is a worse experience, not a broken one,
		// so there is nothing useful to do about it.
	}
}
