<script lang="ts">
	import { page } from '$app/state';
	import { requestPasswordReset } from '../page.remote';
	import { toast } from 'svelte-sonner';

	const basePath = $derived(page.url.pathname.replace(/\/forgot-password\/?$/, ''));
	let email = $state('');
	let loading = $state(false);
	let sent = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		loading = true;
		try {
			const result = (await requestPasswordReset({ email, basePath })) as Record<string, unknown> | null;
			if (result?.resetEmailSent) {
				sent = true;
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'خطایی رخ داد. دوباره تلاش کنید.');
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>بازیابی رمز عبور | Skyline</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-slate-950 p-4">
	<div class="w-full max-w-sm">
		<div class="mb-8 text-center">
			<div class="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-400">
				<span class="mdi mdi-lock-reset text-3xl"></span>
			</div>
			<h1 class="text-xl font-bold text-white">بازیابی رمز عبور</h1>
			<p class="mt-1 text-sm text-slate-400">آدرس ایمیل حساب خود را وارد کنید</p>
		</div>

		{#if sent}
			<div class="rounded-xl border border-emerald-500/30 bg-emerald-900/20 p-5 text-center">
				<span class="mdi mdi-email-check-outline mb-2 block text-4xl text-emerald-400"></span>
				<p class="text-sm text-emerald-300">
					اگر این ایمیل در سیستم موجود باشد، لینک بازیابی رمز عبور ارسال خواهد شد.
				</p>
				<p class="mt-2 text-xs text-slate-500">صندوق ورودی و پوشه اسپم خود را بررسی کنید.</p>
			</div>
		{:else}
			<form onsubmit={handleSubmit} class="space-y-4">
				<div>
					<label for="email" class="mb-1.5 block text-sm font-medium text-slate-300">
						آدرس ایمیل
					</label>
					<input
						id="email"
						type="email"
						bind:value={email}
						required
						dir="ltr"
						placeholder="example@email.com"
						class="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
					/>
				</div>

				<button
					type="submit"
					disabled={loading || !email}
					class="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{loading ? 'در حال ارسال...' : 'ارسال لینک بازیابی'}
				</button>
			</form>
		{/if}

		<div class="mt-6 text-center">
			<a href="{basePath}/overview" class="text-sm text-indigo-400 hover:text-indigo-300">
				← بازگشت به صفحه ورود
			</a>
		</div>
	</div>
</div>
