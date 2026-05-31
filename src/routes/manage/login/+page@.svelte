<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import LoginScreen from '$lib/components/admin/LoginScreen.svelte';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import { login } from '../page.remote';

	const basePath = $derived(page.url.pathname.replace(/\/login\/?$/, '') || '/manage');

	$effect(() => {
		const redirectTo = page.url.searchParams.get('redirect') ?? `${basePath}/traffic`;
		if (login.result?.loginSuccess) {
			void goto(redirectTo, { replaceState: true });
		}
	});
</script>

<svelte:head>
	<title>ورود به Skyline | پنل مدیریت</title>
</svelte:head>

<LoginScreen
	eyebrow="Skyline"
	title="ورود به پنل مدیریت"
	description="با نام کاربری و گذرواژه مدیریتی وارد شوید."
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
			<label for="admin-login-username">نام کاربری</label>
			<input
				id="admin-login-username"
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
			<label for="admin-login-passkey">گذرواژه</label>
			<input
				id="admin-login-passkey"
				{...login.fields.passkey.as('password')}
				autocomplete="current-password"
				class="admin-field"
				placeholder="گذرواژه را وارد کنید"
			/>
			{#each login.fields.passkey.issues() as issue, index (index)}
				<p class="form-error">{issue.message}</p>
			{/each}
		</div>

		<button type="submit" class="admin-btn admin-btn-primary login-submit" disabled={login.pending > 0}>
			<AnimatedIcon name="chevron-left" size={16} />
			<span>{login.pending > 0 ? 'در حال ورود...' : 'ورود به Skyline'}</span>
		</button>
	</form>
</LoginScreen>
