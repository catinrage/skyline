import { browser } from '$app/environment';

export type ThemeMode = 'dark' | 'light';

export const themeStorageKey = 'skyline-theme';
const legacyThemeStorageKey = 'ward-theme';

export function readStoredTheme(): ThemeMode {
	if (!browser) {
		return 'dark';
	}

	const storedTheme = localStorage.getItem(themeStorageKey) ?? localStorage.getItem(legacyThemeStorageKey);
	if (storedTheme === 'dark' || storedTheme === 'light') {
		return storedTheme;
	}

	return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyStoredTheme(nextTheme: ThemeMode) {
	if (!browser) {
		return;
	}

	document.documentElement.dataset.theme = nextTheme;
	document.documentElement.style.colorScheme = nextTheme;
	localStorage.setItem(themeStorageKey, nextTheme);
	localStorage.removeItem(legacyThemeStorageKey);
}
