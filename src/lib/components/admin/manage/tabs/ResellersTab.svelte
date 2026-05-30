<script lang="ts">
	import { getContext } from 'svelte';
	import { scale } from 'svelte/transition';
	import InspectorPortal from '$lib/components/admin/InspectorPortal.svelte';
	import { toast } from 'svelte-sonner';
	import EmptyState from '$lib/components/admin/EmptyState.svelte';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import VaAvatar from '$lib/components/admin/va/VaAvatar.svelte';
	import VaProgressBar from '$lib/components/admin/va/VaProgressBar.svelte';
	import VaStatRow from '$lib/components/admin/va/VaStatRow.svelte';
	import VaStatusDot from '$lib/components/admin/va/VaStatusDot.svelte';
	import VaCheckbox from '$lib/components/admin/va/VaCheckbox.svelte';
	import Modal from '$lib/components/admin/Modal.svelte';
	import ConfirmDialog from '$lib/components/admin/ConfirmDialog.svelte';
	import {
		createReseller,
		deleteReseller,
		resetResellerPassword,
		toggleAllResellerConfigs,
		toggleReseller,
		toggleResellerSubPermission,
		updateResellerInbounds,
		updateResellerSubLimit,
		revokeManagedResellerSession,
		setResellerGroup
	} from '../../../../../routes/manage/page.remote';

	type ResellerStats = {
		gbBalance: number;
		totalGbAdded: number;
		totalGbSold: number;
		totalGbRefunded: number;
		walletBalanceToman: number;
		totalSpentToman: number;
		currentDebtToman: number;
		debtCapToman: number | null;
		remainingCapToman: number | null;
		totalPaidToman: number;
		grossSalesToman: number;
	unpaidRequests: number;
	totalRequests: number;
	activeRequests: number;
	revokedRequests: number;
	revokedValueToman: number;
		lastPaymentAt: number | null;
	};

	type ResellerCreditRequest = {
		id: number;
		quotaGbSnapshot: number;
		priceTomanSnapshot: number;
		status: 'pending' | 'approved' | 'rejected';
		createdAt: number;
		reviewedAt: number | null;
	};

	type ResellerGbLedgerEntry = {
		id: number;
		type: 'purchase' | 'create' | 'recharge' | 'refund' | 'transfer';
		amountGb: number;
		createdAt: number;
	};

	type ResellerGroup = {
		id: number;
		name: string;
		color: string;
		badgeIcon: string;
		description: string;
	};

	type Reseller = {
		id: number;
		username: string;
		email: string;
		mustChangePassword: boolean;
		allowedInboundIds: number[] | null;
		createdAt: number;
		isActive: boolean;
		canDelete: boolean;
		deleteBlockedReason: string | null;
		customMessage: string | null;
		debtCapToman: number | null;
		parentResellerId: number | null;
		canManageSubResellers: boolean;
		subResellerLimit: number;
		groupId: number | null;
		groupName: string | null;
		groupColor: string | null;
		groupBadgeIcon: string | null;
		stats: ResellerStats;
		payments: Array<{ id: number; amountToman: number; createdAt: number }>;
		creditRequests: ResellerCreditRequest[];
		gbLedger: ResellerGbLedgerEntry[];
		sessions: Array<{ id: number; createdAt: number; lastUsedAt: number; userAgent: string }>;
	};

	type FinancialReport = {
		totalGbBalance: number;
		totalGbSold: number;
		pendingCreditRequests: number;
		totalOutstandingToman: number;
		totalPaidToman: number;
		totalGrossSalesToman: number;
		totalRemainingCapToman: number | null;
		totalActiveRequests: number;
		totalRevokedValueToman: number;
		blockedResellers: number;
		cappedResellers: number;
	};

	type ResellerFilter = 'all' | 'funded' | 'empty' | 'inactive' | 'over-cap';
	type ResellerSort = 'debt' | 'credit' | 'sales' | 'latest' | 'alphabetical';
	type InspectorTab = 'overview' | 'payments' | 'configs' | 'settings';

	type Props = {
		data: {
			resellerAccounts: Reseller[];
			resellerFinancialReport: FinancialReport | null;
			inboundOptions?: Array<{ id: number; remark: string | null }>;
			resellerGroups: ResellerGroup[];
		};
	};

	let { data }: Props = $props();

	const shellSearch = getContext<{ value: string }>('adminShellSearch') ?? { value: '' };
	let search = $state('');
	let filter = $state<ResellerFilter>('all');
	let sort = $state<ResellerSort>('debt');
	let sortDirection = $state<'asc' | 'desc'>('desc');
	let selectedId = $state<number | null>(data.resellerAccounts[0]?.id ?? null);
	let openMenuId = $state<number | null>(null);
	let contextMenuStyle = $state('');
	let mobileDetailsOpen = $state(false);
	let resetTarget = $state<Reseller | null>(null);
	let createModalOpen = $state(false);
	let selectedTab = $state<InspectorTab>('overview');
	let currentPage = $state(1);
	const pageSize = 10;

	const filters: Array<{ id: ResellerFilter; label: string }> = [
		{ id: 'all', label: 'همه' },
		{ id: 'funded', label: 'دارای گیگ' },
		{ id: 'empty', label: 'بدون گیگ' },
		{ id: 'inactive', label: 'غیرفعال' },
		{ id: 'over-cap', label: 'کم‌موجودی' }
	];

	const statItems = $derived(
		data.resellerFinancialReport
			? [
					{
						label: 'موجودی کل فروشندگان',
						value: data.resellerFinancialReport.totalGbBalance.toLocaleString('fa-IR-u-nu-latn'),
						unit: 'GB'
					},
					{
						label: 'گیگ فروخته‌شده',
						value: data.resellerFinancialReport.totalGbSold.toLocaleString('fa-IR-u-nu-latn'),
						unit: 'GB'
					},
					{
						label: 'درخواست شارژ باز',
						value: data.resellerFinancialReport.pendingCreditRequests.toLocaleString('fa-IR-u-nu-latn')
					},
					{
						label: 'کانفیگ فعال',
						value: data.resellerFinancialReport.totalActiveRequests.toLocaleString('fa-IR-u-nu-latn')
					}
				]
			: []
	);

	const filtered = $derived.by(() => {
		const q = (search || shellSearch.value).trim().toLowerCase();
		return data.resellerAccounts
			.filter((reseller) => {
				if (filter === 'funded' && reseller.stats.gbBalance <= 0) return false;
				if (filter === 'empty' && reseller.stats.gbBalance > 0) return false;
				if (filter === 'inactive' && reseller.isActive) return false;
					if (filter === 'over-cap' && (reseller.stats.gbBalance <= 0 || reseller.stats.gbBalance > 5)) {
						return false;
					}
					if (!q) return true;
					return [reseller.username, reseller.id, parentUsername(reseller), reseller.stats.gbBalance, reseller.stats.totalGbSold]
						.join(' ')
					.toLowerCase()
					.includes(q);
			})
			.sort((left, right) => {
				let value = 0;
				if (sort === 'debt') value = right.stats.gbBalance - left.stats.gbBalance;
				if (sort === 'credit') value = right.stats.totalGbAdded - left.stats.totalGbAdded;
				if (sort === 'sales') value = right.stats.totalGbSold - left.stats.totalGbSold;
				if (sort === 'latest') value = right.createdAt - left.createdAt;
				if (sort === 'alphabetical') value = left.username.localeCompare(right.username, 'fa');
				return sortDirection === 'desc' ? value : -value;
			});
	});

	const selected = $derived(
		(selectedId !== null ? data.resellerAccounts.find((reseller) => reseller.id === selectedId) : null) ??
			filtered[0] ??
			null
	);
	const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
	const paginated = $derived(filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize));
	const menuReseller = $derived(
		openMenuId !== null ? data.resellerAccounts.find((reseller) => reseller.id === openMenuId) ?? null : null
	);
	const selectedTitle = $derived(selected?.username || 'جزئیات فروشنده');

	function filterCount(target: ResellerFilter) {
		return data.resellerAccounts.filter((reseller) => {
			if (target === 'all') return true;
			if (target === 'funded') return reseller.stats.gbBalance > 0;
			if (target === 'empty') return reseller.stats.gbBalance <= 0;
			if (target === 'inactive') return !reseller.isActive;
			return reseller.stats.gbBalance > 0 && reseller.stats.gbBalance <= 5;
		}).length;
	}

	function formatDate(timestamp: number) {
		return new Intl.DateTimeFormat('fa-IR', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(timestamp * 1000));
	}

	function parentUsername(reseller: Reseller) {
		if (reseller.parentResellerId === null) return '';
		return data.resellerAccounts.find((account) => account.id === reseller.parentResellerId)?.username ?? `#${reseller.parentResellerId}`;
	}

	function setSort(next: ResellerSort) {
		if (sort === next) {
			sortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
			return;
		}
		sort = next;
		sortDirection = next === 'alphabetical' ? 'asc' : 'desc';
	}

	function sortMark(id: ResellerSort) {
		if (sort !== id) return '';
		return sortDirection === 'desc' ? ' ↓' : ' ↑';
	}

	function debtTone(reseller: Reseller): 'accent' | 'warning' | 'danger' | null {
		if (reseller.stats.gbBalance <= 0) return 'danger';
		if (reseller.stats.gbBalance <= 5) return 'warning';
		return 'accent';
	}

	async function handleCreate(submit: () => Promise<void>) {
		await submit();
		const result = createReseller.result;
		if (result?.resellerSuccess) {
			toast.success(result.resellerSuccess);
			createModalOpen = false;
		}
		if (result?.resellerError) toast.error(result.resellerError);
	}

	async function handleToggle(form: ReturnType<typeof toggleReseller.for>, submit: () => Promise<void>) {
		await submit();
		const result = form.result;
		if (result?.resellerToggleSuccess) toast.success(result.resellerToggleSuccess);
		if (result?.resellerToggleError) toast.error(result.resellerToggleError);
	}

	async function handleAllConfigs(
		form: ReturnType<typeof toggleAllResellerConfigs.for>,
		submit: () => Promise<void>
	) {
		await submit();
		const result = form.result;
		if (result?.resellerConfigsToggleSuccess) toast.success(result.resellerConfigsToggleSuccess);
		if (result?.resellerConfigsToggleError) toast.error(result.resellerConfigsToggleError);
	}

	async function handleDelete(form: ReturnType<typeof deleteReseller.for>, submit: () => Promise<void>) {
		await submit();
		const result = form.result;
		if (result?.resellerDeleteSuccess) toast.success(result.resellerDeleteSuccess);
		if (result?.resellerDeleteError) toast.error(result.resellerDeleteError);
	}

	async function handlePasswordReset(
		form: ReturnType<typeof resetResellerPassword.for>,
		submit: () => Promise<void>
	) {
		await submit();
		const result = form.result;
		if (result?.resellerResetSuccess) toast.success(result.resellerResetSuccess);
		if (result?.resellerResetError) toast.error(result.resellerResetError);
		resetTarget = null;
		closeContextMenu();
	}

	function toggleRowMenu(event: MouseEvent, id: number) {
		event.stopPropagation();
		if (openMenuId === id) {
			closeContextMenu();
			return;
		}
		const trigger = event.currentTarget as HTMLElement;
		const rect = trigger.getBoundingClientRect();
		const menuWidth = 210;
		const menuHeight = 140;
		const margin = 8;
		const gap = 6;

		// Vertical: open below; flip above if not enough room
		let top = rect.bottom + gap;
		if (top + menuHeight > window.innerHeight - margin) {
			top = Math.max(margin, rect.top - menuHeight - gap);
		}

		// Horizontal: anchor right-edge to button right-edge, but never
		// extend further left than the panel's left boundary.
		const panel = trigger.closest('.va-page-main') ?? trigger.closest('.admin-content');
		const panelLeft = panel ? panel.getBoundingClientRect().left : 0;
		const minLeft = Math.max(margin, panelLeft);
		let left = rect.right - menuWidth;
		left = Math.max(minLeft, left);
		left = Math.min(left, window.innerWidth - menuWidth - margin);

		contextMenuStyle = `top: ${Math.round(top)}px; left: ${Math.round(left)}px;`;
		openMenuId = id;
	}

	function closeContextMenu() {
		openMenuId = null;
		contextMenuStyle = '';
	}

	function openMobileDetails(reseller: Reseller) {
		selectedId = reseller.id;
		selectedTab = 'overview';
		mobileDetailsOpen = true;
		closeContextMenu();
	}

	// ── confirm-dialog state ─────────────────────────────────────────────────
	let bulkToggleConfirmOpen = $state(false);
	let bulkToggleConfirmEnable = $state(false);
	let bulkToggleConfirmUsername = $state('');
	let bulkToggleConfirmResolve: ((v: boolean) => void) | null = null;

	function awaitBulkToggleConfirm(username: string, enable: boolean): Promise<boolean> {
		return new Promise((resolve) => {
			bulkToggleConfirmUsername = username;
			bulkToggleConfirmEnable = enable;
			bulkToggleConfirmOpen = true;
			bulkToggleConfirmResolve = resolve;
		});
	}
	function resolveBulkToggle(confirmed: boolean) {
		bulkToggleConfirmOpen = false;
		bulkToggleConfirmResolve?.(confirmed);
		bulkToggleConfirmResolve = null;
	}

	let deleteConfirmOpen = $state(false);
	let deleteConfirmUsername = $state('');
	let deleteConfirmResolve: ((v: boolean) => void) | null = null;

	function awaitDeleteConfirm(username: string): Promise<boolean> {
		return new Promise((resolve) => {
			deleteConfirmUsername = username;
			deleteConfirmOpen = true;
			deleteConfirmResolve = resolve;
		});
	}
	function resolveDelete(confirmed: boolean) {
		deleteConfirmOpen = false;
		deleteConfirmResolve?.(confirmed);
		deleteConfirmResolve = null;
	}

	async function handleInboundAccess(
		form: ReturnType<typeof updateResellerInbounds.for>,
		submit: () => Promise<void>
	) {
		await submit();
		const result = form.result;
		if (result?.resellerInboundSuccess) toast.success(result.resellerInboundSuccess);
		if (result?.resellerInboundError) toast.error(result.resellerInboundError);
	}

	$effect(() => {
		if (typeof window === 'undefined') return;
		function closeOnOutside() {
			closeContextMenu();
		}
		window.addEventListener('click', closeOnOutside);
		window.addEventListener('scroll', closeOnOutside, true);
		return () => {
			window.removeEventListener('click', closeOnOutside);
			window.removeEventListener('scroll', closeOnOutside, true);
		};
	});
</script>

<InspectorPortal content={resellerInspector} />
		{#if statItems.length}
			<VaStatRow items={statItems} />
		{/if}

		<div class="va-toolbar">
			<label class="va-toolbar-search" aria-label="جستجوی فروشندگان">
				<AnimatedIcon name="search" size={13} />
				<input type="search" bind:value={search} placeholder="فیلتر فروشندگان..." />
			</label>

			<span class="va-divider-vertical" aria-hidden="true"></span>

			{#each filters as item (item.id)}
				<button
					type="button"
					class="va-chip"
					class:is-active={filter === item.id}
					onclick={() => (filter = item.id)}
				>
					{item.label}
					<span class="va-chip-count">{filterCount(item.id).toLocaleString('fa-IR-u-nu-latn')}</span>
				</button>
			{/each}

			<div class="toolbar-spacer"></div>

			<button type="button" class="admin-btn admin-btn-primary" onclick={() => (createModalOpen = true)}>
				<AnimatedIcon name="store" size={13} active />
				<span>فروشنده جدید</span>
			</button>
		</div>

		{#if !filtered.length}
			<div class="va-card empty-wrap">
				<EmptyState
					title="فروشنده‌ای با این فیلتر پیدا نشد"
					description="جستجو یا فیلتر را تغییر دهید، یا فروشنده جدید ایجاد کنید."
					icon="search"
				/>
			</div>
		{:else}
			<div class="va-table-wrap desktop-only">
				<table class="va-table reseller-table">
					<thead>
						<tr>
							<th></th>
							<th><button type="button" class="th-sort" onclick={() => setSort('alphabetical')}>فروشنده{sortMark('alphabetical')}</button></th>
							<th>وضعیت</th>
							<th class="align-left"><button type="button" class="th-sort" onclick={() => setSort('debt')}>موجودی GB{sortMark('debt')}</button></th>
							<th class="align-left"><button type="button" class="th-sort" onclick={() => setSort('credit')}>شارژ GB{sortMark('credit')}</button></th>
							<th class="align-left"><button type="button" class="th-sort" onclick={() => setSort('sales')}>فروش GB{sortMark('sales')}</button></th>
							<th class="align-left">فعال</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each paginated as reseller (reseller.id)}
							<tr
								class:is-selected={selected?.id === reseller.id}
								onclick={() => (selectedId = reseller.id)}
							>
								<td class="avatar-cell"><VaAvatar name={reseller.username} /></td>
								<td>
									<div class="reseller-name-row">
										<div class="reseller-name">{reseller.username}</div>
										{#if reseller.parentResellerId !== null}
											<span class="reseller-role-badge">زیرفروشنده</span>
										{/if}
										{#if reseller.groupName}
											<span class="group-badge" style="--gc: {reseller.groupColor ?? '#6366f1'}">
												<span class="group-dot"></span>{reseller.groupName}
											</span>
										{/if}
									</div>
									{#if reseller.parentResellerId !== null}
										<div class="reseller-parent">
											متعلق به {parentUsername(reseller)} <span dir="ltr">#{reseller.parentResellerId}</span>
										</div>
									{/if}
									<div class="reseller-meta">
										{formatDate(reseller.createdAt)}
										{#if reseller.stats.lastPaymentAt}
											· آخرین پرداخت {formatDate(reseller.stats.lastPaymentAt)}
										{/if}
									</div>
								</td>
								<td>
									<VaStatusDot
										tone={reseller.isActive ? 'success' : 'muted'}
										label={reseller.isActive ? 'فعال' : 'غیرفعال'}
									/>
								</td>
								<td class="align-left debt-cell">
									<div
										class="va-mono debt-value"
										class:danger={reseller.stats.gbBalance <= 0}
									>
										{reseller.stats.gbBalance.toLocaleString('fa-IR-u-nu-latn')} GB
									</div>
									<div class="progress-line">
										<VaProgressBar
											value={Math.max(reseller.stats.gbBalance, 0)}
											max={reseller.stats.totalGbAdded || reseller.stats.gbBalance || 1}
											tone={debtTone(reseller)}
										/>
									</div>
									<div class="reseller-meta">مصرف‌شده: {reseller.stats.totalGbSold.toLocaleString('fa-IR-u-nu-latn')} GB</div>
								</td>
								<td class="align-left">
									<div class="va-mono">{reseller.stats.totalGbAdded.toLocaleString('fa-IR-u-nu-latn')} GB</div>
									<div class="reseller-meta">{reseller.creditRequests.length.toLocaleString('fa-IR-u-nu-latn')} درخواست شارژ</div>
								</td>
								<td class="align-left">
									<div class="va-mono">{reseller.stats.totalGbSold.toLocaleString('fa-IR-u-nu-latn')} GB</div>
									<div class="reseller-meta">
										{reseller.stats.activeRequests.toLocaleString('fa-IR-u-nu-latn')}/{reseller.stats.totalRequests.toLocaleString('fa-IR-u-nu-latn')}
										کانفیگ
									</div>
								</td>
								<td class="align-left">
									<span class="va-mono" class:warning={reseller.stats.unpaidRequests > 0}>
										{reseller.stats.activeRequests.toLocaleString('fa-IR-u-nu-latn')}
									</span>
								</td>
								<td class="align-left">
									<button
										type="button"
										class="va-icon-btn"
										class:is-active={openMenuId === reseller.id}
										aria-label="نمایش عملیات"
										aria-expanded={openMenuId === reseller.id}
										onclick={(event) => toggleRowMenu(event, reseller.id)}
									>
										<AnimatedIcon name="menu" size={13} />
									</button>
									{#if false && openMenuId === reseller.id}
										<div
											class="reseller-context-menu"
											role="menu"
											tabindex="-1"
											onclick={(event) => event.stopPropagation()}
											onkeydown={(event) => event.stopPropagation()}
										>
											<button type="button" onclick={() => (selectedId = reseller.id)}>
												<span class="mdi mdi-account-eye-outline"></span>
												<span>نمایش جزئیات</span>
											</button>
											<button type="button" onclick={() => (resetTarget = reseller)}>
												<span class="mdi mdi-lock-reset"></span>
												<span>ریست گذرواژه به 1234</span>
											</button>
										</div>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="va-mobile-list reseller-mobile-list">
				{#each paginated as reseller (reseller.id)}
					<article
						class="va-card reseller-mobile-card"
						class:is-selected={selected?.id === reseller.id}
					>
						<div class="mobile-card-head">
							<VaAvatar name={reseller.username} size={32} />
							<button type="button" class="mobile-card-main" onclick={() => (selectedId = reseller.id)}>
								<div class="reseller-name-row">
									<div class="reseller-name">{reseller.username}</div>
									{#if reseller.parentResellerId !== null}
										<span class="reseller-role-badge">زیرفروشنده</span>
									{/if}
								</div>
								{#if reseller.parentResellerId !== null}
									<div class="reseller-parent">متعلق به {parentUsername(reseller)}</div>
								{/if}
								<div class="reseller-meta">ID #{reseller.id} · {formatDate(reseller.createdAt)}</div>
							</button>
							<VaStatusDot
								tone={reseller.isActive ? 'success' : 'muted'}
								label={reseller.isActive ? 'فعال' : 'غیرفعال'}
							/>
						</div>
						<div class="mobile-metrics">
							<div>
								<span>موجودی</span>
								<strong>{reseller.stats.gbBalance.toLocaleString('fa-IR-u-nu-latn')} GB</strong>
							</div>
							<div>
								<span>فروش</span>
								<strong>{reseller.stats.totalGbSold.toLocaleString('fa-IR-u-nu-latn')} GB</strong>
							</div>
						</div>
						<VaProgressBar
							value={Math.max(reseller.stats.gbBalance, 0)}
							max={reseller.stats.totalGbAdded || reseller.stats.gbBalance || 1}
							tone={debtTone(reseller)}
						/>
						<div class="mobile-card-actions">
							<button
								type="button"
								class="va-icon-btn mobile-detail-btn"
								aria-label="نمایش جزئیات"
								onclick={() => openMobileDetails(reseller)}
							>
								<span class="mdi mdi-eye-outline"></span>
							</button>
							<button
								type="button"
								class="va-icon-btn"
								class:is-active={openMenuId === reseller.id}
								aria-label="نمایش عملیات"
								aria-expanded={openMenuId === reseller.id}
								onclick={(event) => toggleRowMenu(event, reseller.id)}
							>
								<AnimatedIcon name="menu" size={13} />
							</button>
						</div>
					</article>
				{/each}
			</div>

			<div class="va-pagination">
				<div>{filtered.length.toLocaleString('fa-IR-u-nu-latn')} ردیف از {data.resellerAccounts.length.toLocaleString('fa-IR-u-nu-latn')}</div>
				<div class="pagination-controls">
					<button type="button" class="va-icon-btn" disabled={currentPage <= 1} onclick={() => currentPage--} aria-label="صفحه قبل">
						<span class="pagination-prev-icon"><AnimatedIcon name="chevron-left" size={13} /></span>
					</button>
					<span>{currentPage} / {totalPages}</span>
					<button type="button" class="va-icon-btn next-page" disabled={currentPage >= totalPages} onclick={() => currentPage++} aria-label="صفحه بعد">
						<AnimatedIcon name="chevron-left" size={13} />
					</button>
				</div>
			</div>
		{/if}

{#snippet resellerInspector()}
	<aside class="va-inspector">
		{#if selected}
			{@const toggleForm = toggleReseller.for(selected.id)}
			{@const deleteForm = deleteReseller.for(selected.id)}
			{@const allConfigsDisableForm = toggleAllResellerConfigs.for(selected.id * 2)}
			{@const allConfigsEnableForm = toggleAllResellerConfigs.for(selected.id * 2 + 1)}
			{@const inboundForm = updateResellerInbounds.for(selected.id)}
			{@const subPermForm = toggleResellerSubPermission.for(selected.id)}
			{@const subLimitForm = updateResellerSubLimit.for(selected.id)}

			<div class="va-inspector-head">
				<VaAvatar name={selected.username} size={28} />
				<div class="inspector-title-block">
					<p class="va-inspector-title title-with-role">
						{selected.username}
						{#if selected.parentResellerId !== null}
							<span class="reseller-role-badge">زیرفروشنده</span>
						{/if}
						{#if selected.groupName}
							<span class="group-badge" style="--gc: {selected.groupColor ?? '#6366f1'}">
								<span class="group-dot"></span>{selected.groupName}
							</span>
						{/if}
					</p>
					{#if selected.parentResellerId !== null}
						<p class="inspector-parent">متعلق به {parentUsername(selected)} <span dir="ltr">#{selected.parentResellerId}</span></p>
					{/if}
					<p class="va-inspector-sub">ID #{selected.id} · {formatDate(selected.createdAt)}</p>
				</div>
			</div>

			<div class="va-inspector-tabs">
				<button type="button" class="va-inspector-tab" class:is-active={selectedTab === 'overview'} onclick={() => (selectedTab = 'overview')}>نمای کلی</button>
				<button type="button" class="va-inspector-tab" class:is-active={selectedTab === 'payments'} onclick={() => (selectedTab = 'payments')}>شارژها</button>
				<button type="button" class="va-inspector-tab" class:is-active={selectedTab === 'configs'} onclick={() => (selectedTab = 'configs')}>کانفیگ‌ها</button>
				<button type="button" class="va-inspector-tab" class:is-active={selectedTab === 'settings'} onclick={() => (selectedTab = 'settings')}>تنظیمات</button>
			</div>

			<div class="va-inspector-body">
				{#if selectedTab === 'payments'}
					<div class="tab-panel-card">
						<div class="va-section-label">درخواست‌های شارژ GB</div>
						{#if selected.creditRequests.length === 0}
							<div class="field-hint">درخواست شارژی ثبت نشده است.</div>
						{:else}
							{#each selected.creditRequests.slice(0, 10) as request (request.id)}
								<div class="mini-row">
									<span>{formatDate(request.createdAt)}</span>
									<strong>{request.quotaGbSnapshot.toLocaleString('fa-IR-u-nu-latn')} GB · {request.status === 'approved' ? 'تایید' : request.status === 'rejected' ? 'رد' : 'در انتظار'}</strong>
								</div>
							{/each}
						{/if}
					</div>
				{:else if selectedTab === 'configs'}
					<div class="tab-panel-card">
						<div class="va-section-label">وضعیت کانفیگ‌ها</div>
						<div class="mini-row"><span>کل کانفیگ‌ها</span><strong>{selected.stats.totalRequests.toLocaleString('fa-IR-u-nu-latn')}</strong></div>
						<div class="mini-row"><span>فعال</span><strong>{selected.stats.activeRequests.toLocaleString('fa-IR-u-nu-latn')}</strong></div>
						<div class="mini-row"><span>لغوشده</span><strong>{selected.stats.revokedRequests.toLocaleString('fa-IR-u-nu-latn')}</strong></div>
					</div>
				{:else if selectedTab === 'settings'}
					<div class="tab-panel-card">
						<div class="va-section-label">تنظیمات فروشنده</div>
						<div class="mini-row"><span>ایمیل</span><strong>{selected.email || 'ثبت نشده'}</strong></div>
						{#if selected.parentResellerId !== null}
							<div class="mini-row"><span>فروشنده والد</span><strong>{parentUsername(selected)} (#{selected.parentResellerId})</strong></div>
						{/if}
						<div class="mini-row"><span>تغییر اجباری گذرواژه</span><strong>{selected.mustChangePassword ? 'فعال' : 'غیرفعال'}</strong></div>
						<div class="mini-row"><span>قابل حذف</span><strong>{selected.canDelete ? 'بله' : 'خیر'}</strong></div>
						{#if !selected.parentResellerId}
							<div class="mini-row settings-perm-row">
								<span>مدیریت زیرفروشنده</span>
								<form
									{...subPermForm.enhance(async ({ submit }) => {
										await submit();
										const result = subPermForm.result;
										if (result?.resellerSubPermSuccess) toast.success(result.resellerSubPermSuccess);
										if (result?.resellerSubPermError) toast.error(result.resellerSubPermError);
									})}
									class="perm-toggle-form"
								>
									<input type="hidden" name="id" value={selected.id} />
									<input type="hidden" name="enabled" value={selected.canManageSubResellers ? 'false' : 'true'} />
									<button
										type="submit"
										class="va-switch"
										class:is-on={selected.canManageSubResellers}
										aria-label={selected.canManageSubResellers ? 'غیرفعال کردن مجوز' : 'فعال کردن مجوز'}
									><span></span></button>
								</form>
							</div>
							<form
								{...subLimitForm.enhance(async ({ submit }) => {
									await submit();
									const result = subLimitForm.result;
									if (result?.resellerSubLimitSuccess) toast.success(result.resellerSubLimitSuccess);
									if (result?.resellerSubLimitError) toast.error(result.resellerSubLimitError);
								})}
								class="sub-limit-form"
							>
								<input type="hidden" name="id" value={selected.id} />
								<label for={`sub-limit-${selected.id}`}>سقف زیرفروشندگان</label>
								<div>
									<input
										id={`sub-limit-${selected.id}`}
										class="admin-field"
										type="number"
										name="subResellerLimit"
										min="0"
										max="10000"
										value={selected.subResellerLimit}
									/>
									<button type="submit" class="admin-btn admin-btn-ghost">ذخیره</button>
								</div>
								<p>مقدار صفر ساخت زیرفروشنده جدید را متوقف می‌کند.</p>
							</form>
						{/if}
						<div class="va-section-label">گروه‌بندی</div>
						<div class="mini-row group-assign-mini">
							<span>گروه فروشنده</span>
							<select
								class="group-select"
								value={selected.groupId ?? ''}
								onchange={async (e) => {
									const val = (e.currentTarget as HTMLSelectElement).value;
									const result = await setResellerGroup({ resellerId: selected.id, groupId: val === '' ? null : Number(val) });
									if (result?.groupSuccess) toast.success(result.groupSuccess);
									if (result?.groupError) toast.error(result.groupError);
								}}
							>
								<option value="">بدون گروه</option>
								{#each data.resellerGroups as group (group.id)}
									<option value={group.id}>{group.name}</option>
								{/each}
							</select>
						</div>

						<div class="va-section-label">نشست‌های فعال</div>
						{#if selected.sessions.length === 0}
							<div class="field-hint">نشست فعالی وجود ندارد.</div>
						{:else}
							{#each selected.sessions as session (session.id)}
								{@const sessionForm = revokeManagedResellerSession.for(session.id)}
								<form
									{...sessionForm.enhance(async ({ submit }) => {
										await submit();
										if (sessionForm.result?.sessionSuccess) toast.success(sessionForm.result.sessionSuccess);
										if (sessionForm.result?.sessionError) toast.error(sessionForm.result.sessionError);
									})}
									class="mini-row session-admin-row"
								>
									<input type="hidden" name="resellerId" value={selected.id} />
									<input type="hidden" name="sessionId" value={session.id} />
									<span>{session.userAgent || 'مرورگر ناشناس'}<small>{formatDate(session.lastUsedAt || session.createdAt)}</small></span>
									<button type="submit" class="admin-btn admin-btn-ghost">لغو</button>
								</form>
							{/each}
						{/if}
					</div>
				{/if}

				{#if selectedTab === 'overview'}
				<div class="inspector-status-row">
					<div>
						<div class="va-section-label">وضعیت</div>
						<VaStatusDot
							tone={selected.isActive ? 'success' : 'muted'}
							label={selected.isActive ? 'فعال' : 'غیرفعال'}
						/>
					</div>

					<form
						{...toggleForm.enhance(async ({ submit }) => {
							await handleToggle(toggleForm, submit);
						})}
					>
						<input type="hidden" name="id" value={selected.id} />
						<input type="hidden" name="enabled" value={selected.isActive ? 'false' : 'true'} />
						<button
							type="submit"
							class="va-switch"
							class:is-on={selected.isActive}
							aria-label={selected.isActive ? 'غیرفعال کردن فروشنده' : 'فعال کردن فروشنده'}
						>
							<span></span>
						</button>
					</form>
				</div>

				<div class="inspector-mini-grid">
					<div>
						<span>موجودی</span>
						<strong>{selected.stats.gbBalance.toLocaleString('fa-IR-u-nu-latn')} GB</strong>
					</div>
					<div>
						<span>مصرف‌شده</span>
						<strong>{selected.stats.totalGbSold.toLocaleString('fa-IR-u-nu-latn')} GB</strong>
					</div>
					<div>
						<span>شارژ شده</span>
						<strong class="success">{selected.stats.totalGbAdded.toLocaleString('fa-IR-u-nu-latn')} GB</strong>
					</div>
					<div>
						<span>برگشتی</span>
						<strong>{selected.stats.totalGbRefunded.toLocaleString('fa-IR-u-nu-latn')} GB</strong>
					</div>
				</div>

				<form
					{...inboundForm.enhance(async ({ submit }) => {
						await handleInboundAccess(inboundForm, submit);
					})}
				>
					<input type="hidden" name="id" value={selected.id} />
					<div class="va-section-label">سرورهای مجاز فروش</div>
					<div class="inbound-access-box">
						{#if (data.inboundOptions ?? []).length === 0}
							<div class="field-hint">لیست inbound در دسترس نیست.</div>
						{:else}
							{#each data.inboundOptions ?? [] as inbound (inbound.id)}
								<VaCheckbox
									name="allowedInboundIds"
									value={inbound.id}
									checked={!selected.allowedInboundIds || selected.allowedInboundIds.includes(inbound.id)}
									label={inbound.remark || `Inbound #${inbound.id}`}
								/>
							{/each}
							<div class="field-hint">اگر هیچ گزینه‌ای ذخیره نشود، همه سرورها مجاز خواهند بود.</div>
							<button type="submit" class="admin-btn admin-btn-ghost full-width">ذخیره دسترسی سرورها</button>
						{/if}
					</div>
				</form>

				<div>
					<div class="va-section-label">اقدامات سریع</div>
					<div class="va-actions-list">
						<form
							{...allConfigsDisableForm.enhance(async ({ submit }) => {
								const confirmed = await awaitBulkToggleConfirm(selected.username, false);
								if (!confirmed) return;
								await handleAllConfigs(allConfigsDisableForm, submit);
							})}
						>
							<input type="hidden" name="id" value={selected.id} />
							<input type="hidden" name="enabled" value="false" />
							<button type="submit" class="va-action-row">
								<AnimatedIcon name="toggle" size={13} />
								<span>قطع همه کانفیگ‌ها</span>
								<AnimatedIcon name="chevron-left" size={12} />
							</button>
						</form>

						<form
							{...allConfigsEnableForm.enhance(async ({ submit }) => {
								const confirmed = await awaitBulkToggleConfirm(selected.username, true);
								if (!confirmed) return;
								await handleAllConfigs(allConfigsEnableForm, submit);
							})}
						>
							<input type="hidden" name="id" value={selected.id} />
							<input type="hidden" name="enabled" value="true" />
							<button type="submit" class="va-action-row">
								<AnimatedIcon name="toggle" size={13} active />
								<span>فعال‌سازی همه</span>
								<AnimatedIcon name="chevron-left" size={12} />
							</button>
						</form>

						{#if selected.canDelete}
							<form
								{...deleteForm.enhance(async ({ submit }) => {
									const confirmed = await awaitDeleteConfirm(selected.username);
									if (!confirmed) return;
									await handleDelete(deleteForm, submit);
								})}
							>
								<input type="hidden" name="id" value={selected.id} />
								<button type="submit" class="va-action-row danger">
									<AnimatedIcon name="flag" size={13} />
									<span>حذف امن حساب</span>
									<AnimatedIcon name="chevron-left" size={12} />
								</button>
							</form>
						{:else if selected.deleteBlockedReason}
							<div class="delete-blocked">{selected.deleteBlockedReason}</div>
						{/if}
					</div>
				</div>
				{/if}
			</div>
		{:else}
			<div class="va-inspector-body">
				<EmptyState
					title="فروشنده‌ای انتخاب نشده"
					description="برای نمایش جزئیات، یک ردیف را انتخاب کنید."
					icon="inbox"
				/>
			</div>
		{/if}
	</aside>
{/snippet}

{#if menuReseller}
	<div
		class="reseller-context-menu"
		style={contextMenuStyle}
		role="menu"
		tabindex="-1"
		transition:scale={{ duration: 120, start: 0.96, opacity: 0.78 }}
		onclick={(event) => event.stopPropagation()}
		onkeydown={(event) => event.stopPropagation()}
	>
		<button
			type="button"
			onclick={() => {
				selectedId = menuReseller.id;
				mobileDetailsOpen = true;
				closeContextMenu();
			}}
		>
			<span class="mdi mdi-account-eye-outline"></span>
			<span>نمایش جزئیات</span>
		</button>
		<button
			type="button"
			onclick={() => {
				resetTarget = menuReseller;
				closeContextMenu();
			}}
		>
			<span class="mdi mdi-lock-reset"></span>
			<span>ریست گذرواژه به 1234</span>
		</button>
	</div>
{/if}

<Modal open={mobileDetailsOpen && selected !== null} title={selectedTitle} eyebrow="جزئیات فروشنده" onClose={() => (mobileDetailsOpen = false)}>
	{#if selected}
		<div class="mobile-details-stack">
			<div class="inspector-status-row">
				<div>
					<div class="va-section-label">وضعیت</div>
					<VaStatusDot tone={selected.isActive ? 'success' : 'muted'} label={selected.isActive ? 'فعال' : 'غیرفعال'} />
				</div>
				<span class="reseller-meta">ID #{selected.id}</span>
			</div>
			<div class="inspector-mini-grid">
				<div>
					<span>موجودی</span>
					<strong>{selected.stats.gbBalance.toLocaleString('fa-IR-u-nu-latn')} GB</strong>
				</div>
				<div>
					<span>مصرف‌شده</span>
					<strong>{selected.stats.totalGbSold.toLocaleString('fa-IR-u-nu-latn')} GB</strong>
				</div>
				<div>
					<span>شارژ شده</span>
					<strong class="success">{selected.stats.totalGbAdded.toLocaleString('fa-IR-u-nu-latn')} GB</strong>
				</div>
				<div>
					<span>برگشتی</span>
					<strong>{selected.stats.totalGbRefunded.toLocaleString('fa-IR-u-nu-latn')} GB</strong>
				</div>
			</div>
			<div class="tab-panel-card">
				<div class="va-section-label">کانفیگ‌ها</div>
				<div class="mini-row"><span>کل کانفیگ‌ها</span><strong>{selected.stats.totalRequests.toLocaleString('fa-IR-u-nu-latn')}</strong></div>
				<div class="mini-row"><span>فعال</span><strong>{selected.stats.activeRequests.toLocaleString('fa-IR-u-nu-latn')}</strong></div>
				<div class="mini-row"><span>قابل حذف</span><strong>{selected.canDelete ? 'بله' : selected.deleteBlockedReason ?? 'خیر'}</strong></div>
			</div>
		</div>
	{/if}
</Modal>

{#if resetTarget}
	{@const resetForm = resetResellerPassword.for(resetTarget.id)}
	<div class="va-modal-backdrop" dir="rtl">
		<div class="va-modal-card">
			<div class="va-modal-icon danger">
				<AnimatedIcon name="key" size={16} active />
			</div>
			<div>
				<div class="va-section-label">تایید امنیتی</div>
				<h3>بازنشانی گذرواژه فروشنده</h3>
				<p>
					گذرواژه «{resetTarget.username}» به <code dir="ltr">1234</code> تغییر می‌کند و در ورود بعدی مجبور به تغییر
					گذرواژه خواهد شد.
				</p>
			</div>
			<form
				{...resetForm.enhance(async ({ submit }) => {
					await handlePasswordReset(resetForm, submit);
				})}
			>
				<input type="hidden" name="id" value={resetTarget.id} />
				<div class="va-modal-actions">
					<button type="button" class="admin-btn admin-btn-ghost" onclick={() => (resetTarget = null)}>
						انصراف
					</button>
					<button type="submit" class="admin-btn admin-btn-danger">
						<AnimatedIcon name="key" size={13} />
						<span>ریست به 1234</span>
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<Modal
	open={createModalOpen}
	title="ساخت حساب فروشنده"
	eyebrow="فروشنده جدید"
	onClose={() => (createModalOpen = false)}
>
	<form
		{...createReseller.enhance(async ({ submit }) => {
			await handleCreate(submit);
		})}
		class="create-form modal-create-form"
	>
		<div>
			<label class="va-section-label" for="new-reseller-username">نام کاربری</label>
			<div class="va-field-shell">
				<input id="new-reseller-username" {...createReseller.fields.username.as('text')} autocomplete="off" dir="ltr" placeholder="مثلاً arash.s" />
			</div>
			<div class="field-hint">۳ تا ۳۲ کاراکتر؛ حروف انگلیسی، عدد، نقطه، آندرلاین یا خط تیره.</div>
		</div>

		<div>
			<label class="va-section-label" for="new-reseller-password">گذرواژه موقت</label>
			<div class="va-field-shell">
				<input id="new-reseller-password" {...createReseller.fields.password.as('password')} autocomplete="new-password" placeholder="مثلاً 1234" />
			</div>
			<input type="hidden" name="debtCapToman" value="" />
		</div>

		<div class="modal-security-note">
			<AnimatedIcon name="shield" size={14} />
			<span>فروشنده در اولین ورود باید گذرواژه موقت را تغییر دهد.</span>
		</div>

		<div class="modal-form-actions">
			<button type="button" class="admin-btn admin-btn-ghost" onclick={() => (createModalOpen = false)}>انصراف</button>
			<button type="submit" class="admin-btn admin-btn-primary">
				<AnimatedIcon name="check" size={13} />
				<span>ساخت حساب</span>
			</button>
		</div>
	</form>
</Modal>

<!-- Bulk toggle confirmation -->
<ConfirmDialog
	open={bulkToggleConfirmOpen}
	title={bulkToggleConfirmEnable ? 'فعال‌سازی همه کانفیگ‌ها' : 'قطع همه کانفیگ‌ها'}
	description={bulkToggleConfirmEnable
		? `همه کانفیگ‌های فروشنده «${bulkToggleConfirmUsername}» دوباره فعال می‌شوند.`
		: `همه کانفیگ‌های فعال فروشنده «${bulkToggleConfirmUsername}» غیرفعال می‌شوند.`}
	confirmLabel={bulkToggleConfirmEnable ? 'بله، فعال کن' : 'بله، قطع کن'}
	intent={bulkToggleConfirmEnable ? 'info' : 'warning'}
	onConfirm={() => resolveBulkToggle(true)}
	onClose={() => resolveBulkToggle(false)}
/>

<!-- Delete reseller confirmation -->
<ConfirmDialog
	open={deleteConfirmOpen}
	title="حذف حساب فروشنده"
	description="حساب «{deleteConfirmUsername}» برای همیشه حذف می‌شود. این عملیات قابل بازگشت نیست."
	confirmLabel="بله، حذف کن"
	intent="danger"
	onConfirm={() => resolveDelete(true)}
	onClose={() => resolveDelete(false)}
/>

<style>
	.toolbar-spacer {
		flex: 1;
	}

	.align-left {
		text-align: left !important;
	}

	.th-sort {
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
		font: inherit;
		padding: 0;
	}

	.th-sort:hover {
		color: var(--va-accent);
	}

	.next-page {
		transform: rotate(180deg);
	}

	.avatar-cell {
		width: 36px;
		padding-inline-end: 6px !important;
	}

	.reseller-table td:last-child {
		position: relative;
	}

	.reseller-context-menu {
		position: fixed;
		z-index: 1000;
		width: 210px;
		max-width: calc(100vw - 20px);
		padding: 6px;
		border: 1px solid var(--va-border-strong);
		border-radius: 10px;
		background: var(--va-bg-panel);
		box-shadow: 0 18px 42px rgb(0 0 0 / 28%);
		transform-origin: top right;
	}

	.reseller-context-menu button {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 9px 10px;
		border: 0;
		border-radius: 7px;
		background: transparent;
		color: var(--va-text);
		cursor: pointer;
		font: 600 12px var(--va-font-fa);
		text-align: start;
		transition:
			background 160ms ease,
			color 160ms ease;
	}

	.reseller-context-menu button:hover {
		background: var(--va-bg-raised);
		color: var(--va-accent);
	}

	.reseller-name {
		color: var(--va-text);
		font: 500 12.5px var(--va-font-mono);
	}

	.reseller-name-row,
	.title-with-role {
		display: flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
	}

	.reseller-role-badge {
		display: inline-flex;
		align-items: center;
		padding: 2px 6px;
		border: 1px solid color-mix(in srgb, var(--va-accent) 28%, var(--va-border));
		border-radius: 5px;
		background: color-mix(in srgb, var(--va-accent) 9%, transparent);
		color: var(--va-accent);
		font: 500 10px var(--va-font-fa);
		white-space: nowrap;
	}

	.reseller-parent,
	.inspector-parent {
		margin: 3px 0 0;
		color: var(--va-accent);
		font: 500 10.5px var(--va-font-fa);
	}

	.inspector-parent span,
	.reseller-parent span {
		color: var(--va-text-faint);
		font-family: var(--va-font-mono);
	}

	.reseller-meta {
		margin-top: 3px;
		color: var(--va-text-faint);
		font: 500 10.5px var(--va-font-mono);
	}

	.debt-cell {
		width: 170px;
	}

	.debt-value.danger,
	.warning {
		color: var(--va-warning);
	}

	.debt-value.danger {
		color: var(--va-danger);
	}

	.progress-line {
		width: 110px;
		margin: 5px 0 0 auto;
	}

	.pagination-controls {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.tab-panel-card,
	.modal-security-note {
		padding: 12px;
		border: 1px solid var(--va-border);
		border-radius: 8px;
		background: var(--va-bg-raised);
	}

	.mini-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 8px 0;
		border-bottom: 1px dashed var(--va-border);
	}

	.mini-row:last-child {
		border-bottom: 0;
	}

	.mini-row span {
		color: var(--va-text-muted);
		font-size: 11.5px;
	}

	.mini-row strong {
		color: var(--va-text);
		font-size: 12px;
	}

	.settings-perm-row {
		align-items: center;
	}

	.session-admin-row span {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.session-admin-row small {
		display: block;
		color: var(--va-text-faint);
	}

	.perm-toggle-form {
		display: flex;
		align-items: center;
	}

	.sub-limit-form {
		display: grid;
		gap: 7px;
		padding: 10px 0;
		border-bottom: 1px dashed var(--va-border);
	}

	.sub-limit-form label {
		color: var(--va-text-muted);
		font-size: 11.5px;
	}

	.sub-limit-form div {
		display: flex;
		gap: 8px;
	}

	.sub-limit-form input {
		min-width: 0;
	}

	.sub-limit-form p {
		margin: 0;
		color: var(--va-text-faint);
		font-size: 11px;
	}

	.modal-create-form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.modal-field-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}

	.modal-security-note {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--va-text-muted);
		font-size: 12px;
	}

	.modal-form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.empty-wrap {
		padding: 28px;
	}

	.reseller-mobile-list {
		display: none;
	}

	.reseller-mobile-card {
		width: 100%;
		padding: 12px 14px;
		text-align: right;
		color: var(--va-text);
	}

	.mobile-card-main {
		min-width: 0;
		flex: 1;
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
		font: inherit;
		padding: 0;
		text-align: right;
	}

	.mobile-card-main .reseller-parent {
		margin-bottom: 3px;
	}

	.mobile-card-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
		margin-top: 12px;
		padding-top: 10px;
		border-top: 1px solid var(--va-border);
	}

	.mobile-detail-btn {
		color: var(--va-accent);
	}

	.reseller-mobile-card.is-selected {
		border-color: var(--va-border-strong);
		background: var(--va-bg-raised);
	}

	.mobile-card-head {
		display: flex;
		align-items: flex-start;
		gap: 10px;
	}

	.mobile-card-head :global(.va-status) {
		margin-inline-start: auto;
	}

	.mobile-metrics {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin: 12px 0 10px;
	}

	.mobile-metrics div {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.mobile-metrics span {
		color: var(--va-text-faint);
		font-size: 10.5px;
	}

	.mobile-metrics strong {
		color: var(--va-text);
		font: 500 12px var(--va-font-mono);
	}

	.mobile-details-stack {
		display: grid;
		gap: 14px;
	}

	.inspector-title-block {
		min-width: 0;
		flex: 1;
	}

	.inspector-status-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.va-switch {
		position: relative;
		width: 32px;
		height: 18px;
		border: 0;
		border-radius: 9px;
		background: var(--va-border);
		cursor: pointer;
		transition: background-color 0.18s ease;
	}

	.va-switch.is-on {
		background: var(--va-accent);
	}

	.va-switch span {
		position: absolute;
		top: 2px;
		inset-inline-end: 16px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--va-text);
		transition: inset-inline-end 0.18s ease;
	}

	.va-switch.is-on span {
		inset-inline-end: 2px;
	}

	.inspector-mini-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1px;
		overflow: hidden;
		border: 1px solid var(--va-border);
		border-radius: 6px;
		background: var(--va-border);
	}

	.inspector-mini-grid div {
		background: var(--va-bg-panel);
		padding: 10px 12px;
	}

	.inspector-mini-grid span {
		display: block;
		color: var(--va-text-faint);
		font: 500 10px var(--va-font-mono);
		text-transform: uppercase;
	}

	.inspector-mini-grid strong {
		display: block;
		margin-top: 4px;
		color: var(--va-text);
		font: 500 13.5px var(--va-font-mono);
	}

	.inspector-mini-grid .success {
		color: var(--va-success);
	}

	.va-field-action.success {
		background: var(--va-success);
	}

	.field-hint {
		margin-top: 6px;
		color: var(--va-text-faint);
		font: 500 11px var(--va-font-mono);
	}

	.inbound-access-box {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		border: 1px solid var(--va-border);
		border-radius: 8px;
		background: var(--va-bg-raised);
	}

	.inbound-access-box label {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--va-text);
		font-size: 12px;
		cursor: pointer;
	}

	.inbound-access-box input {
		accent-color: var(--va-accent);
	}

	.va-actions-list form {
		margin: 0;
	}

	.va-action-row :global(svg:last-child) {
		margin-inline-start: auto;
		color: var(--va-text-faint);
	}

	.delete-blocked {
		padding: 10px 12px;
		color: var(--va-text-faint);
		font-size: 12px;
	}

	.create-form {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 8px;
	}

	.full-width {
		width: 100%;
		justify-content: center;
	}

	.va-modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: grid;
		place-items: center;
		padding: 18px;
		background: rgb(2 4 8 / 68%);
		backdrop-filter: blur(8px);
	}

	.va-modal-card {
		width: min(100%, 440px);
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 20px;
		border: 1px solid var(--va-border-strong);
		border-radius: 14px;
		background: var(--va-bg-panel);
		color: var(--va-text);
		box-shadow: 0 24px 70px rgb(0 0 0 / 48%);
	}

	.va-modal-card h3 {
		margin: 4px 0 6px;
	}

	.va-modal-card p {
		margin: 0;
		color: var(--va-text-muted);
		font-size: 12.5px;
		line-height: 1.8;
	}

	.va-modal-icon {
		width: 38px;
		height: 38px;
		display: grid;
		place-items: center;
		border-radius: 9px;
		background: color-mix(in srgb, var(--va-danger) 14%, transparent);
		color: var(--va-danger);
	}

	.va-modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 4px;
	}

	@media (max-width: 760px) {
		.reseller-table {
			min-width: 820px;
		}

		.reseller-mobile-list {
			display: flex;
		}
	}

	/* ── Group badges ─────────────────────────────────────────────────────── */

	.group-badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 2px 7px;
		border: 1px solid color-mix(in srgb, var(--gc, #6366f1) 35%, var(--va-border));
		border-radius: 5px;
		background: color-mix(in srgb, var(--gc, #6366f1) 10%, transparent);
		color: var(--gc, #6366f1);
		font: 500 10px var(--va-font-fa);
		white-space: nowrap;
	}

	.group-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
		flex-shrink: 0;
	}

	/* ── Group assignment in settings tab ─────────────────────────────────── */

	.group-assign-mini {
		align-items: center;
	}

	.group-select {
		min-width: 120px;
		padding: 4px 8px;
		border: 1px solid var(--va-border);
		border-radius: 6px;
		background: var(--va-bg-raised);
		color: var(--va-text);
		font: 500 11.5px var(--va-font-fa);
		cursor: pointer;
	}
</style>
