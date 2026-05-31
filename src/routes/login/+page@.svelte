<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import LoginScreen from '$lib/components/admin/LoginScreen.svelte';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import { login } from './page.remote';

	type PageData = {
		basePath: string;
		showForgotPassword: boolean;
	};

	let { data }: { data: PageData } = $props();
	let submittedLogin = $state(false);

	const managerPath = $derived(data.basePath ? `${data.basePath}/manager` : '/manage');
	const resellerPath = $derived(data.basePath ? `${data.basePath}/reseller` : '/reseller');
	const forgotPasswordPath = $derived(`${resellerPath}/forgot-password`);

	function defaultRedirect(role: 'admin' | 'reseller') {
		return role === 'admin' ? `${managerPath}/traffic` : `${resellerPath}/overview`;
	}

	$effect(() => {
		const role = login.result?.role;
		if (submittedLogin && login.result?.loginSuccess && (role === 'admin' || role === 'reseller')) {
			const redirectTo = page.url.searchParams.get('redirect') ?? defaultRedirect(role);
			void goto(redirectTo, { replaceState: true });
		}
	});
</script>

<svelte:head>
	<title>ورود به Skyline</title>
</svelte:head>

<LoginScreen
	eyebrow="Skyline"
	title="ورود به Skyline"
	description="با نام کاربری و گذرواژه خود وارد شوید. نقش حساب به‌صورت خودکار تشخیص داده می‌شود."
>
	<form
		{...login.enhance(async ({ submit }) => {
			submittedLogin = true;
			await submit();
			const result = login.result;
			if (result?.loginSuccess) toast.success(result.loginSuccess);
			if (result?.loginError) toast.error(result.loginError);
		})}
		class="login-form-inner"
	>
		<div class="form-field">
			<label for="unified-login-username">نام کاربری</label>
			<input
				id="unified-login-username"
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
			<label for="unified-login-password">گذرواژه</label>
			<input
				id="unified-login-password"
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

		{#if data.showForgotPassword}
			<div class="forgot-link-row">
				<a href={forgotPasswordPath} class="forgot-link">رمز عبور را فراموش کرده‌اید؟</a>
			</div>
		{/if}
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
