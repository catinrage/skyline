<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { applyStoredTheme, readStoredTheme, type ThemeMode } from '$lib/theme';
	import { appVersionLabel } from '$lib/version';
	import Brand from './Brand.svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		eyebrow: string;
		title: string;
		description: string;
		children: Snippet;
		footer?: Snippet;
	};

	let { eyebrow, title, description, children, footer }: Props = $props();
	let theme = $state<ThemeMode>('dark');

	const shortcutHints = [
		['⌘ K', 'باز کردن جستجوی سراسری از هر صفحه'],
		['G T', 'پرش سریع به تب ترافیک'],
		['G R', 'پرش سریع به فروشندگان یا کانفیگ‌ها']
	] as const;

	function applyTheme(next: ThemeMode) {
		theme = next;
		if (!browser) return;
		applyStoredTheme(next);
	}

	function toggleTheme() {
		applyTheme(theme === 'dark' ? 'light' : 'dark');
	}

	onMount(() => {
		applyTheme(readStoredTheme());
	});
</script>

<div class="va-login" dir="rtl">
	<section class="va-brand-panel" aria-label="معرفی Skyline">
		<div class="va-brand-row">
			<div class="va-brand-mark" aria-hidden="true">
				<Brand size={44} />
			</div>
			<span class="va-version">{appVersionLabel}</span>
		</div>

		<div class="va-story">
			<p class="va-micro">پنل مدیریت</p>
			<h1>
				کنترل کامل ترافیک،
				<br />
				فروشندگان و پلن‌ها
				<br />
				<span>در یک پنل واحد.</span>
			</h1>
			<p>
				داشبورد مدیریت سرویس VPN شماست؛ برای فروشندگان، مشتریان نهایی و عملیات روزانه.
			</p>
		</div>

		<div class="va-shortcuts" aria-label="میانبرهای پنل">
			{#each shortcutHints as [key, text] (key)}
				<div class="va-shortcut">
					<kbd>{key}</kbd>
					<span>{text}</span>
				</div>
			{/each}
		</div>
	</section>

	<section class="va-form-panel" aria-labelledby="login-title">
		<button
			type="button"
			class="va-theme-toggle"
			onclick={toggleTheme}
			aria-label={theme === 'dark' ? 'فعال‌کردن حالت روشن' : 'فعال‌کردن حالت تیره'}
		>
			<span aria-hidden="true" class={`mdi ${theme === 'dark' ? 'mdi-white-balance-sunny' : 'mdi-weather-night'}`}></span>
			<span>{theme === 'dark' ? 'تم روشن' : 'تم تیره'}</span>
		</button>

		<div class="va-form-card">
			<p class="va-micro">{eyebrow}</p>
			<h2 id="login-title">{title || 'خوش آمدید'}</h2>
			<p class="va-description">{description}</p>

			<div class="va-injected-form">
				{@render children()}
			</div>

			{#if footer}
				<div class="va-footer">
					{@render footer()}
				</div>
			{/if}
		</div>
	</section>
</div>

<style>
	.va-login {
		min-height: 100vh;
		background: var(--va-bg);
		color: var(--va-text);
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(360px, 1fr);
		font-family: var(--va-font-fa);
	}

	.va-brand-panel {
		background: var(--va-bg-panel);
		border-inline-end: 1px solid var(--va-border);
		padding: 48px 56px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 48px;
		min-height: 100vh;
	}

	.va-brand-row {
		display: flex;
		align-items: center;
		gap: 10px;
		direction: ltr;
		justify-content: flex-start;
	}

	.va-brand-mark {
		width: 48px;
		height: 48px;
		border-radius: 8px;
		background: var(--va-bg-raised);
		border: 1px solid var(--va-border);
		display: grid;
		place-items: center;
		overflow: hidden;
	}

	.va-version {
		margin-inline-start: 10px;
		font: 500 10.5px var(--va-font-mono);
		color: var(--va-text-faint);
		border: 1px solid var(--va-border);
		padding: 2px 7px;
		border-radius: 4px;
	}

	.va-micro {
		font: 500 10.5px var(--va-font-mono);
		color: var(--va-text-faint);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin: 0 0 14px;
	}

	.va-story h1 {
		font-size: clamp(2rem, 4vw, 2.375rem);
		font-weight: 600;
		color: var(--va-text);
		margin: 0;
		letter-spacing: -0.03em;
		line-height: 1.2;
	}

	.va-story h1 span {
		color: var(--va-text-muted);
	}

	.va-story p:not(.va-micro) {
		color: var(--va-text-muted);
		font-size: 14px;
		margin: 18px 0 0;
		max-width: 390px;
		line-height: 1.8;
	}

	.va-shortcuts {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.va-shortcut {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 12.5px;
		color: var(--va-text-muted);
	}

	.va-shortcut kbd {
		min-width: 38px;
		text-align: center;
		font: 500 11px var(--va-font-mono);
		color: var(--va-text-faint);
		background: var(--va-bg);
		border: 1px solid var(--va-border);
		border-radius: 4px;
		padding: 2px 7px;
		direction: ltr;
	}

	.va-form-panel {
		position: relative;
		display: grid;
		place-items: center;
		padding: 48px 56px;
		min-height: 100vh;
	}

	.va-theme-toggle {
		position: absolute;
		top: 24px;
		inset-inline-end: 28px;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		border: 1px solid var(--va-border);
		background: var(--va-bg-panel);
		color: var(--va-text);
		border-radius: 6px;
		padding: 7px 10px;
		font: 500 12px var(--va-font-fa);
		transition:
			background-color 0.18s ease,
			border-color 0.18s ease,
			transform 0.18s ease;
	}

	.va-theme-toggle:hover {
		background: var(--va-bg-raised);
		border-color: var(--va-border-strong);
		transform: translateY(-1px);
	}

	.va-form-card {
		width: min(100%, 380px);
	}

	.va-form-card h2 {
		font-size: 22px;
		font-weight: 600;
		color: var(--va-text);
		margin: 0;
		letter-spacing: -0.02em;
	}

	.va-description {
		font-size: 12.5px;
		color: var(--va-text-muted);
		margin: 6px 0 0;
		line-height: 1.75;
	}

	.va-injected-form {
		margin-top: 18px;
	}

	.va-footer {
		margin-top: 28px;
		font: 500 11px/1.8 var(--va-font-mono);
		color: var(--va-text-faint);
		text-align: center;
	}

	:global(.login-form-inner) {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	:global(.login-form-inner .form-field) {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	:global(.login-form-inner .form-field label) {
		font: 500 10.5px var(--va-font-mono);
		color: var(--va-text-faint);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	:global(.login-form-inner .admin-field) {
		width: 100%;
		background: var(--va-bg-panel);
		border: 1px solid var(--va-border);
		border-radius: 6px;
		color: var(--va-text);
		font: 500 13px var(--va-font-mono);
		outline: none;
		padding: 10px 12px;
		box-shadow: none;
		transition:
			border-color 0.18s ease,
			background-color 0.18s ease;
	}

	:global(.login-form-inner .admin-field:focus) {
		border-color: var(--va-border-strong);
		background: var(--va-bg-raised);
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
	}

	:global(.login-form-inner .admin-field::placeholder) {
		color: var(--va-text-faint);
		font-family: var(--va-font-fa);
	}

	:global(.login-form-inner .form-error) {
		margin: 0;
		color: #e0698d;
		font-size: 11.5px;
		line-height: 1.6;
	}

	:global(.login-form-inner .login-submit) {
		width: 100%;
		justify-content: center;
		border-radius: 6px;
		border: 0;
		background: var(--va-accent);
		color: #fff;
		padding: 11px 14px;
		font-size: 14px;
		font-weight: 500;
		margin-top: 4px;
		box-shadow: none;
	}

	:global(.login-form-inner .login-submit:hover:not(:disabled)) {
		background: var(--va-accent-hover);
		transform: none;
	}

	@media (max-width: 860px) {
		.va-login {
			grid-template-columns: 1fr;
		}

		.va-brand-panel {
			min-height: auto;
			padding: 28px 24px;
			gap: 28px;
			border-inline-end: 0;
			border-bottom: 1px solid var(--va-border);
		}

		.va-brand-row {
			direction: rtl;
			justify-content: flex-start;
		}

		.va-shortcuts {
			display: none;
		}

		.va-form-panel {
			min-height: auto;
			padding: 76px 24px 48px;
			place-items: start center;
		}

		.va-theme-toggle {
			top: 24px;
			inset-inline-end: 24px;
		}
	}
</style>
