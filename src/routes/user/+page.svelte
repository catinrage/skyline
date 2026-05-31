<script lang="ts">
	import { enhance } from '$app/forms';
	import Brand from '$lib/components/admin/Brand.svelte';

	type ActionData = {
		input?: string;
		error?: string;
	};

	let { form }: { form: ActionData | null } = $props();
	let lookup = $state('');
	let pending = $state(false);
	let syncedFormInput = $state<string | undefined>(undefined);

	$effect(() => {
		if (typeof form?.input === 'string' && form.input !== syncedFormInput) {
			lookup = form.input;
			syncedFormInput = form.input;
		}
	});
</script>

<svelte:head>
	<title>Skyline | پنل کاربر</title>
	<meta name="description" content="ورود به پنل کاربر Skyline با UUID یا کانفیگ VLESS" />
</svelte:head>

<main class="lookup-page" dir="rtl">
	<section class="lookup-panel">
		<div class="brand-row">
			<Brand size={34} title="Skyline" />
			<span>پنل کاربر</span>
		</div>

		<div class="lookup-copy">
			<p class="mono-label">دسترسی سریع</p>
			<h1>UUID یا کانفیگ خود را وارد کنید</h1>
			<p>اگر کانفیگ کامل VLESS را وارد کنید، UUID به‌صورت خودکار استخراج می‌شود.</p>
		</div>

		<form
			method="POST"
			use:enhance={() => {
				pending = true;
				return async ({ update }) => {
					await update();
					pending = false;
				};
			}}
			class="lookup-form"
		>
			<label for="user-lookup">UUID یا کانفیگ VLESS</label>
			<textarea
				id="user-lookup"
				name="lookup"
				bind:value={lookup}
				class="lookup-input"
				dir="ltr"
				rows="5"
				autocomplete="off"
				spellcheck="false"
				placeholder="vless://... یا UUID"
			></textarea>

			{#if form?.error}
				<p class="lookup-error">{form.error}</p>
			{/if}

			<button type="submit" disabled={pending || !lookup.trim()}>
				<span class="mdi {pending ? 'mdi-loading mdi-spin' : 'mdi-arrow-left'}"></span>
				<span>{pending ? 'در حال بررسی...' : 'ورود به پنل'}</span>
			</button>
		</form>
	</section>
</main>

<style>
	.lookup-page {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 24px;
		background: var(--va-bg);
		color: var(--va-text);
		font-family: var(--va-font-fa);
	}

	.lookup-panel {
		width: min(100%, 520px);
		border: 1px solid var(--va-border);
		border-radius: 8px;
		background: var(--va-bg-panel);
		padding: 28px;
		box-shadow: 0 24px 70px color-mix(in srgb, black 28%, transparent);
	}

	.brand-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		color: var(--va-text-muted);
		font-size: 13px;
	}

	.lookup-copy {
		margin-top: 28px;
	}

	.mono-label {
		margin: 0 0 8px;
		color: var(--va-text-faint);
		font: 600 11px var(--va-font-mono);
		letter-spacing: 0;
	}

	h1 {
		margin: 0;
		color: var(--va-text);
		font-size: 24px;
		line-height: 1.45;
		font-weight: 700;
	}

	.lookup-copy p:last-child {
		margin: 10px 0 0;
		color: var(--va-text-muted);
		font-size: 13px;
		line-height: 1.8;
	}

	.lookup-form {
		display: grid;
		gap: 10px;
		margin-top: 24px;
	}

	label {
		color: var(--va-text-muted);
		font-size: 12px;
	}

	.lookup-input {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid var(--va-border);
		border-radius: 6px;
		background: var(--va-bg);
		color: var(--va-text);
		padding: 12px;
		font: 500 12px/1.7 var(--va-font-mono);
		resize: vertical;
	}

	.lookup-input:focus {
		border-color: var(--va-accent);
		outline: none;
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--va-accent) 16%, transparent);
	}

	.lookup-error {
		margin: 0;
		border: 1px solid color-mix(in srgb, var(--va-danger) 32%, var(--va-border));
		border-radius: 6px;
		background: color-mix(in srgb, var(--va-danger) 10%, transparent);
		color: var(--va-danger);
		padding: 9px 10px;
		font-size: 12px;
		line-height: 1.7;
	}

	button {
		min-height: 42px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border: 0;
		border-radius: 6px;
		background: var(--va-accent);
		color: white;
		font: 700 13px var(--va-font-fa);
		cursor: pointer;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.56;
	}

	@media (max-width: 560px) {
		.lookup-page {
			padding: 14px;
		}

		.lookup-panel {
			padding: 20px;
		}

		h1 {
			font-size: 21px;
		}
	}
</style>
