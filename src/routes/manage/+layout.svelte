<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- basePath is derived from the current matched manager route and stays internal. */
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { setContext, type Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';
	import AdminShell from '$lib/components/admin/AdminShell.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';
	import LoginScreen from '$lib/components/admin/LoginScreen.svelte';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { buildManageNav, manageTabMeta } from '$lib/components/admin/manage/nav-config';
	import { getManageState, login, logout } from './page.remote';

	let { children } = $props();

	const manageState = getManageState();
	setContext('manageState', manageState);
	const shellSearch = $state({ value: '' });
	setContext('adminShellSearch', shellSearch);
	const inspectorState = $state<{ content: Snippet | undefined }>({ content: undefined });
	setContext('setPageInspector', inspectorState);

	// Pathname analysis — works for /manage/* and /[base]/manager or /[base]/manage hidden variants.
	const segments = $derived(page.url.pathname.split('/').filter(Boolean));
	const hiddenManagerMatch = $derived(page.url.pathname.match(/^\/([^/]+)\/(manager|manage)(?:\/|$)/));
	const basePath = $derived(hiddenManagerMatch ? `/${hiddenManagerMatch[1]}/${hiddenManagerMatch[2]}` : '/manage');
	const currentTab = $derived(segments[hiddenManagerMatch ? 2 : 1] ?? 'traffic');

	const reportCount = $derived(
		(manageState.current?.configIssueReports?.length ?? 0) +
			(manageState.current?.resellerTickets?.filter((ticket) => ticket.status === 'open').length ?? 0)
	);
	const creditRequestCount = $derived(
		(manageState.current?.resellerCreditRequests ?? []).filter((r) => r.status === 'pending').length
	);
	const navItems = $derived(buildManageNav(basePath, { reportCount, creditRequestCount }));
	const meta = $derived(manageTabMeta[currentTab] ?? manageTabMeta.traffic);
	const resellerCommandItems = $derived(
		(manageState.current?.resellerAccounts ?? []).slice(0, 80).map((reseller) => ({
			id: `reseller:${reseller.id}`,
			label: reseller.username,
			subtitle: `فروشنده · موجودی ${reseller.stats?.gbBalance ?? 0} GB`,
			href: `${basePath}/resellers`,
			icon: 'store' as const,
			searchText: reseller.username
		}))
	);

	const breadcrumbs = $derived([
		{ label: 'Skyline', href: basePath },
		{ label: 'مدیریت' },
		{ label: meta.title }
	]);

	let logoutForm = $state<HTMLFormElement | null>(null);

	function handleLogout() {
		logoutForm?.requestSubmit();
	}

	$effect(() => {
		if (!manageState.current?.authenticated) return;

		// When the user lands on the bare /manage (or /base/manager) without a tab,
		// snap them to the default tab.
		if (
			currentTab === 'traffic' &&
			(page.url.pathname === '/manage' || page.url.pathname === basePath)
		) {
			void goto(`${basePath}/traffic`, { replaceState: true });
			return;
		}

		// If the x-ui connection is unavailable and the admin lands on the traffic
		// tab (which depends entirely on x-ui data), redirect them to settings so
		// they can review / fix the connection configuration.
		if (manageState.current.vpnDashboard === null && currentTab === 'traffic') {
			void goto(`${basePath}/settings`, { replaceState: true });
		}
	});

	// Feature 8: Live data polling every 10 seconds
	onMount(() => {
		if (!browser) return;
		const intervalId = setInterval(() => {
			if (manageState.current?.authenticated && !manageState.loading) {
				manageState.refresh();
			}
		}, 10_000);
		return () => clearInterval(intervalId);
	});
</script>

<svelte:head>
	<title>Skyline | مدیریت {meta?.title ?? ''}</title>
</svelte:head>

{#if manageState.error}
	<div class="admin-shell" dir="rtl">
		<div class="admin-error-screen">
			<div class="admin-card admin-error-card">
				<AnimatedIcon name="shield" size={48} />
				<h2>خطایی رخ داد</h2>
				<p>بارگذاری اطلاعات مدیریت انجام نشد. صفحه را دوباره باز کنید.</p>
			</div>
		</div>
	</div>
{:else if manageState.loading && !manageState.current}
	<div class="admin-shell" dir="rtl">
		<LoadingState label="در حال بارگذاری پنل مدیریت..." />
	</div>
{:else if !manageState.current?.authenticated}
	<LoginScreen
		eyebrow="Skyline"
		title="ورود به Skyline"
		description="با نام کاربری و گذرواژه خود وارد شوید. مسیر فعلی تعیین می‌کند وارد پنل مدیریت یا فروشندگی شوید."
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
				<label for="admin-username">نام کاربری</label>
				<input
					id="admin-username"
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
				<label for="passkey">گذرواژه</label>
				<input
					id="passkey"
					{...login.fields.passkey.as('password')}
					autocomplete="current-password"
					class="admin-field"
					placeholder="گذرواژه را وارد کنید"
				/>
				{#each login.fields.passkey.issues() as issue, index (index)}
					<p class="form-error">{issue.message}</p>
				{/each}
			</div>

			<button type="submit" class="admin-btn admin-btn-primary login-submit">
				<AnimatedIcon name="chevron-left" size={16} />
				<span>ورود به Skyline</span>
			</button>
		</form>
	</LoginScreen>
{:else}
	<AdminShell
		panelTitle={meta.title}
		panelSubtitle={meta.subtitle}
		userName="مدیر کل"
		userMeta="Skyline Admin"
		{navItems}
		activeId={currentTab}
		commandSearchItems={resellerCommandItems}
		{breadcrumbs}
		searchPlaceholder="جستجو در فروشندگان، پلن‌ها..."
		onSearch={(value) => (shellSearch.value = value)}
		onLogout={handleLogout}
		inspector={inspectorState.content}
	>
		{@render children()}
	</AdminShell>

	<!-- Hidden form so the AdminShell's logout button can trigger the
	     SvelteKit form remote without exposing form HTML in the shell. -->
	<form
		bind:this={logoutForm}
		{...logout.enhance(async ({ submit }) => {
			await submit();
			const result = logout.result as Record<string, string> | null;
			if (result?.logoutSuccess) toast.success(result.logoutSuccess);
			if (result?.logoutError) toast.error(result.logoutError);
		})}
		style="display:none"
		aria-hidden="true"
	></form>
{/if}

<style>
	:global(.login-form-inner) {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	:global(.form-field) {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	:global(.form-field label) {
		font-size: 0.82rem;
		font-weight: 500;
		color: var(--admin-text-strong);
	}
	:global(.form-field .admin-field) {
		padding: 0.75rem 1rem;
		font-size: 0.9rem;
	}
	:global(.form-error) {
		font-size: 0.78rem;
		color: var(--admin-danger);
		margin: 0;
	}
	:global(.login-submit) {
		justify-content: center;
		padding: 0.85rem 1.5rem;
		font-size: 0.95rem;
		width: 100%;
	}
	:global(.admin-error-screen) {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 2rem;
	}
	:global(.admin-error-card) {
		padding: 2rem;
		text-align: center;
		color: var(--admin-text);
		max-width: 420px;
	}
	:global(.admin-error-card h2) {
		margin: 1rem 0 0.5rem;
		font-size: 1.2rem;
		color: var(--admin-text-strong);
	}
	:global(.admin-error-card p) {
		color: var(--admin-text-muted);
		font-size: 0.85rem;
		margin: 0;
	}
</style>
