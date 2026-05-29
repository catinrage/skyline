<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Toaster } from 'svelte-sonner';
	import { applyStoredTheme, readStoredTheme, type ThemeMode } from '$lib/theme';
	import '@mdi/font/css/materialdesignicons.min.css';
	import '../app.css';

	let { children } = $props();
	let theme = $state<ThemeMode>('dark');

	// Admin shells already render their own theme toggle in the header,
	// so we hide the global one on those routes to avoid duplication.
	const isAdminRoute = $derived(
		/^\/(manage|reseller)(\/|$)/.test(page.url.pathname) ||
			/^\/[^/]+\/(manager|manage|reseller)(\/|$)/.test(page.url.pathname) ||
			/^\/user\//.test(page.url.pathname)
	);

	function applyTheme(nextTheme: ThemeMode) {
		theme = nextTheme;

		if (!browser) {
			return;
		}

		applyStoredTheme(nextTheme);
	}

	function toggleTheme() {
		applyTheme(theme === 'dark' ? 'light' : 'dark');
	}

	onMount(() => {
		applyTheme(readStoredTheme());
	});
</script>

<svelte:head>
	<title>Skyline</title>
	<meta
		name="description"
		content="Skyline VPN user panel powered by SvelteKit, Tailwind, Node.js, and SQLite."
	/>
	<script>
		{
			const themeStorageKey = 'skyline-theme';
			const legacyThemeStorageKey = 'ward-theme';
			const storedTheme = localStorage.getItem(themeStorageKey);
			const legacyTheme = localStorage.getItem(legacyThemeStorageKey);
			const preferredTheme =
				storedTheme === 'dark' || storedTheme === 'light'
					? storedTheme
					: legacyTheme === 'dark' || legacyTheme === 'light'
						? legacyTheme
						: window.matchMedia?.('(prefers-color-scheme: light)').matches
							? 'light'
							: 'dark';
			document.documentElement.dataset.theme = preferredTheme;
			document.documentElement.style.colorScheme = preferredTheme;
			localStorage.setItem(themeStorageKey, preferredTheme);
			localStorage.removeItem(legacyThemeStorageKey);
		}
	</script>
</svelte:head>

<div class="skyline-shell min-h-screen">
	<Toaster
		dir="rtl"
		theme={theme}
		position="bottom-right"
		closeButton
		expand
		toastOptions={{
			duration: 3500,
			class: 'va-toast',
			descriptionClass: 'va-toast-description',
			classes: {
				title: 'va-toast-title',
				closeButton: 'va-toast-close',
				icon: 'va-toast-icon'
			}
		}}
	/>

	{@render children()}

	{#if !isAdminRoute}
		<button
			type="button"
			class="skyline-theme-toggle skyline-global-theme-toggle"
			onclick={toggleTheme}
			aria-label={theme === 'dark' ? 'فعال‌کردن حالت روشن' : 'فعال‌کردن حالت تیره'}
		>
			<span aria-hidden="true" class={`mdi ${theme === 'dark' ? 'mdi-white-balance-sunny' : 'mdi-weather-night'}`}></span>
			<span>{theme === 'dark' ? 'تم روشن' : 'تم تیره'}</span>
		</button>
	{/if}
</div>
