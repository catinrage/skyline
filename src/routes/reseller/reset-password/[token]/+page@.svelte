<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { confirmPasswordReset } from '../../page.remote';
	import { toast } from 'svelte-sonner';

	const token = $derived(page.params.token ?? '');
	const basePath = $derived(page.url.pathname.replace(/\/reset-password\/[^/]+\/?$/, ''));
	let newPassword = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let done = $state(false);
	let errorMsg = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (newPassword !== confirmPassword) {
			errorMsg = 'رمز عبور و تکرار آن یکسان نیستند.';
			return;
		}
		errorMsg = '';
		loading = true;
		try {
			const result = (await confirmPasswordReset({ token, newPassword, confirmPassword })) as Record<string, unknown> | null;
			if (result?.resetSuccess) {
				done = true;
				toast.success(result.resetSuccess as string);
				setTimeout(() => goto(`${basePath}/overview`), 2000);
			} else if (result?.resetError) {
				errorMsg = result.resetError as string;
			}
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'خطایی رخ داد. دوباره تلاش کنید.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>تغییر رمز عبور | Skyline</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-slate-950 p-4">
	<div class="w-full max-w-sm">
		<div class="mb-8 text-center">
			<div class="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-400">
				<span class="mdi mdi-key-variant text-3xl"></span>
			</div>
			<h1 class="text-xl font-bold text-white">تنظیم رمز عبور جدید</h1>
			<p class="mt-1 text-sm text-slate-400">رمز عبور جدید خود را وارد کنید</p>
		</div>

		{#if done}
			<div class="rounded-xl border border-emerald-500/30 bg-emerald-900/20 p-5 text-center">
				<span class="mdi mdi-check-circle-outline mb-2 block text-4xl text-emerald-400"></span>
				<p class="text-sm text-emerald-300">رمز عبور با موفقیت تغییر کرد. در حال انتقال به پنل...</p>
			</div>
		{:else}
			<form onsubmit={handleSubmit} class="space-y-4">
				{#if errorMsg}
					<div class="rounded-lg border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-300">
						{errorMsg}
					</div>
				{/if}

				<div>
					<label for="newPassword" class="mb-1.5 block text-sm font-medium text-slate-300">
						رمز عبور جدید
					</label>
					<input
						id="newPassword"
						type="password"
						bind:value={newPassword}
						required
						minlength="6"
						dir="ltr"
						placeholder="حداقل ۶ کاراکتر"
						class="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
					/>
				</div>

				<div>
					<label for="confirmPassword" class="mb-1.5 block text-sm font-medium text-slate-300">
						تکرار رمز عبور
					</label>
					<input
						id="confirmPassword"
						type="password"
						bind:value={confirmPassword}
						required
						dir="ltr"
						placeholder="رمز عبور را دوباره وارد کنید"
						class="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
					/>
				</div>

				<button
					type="submit"
					disabled={loading || !newPassword || !confirmPassword}
					class="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{loading ? 'در حال ذخیره...' : 'تغییر رمز عبور'}
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
