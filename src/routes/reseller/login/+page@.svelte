<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import LoginScreen from '$lib/components/admin/LoginScreen.svelte';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import { login } from '../page.remote';

	const basePath = $derived(page.url.pathname.replace(/\/login\/?$/, '') || '/reseller');

	$effect(() => {
		const redirectTo = page.url.searchParams.get('redirect') ?? `${basePath}/overview`;
		if (login.result?.loginSuccess) {
			void goto(redirectTo, { replaceState: true });
		}
	});
</script>

<svelte:head>
	<title>ورود به Skyline | پنل فروشنده</title>
</svelte:head>

<LoginScreen
	eyebrow="Skyline"
	title="ورود به پنل فروشنده"
	description="با نام کاربری و گذرواژه خود وارد شوید."
>
	<form
		{...login.enhance(async ({ submit }) => {
			await submit();
			const result = login.result;
			if (result?.loginSuccess) toast.success(result.loginSuccess);
			if (result?.loginError) toast.error(result.loginError);
		})}
		class="login-form-inner"
	>
		<div class="form-field">
			<label for="reseller-login-username">نام کاربری</label>
			<input
				id="reseller-login-username"
				{...login.fields.username.as('text')}
				autocomplete="username"
				class="admin-field"
				placeholder="نام کاربری"
			/>
			{#each login.fields.username.issues() as issue, index (index)}
				<p class="form-error">{issue.message}</p>
			{/each}
		</div>

		<div class="form-field">
			<label for="reseller-login-password">گذرواژه</label>
			<input
				id="reseller-login-password"
				{...login.fields.password.as('password')}
				autocomplete="current-password"
				class="admin-field"
				placeholder="گذرواژه"
			/>
			{#each login.fields.password.issues() as issue, index (index)}
				<p class="form-error">{issue.message}</p>
			{/each}
		</div>

		<button type="submit" class="admin-btn admin-btn-primary login-submit" disabled={login.pending > 0}>
			<AnimatedIcon name="chevron-left" size={16} />
			<span>{login.pending > 0 ? 'در حال ورود...' : 'ورود به Skyline'}</span>
		</button>

		<div class="forgot-link-row">
			<a href="{basePath}/forgot-password" class="forgot-link">رمز عبور را فراموش کرده‌اید؟</a>
		</div>
	</form>
</LoginScreen>

<style>
	.forgot-link-row {
		text-align: center;
		margin-top: 4px;
	}

	.forgot-link {
		font: 500 12px var(--va-font-mono);
		color: var(--va-text-faint);
		text-decoration: none;
		transition: color 0.16s ease;
	}

	.forgot-link:hover {
		color: var(--va-accent);
	}
</style>
