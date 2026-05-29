<script lang="ts">
	import { page } from '$app/state';
	import Brand from '$lib/components/admin/Brand.svelte';

	const title = $derived.by(() => {
		if (page.status === 404) return 'صفحه پیدا نشد';
		if (page.status === 429) return 'کمی بعد دوباره تلاش کنید';
		return 'مشکلی پیش آمده است';
	});

	const description = $derived.by(() => {
		if (page.status === 404) return 'آدرس وارد شده معتبر نیست یا دیگر در دسترس نیست.';
		if (page.status === 429) return page.error?.message || 'تعداد درخواست‌ها زیاد بوده و دسترسی موقتاً محدود شده است.';
		return page.error?.message || 'لطفاً چند لحظه صبر کنید و دوباره تلاش کنید.';
	});

	function retry() {
		window.location.reload();
	}

	function goHome() {
		window.location.href = '/';
	}
</script>

<svelte:head>
	<title>Skyline | {page.status}</title>
</svelte:head>

<main class="error-page" dir="rtl">
	<section class="error-card" aria-labelledby="error-title">
		<header>
			<Brand size={30} title="Skyline" />
			<span>{page.status}</span>
		</header>

		<div class="error-mark" aria-hidden="true">
			<span>{page.status}</span>
		</div>

		<h1 id="error-title">{title}</h1>
		<p>{description}</p>

		<div class="actions">
			<button type="button" class="primary" onclick={retry}>تلاش دوباره</button>
			<button type="button" class="ghost" onclick={goHome}>بازگشت</button>
		</div>
	</section>
</main>

<style>
	:global(body) {
		background: var(--va-bg);
	}

	.error-page {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 20px;
		background:
			radial-gradient(560px circle at 12% -12%, color-mix(in srgb, var(--va-accent) 12%, transparent), transparent 62%),
			var(--va-bg);
		color: var(--va-text);
		font-family: var(--va-font-fa);
	}

	.error-card {
		width: min(520px, 100%);
		border: 1px solid var(--va-border);
		border-radius: 18px;
		background: var(--va-bg-panel);
		box-shadow: var(--va-shadow);
		padding: 22px;
		text-align: center;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 26px;
	}

	header > span {
		border: 1px solid var(--va-border);
		border-radius: 999px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		padding: 5px 10px;
		font: 700 11px var(--va-font-mono);
		direction: ltr;
	}

	.error-mark {
		width: 118px;
		height: 118px;
		display: grid;
		place-items: center;
		margin: 0 auto 22px;
		border: 1px solid var(--va-border);
		border-radius: 28px;
		background:
			linear-gradient(145deg, color-mix(in srgb, var(--va-accent) 12%, transparent), transparent),
			var(--va-bg-raised);
	}

	.error-mark span {
		color: var(--va-text);
		font: 800 34px/1 var(--va-font-mono);
		letter-spacing: -0.06em;
	}

	h1 {
		margin: 0;
		color: var(--va-text);
		font-size: clamp(24px, 5vw, 34px);
		font-weight: 800;
		letter-spacing: -0.04em;
	}

	p {
		margin: 12px auto 0;
		max-width: 390px;
		color: var(--va-text-muted);
		font-size: 13.5px;
		line-height: 1.9;
	}

	.actions {
		display: flex;
		justify-content: center;
		gap: 10px;
		margin-top: 24px;
	}

	button {
		min-height: 38px;
		border-radius: 10px;
		padding: 8px 15px;
		font-weight: 800;
		font-size: 13px;
		cursor: pointer;
		transition:
			transform 160ms ease,
			background-color 160ms ease,
			border-color 160ms ease;
	}

	button:hover {
		transform: translateY(-1px);
	}

	.primary {
		border: 0;
		background: var(--va-accent);
		color: #fff;
	}

	.ghost {
		border: 1px solid var(--va-border);
		background: var(--va-bg-raised);
		color: var(--va-text);
	}

	.ghost:hover {
		border-color: var(--va-border-strong);
		background: var(--va-bg-hover);
	}

	@media (max-width: 520px) {
		.error-card {
			padding: 18px;
			border-radius: 14px;
		}

		.actions {
			display: grid;
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
