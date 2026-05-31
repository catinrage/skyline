<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- basePath is derived from the current matched reseller route and stays internal. */
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { setContext, type Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';
	import AdminShell from '$lib/components/admin/AdminShell.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import { buildResellerNav, resellerTabMeta } from '$lib/components/admin/reseller/nav-config';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { changePasswordCommand, getResellerState, logoutCommand } from './page.remote';

	let { children } = $props();

	const resellerState = getResellerState();
	setContext('resellerState', resellerState);
	const shellSearch = $state({ value: '' });
	setContext('adminShellSearch', shellSearch);
	const inspectorState = $state<{ content: Snippet | undefined }>({ content: undefined });
	setContext('setPageInspector', inspectorState);

	const segments = $derived(page.url.pathname.split('/').filter(Boolean));
	const hiddenMatch = $derived(page.url.pathname.match(/^\/([^/]+)\/reseller(?:\/|$)/));
	const basePath = $derived(hiddenMatch ? `/${hiddenMatch[1]}/reseller` : '/reseller');
	const loginPath = $derived(hiddenMatch ? `/${hiddenMatch[1]}/login` : '/login');
	const currentTab = $derived(segments[hiddenMatch ? 2 : 1] ?? 'overview');

	const panelState = $derived(resellerState.current);
	const pendingSubCreditRequests = $derived(
		(panelState?.subCreditRequests ?? []).filter((r) => r.status === 'pending').length
	);
	const pendingIncomingTickets = $derived(
		(panelState?.clientTickets ?? []).filter(
			(ticket) => ticket.status === 'open' && ticket.messages[ticket.messages.length - 1]?.senderType === 'client'
		).length +
			(panelState?.canManageSubResellers
				? (panelState?.subResellerTickets ?? []).filter(
						(ticket) => ticket.status === 'open' && ticket.messages[ticket.messages.length - 1]?.senderType === 'sub_reseller'
					).length
				: 0)
	);
	const navItems = $derived(
		buildResellerNav(basePath, {
			isSubReseller: panelState?.isSubReseller ?? false,
			canManageSubResellers: panelState?.canManageSubResellers ?? false,
			pendingSubCreditRequests,
			pendingIncomingTickets
		})
	);
	const meta = $derived(resellerTabMeta[currentTab] ?? resellerTabMeta.overview);
	const clientCommandItems = $derived(
		(panelState?.requests ?? []).slice(0, 50).map((request) => ({
			id: `client:${request.id}`,
			label: request.customerLabel || request.xuiEmail,
			subtitle: `${request.xuiEmail} · ${request.xuiClientUuid.slice(0, 8)}…`,
			href: `${basePath}/configs`,
			icon: 'list' as const,
			searchText: request.xuiClientUuid
		}))
	);

	const breadcrumbs = $derived([
		{ label: 'Skyline', href: basePath },
		{ label: 'پنل فروشنده' },
		{ label: meta.title }
	]);
	let firstLoginCurrentPassword = $state('');
	let firstLoginNextPassword = $state('');
	let firstLoginConfirmPassword = $state('');
	let firstLoginEmail = $state('');

	async function handleFirstLoginPasswordChange() {
		try {
			const result = (await changePasswordCommand({
				currentPassword: firstLoginCurrentPassword,
				nextPassword: firstLoginNextPassword,
				confirmPassword: firstLoginConfirmPassword,
				email: firstLoginEmail
			}).updates(resellerState)) as Record<string, unknown> | null;

			if (result?.passwordSuccess) {
				toast.success(result.passwordSuccess as string);
				firstLoginCurrentPassword = '';
				firstLoginNextPassword = '';
				firstLoginConfirmPassword = '';
			}
			if (result?.passwordError) toast.error(result.passwordError as string);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'تغییر گذرواژه انجام نشد.');
		}
	}

	async function handleLogout() {
		try {
			const result = (await logoutCommand().updates(resellerState)) as Record<string, unknown> | null;
			if (result?.logoutSuccess) toast.success(result.logoutSuccess as string);
			if (result?.logoutError) toast.error(result.logoutError as string);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'خروج انجام نشد.');
		}
	}

	$effect(() => {
		if (!panelState && !resellerState.loading) {
			return;
		}
		if (!resellerState.loading && panelState && !panelState.authenticated) {
			const current = page.url.pathname + (page.url.search || '');
			const isLoginPage = current.endsWith('/login') || current.includes('/login?');
			if (!isLoginPage) {
				void goto(`${loginPath}?panel=reseller&redirect=${encodeURIComponent(current)}`, { replaceState: true });
			}
		}
	});

	$effect(() => {
		if (
			panelState?.authenticated &&
			currentTab === 'overview' &&
			(page.url.pathname === '/reseller' || page.url.pathname === basePath)
		) {
			void goto(`${basePath}/overview`, { replaceState: true });
		}
	});

	// Feature 8: Live data polling every 10 seconds
	onMount(() => {
		if (!browser) return;
		const intervalId = setInterval(() => {
			// Only poll when authenticated and not in a loading state
			if (resellerState.current?.authenticated && !resellerState.loading) {
				resellerState.refresh();
			}
		}, 10_000);
		return () => clearInterval(intervalId);
	});
</script>

<svelte:head>
	<title>Skyline | پنل فروشنده — {meta?.title ?? ''}</title>
</svelte:head>

{#if resellerState.error}
	<div class="admin-shell" dir="rtl">
		<LoadingState label="بارگذاری پنل فروشنده انجام نشد. لطفاً صفحه را دوباره باز کنید." />
	</div>
{:else if resellerState.loading && !panelState}
	<div class="admin-shell" dir="rtl">
		<LoadingState label="در حال بارگذاری پنل فروشنده..." />
	</div>
{:else if !panelState?.authenticated}
	<div class="admin-shell" dir="rtl">
		<LoadingState label="در حال هدایت به صفحه ورود..." />
	</div>
{:else}
	<AdminShell
		panelTitle={meta.title}
		panelSubtitle={meta.subtitle}
		userName={panelState.reseller.username}
		userMeta="فروشنده Skyline"
		{navItems}
		activeId={currentTab}
		commandSearchItems={clientCommandItems}
		{breadcrumbs}
		searchPlaceholder="جستجو در پنل، کانفیگ‌ها، تیکت‌ها..."
		onSearch={(value) => (shellSearch.value = value)}
		onLogout={handleLogout}
		inspector={inspectorState.content}
	>
		{@render children()}
	</AdminShell>

	{#if panelState.reseller.mustChangePassword}
		<div class="first-login-backdrop" dir="rtl">
			<div class="first-login-modal">
				<div class="first-login-icon">
					<AnimatedIcon name="shield" size={18} active />
				</div>
				<div>
					<div class="va-section-label">اولین ورود</div>
					<h2>گذرواژه موقت را تغییر دهید</h2>
					<p>برای ادامه کار با پنل، گذرواژه اختصاصی خودتان را تنظیم کنید. ایمیل بازیابی اختیاری است.</p>
				</div>
				<label>
					<span>گذرواژه فعلی</span>
					<input class="admin-field" type="password" bind:value={firstLoginCurrentPassword} autocomplete="current-password" />
				</label>
				<label>
					<span>گذرواژه جدید</span>
					<input class="admin-field" type="password" bind:value={firstLoginNextPassword} autocomplete="new-password" />
				</label>
				<label>
					<span>تکرار گذرواژه جدید</span>
					<input class="admin-field" type="password" bind:value={firstLoginConfirmPassword} autocomplete="new-password" />
				</label>
				<label>
					<span>ایمیل بازیابی (اختیاری)</span>
					<input class="admin-field" type="email" bind:value={firstLoginEmail} autocomplete="email" placeholder="name@example.com" dir="ltr" />
				</label>
				<button
					type="button"
					class="admin-btn admin-btn-primary"
					disabled={changePasswordCommand.pending > 0}
					onclick={handleFirstLoginPasswordChange}
				>
					<AnimatedIcon name="key" size={13} />
					<span>{changePasswordCommand.pending > 0 ? 'در حال ذخیره...' : 'ذخیره و ادامه'}</span>
				</button>
			</div>
		</div>
	{/if}
{/if}

<style>
	.first-login-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: grid;
		place-items: center;
		padding: 18px;
		background: rgb(2 4 8 / 72%);
		backdrop-filter: blur(8px);
	}

	.first-login-modal {
		width: min(100%, 460px);
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 22px;
		border: 1px solid var(--va-border-strong);
		border-radius: 14px;
		background: var(--va-bg-panel);
		box-shadow: 0 24px 70px rgb(0 0 0 / 48%);
		color: var(--va-text);
	}

	.first-login-icon {
		width: 42px;
		height: 42px;
		display: grid;
		place-items: center;
		border-radius: 10px;
		background: color-mix(in srgb, var(--va-accent) 14%, transparent);
		color: var(--va-accent);
	}

	.first-login-modal h2 {
		margin: 4px 0 6px;
		font-size: 18px;
	}

	.first-login-modal p {
		margin: 0;
		color: var(--va-text-muted);
		font-size: 12.5px;
		line-height: 1.8;
	}

	.first-login-modal label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		color: var(--va-text);
		font-size: 12px;
		font-weight: 650;
	}

</style>
