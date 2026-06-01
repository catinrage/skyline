<script lang="ts">
	import { browser } from '$app/environment';
	import { getContext } from 'svelte';
	import InspectorPortal from '$lib/components/admin/InspectorPortal.svelte';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import { SvelteSet } from 'svelte/reactivity';
	import { scale } from 'svelte/transition';
	import { tippy } from '$lib/tippy';
	import { formatRelativeExpiry, formatToman, formatTraffic, shortenUuid } from '$lib/utils/format';
	import EmptyState from '$lib/components/admin/EmptyState.svelte';
	import Modal from '$lib/components/admin/Modal.svelte';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import VaAvatar from '$lib/components/admin/va/VaAvatar.svelte';
	import VaProgressBar from '$lib/components/admin/va/VaProgressBar.svelte';
	import VaStatRow from '$lib/components/admin/va/VaStatRow.svelte';
	import VaStatusDot from '$lib/components/admin/va/VaStatusDot.svelte';
	import {
		addQuotaCommand as defaultAddQuotaCommand,
		rechargeConfigCommand as defaultRechargeConfigCommand,
		revokeConfigCommand as defaultRevokeConfigCommand,
		toggleConfigEnabledCommand as defaultToggleConfigEnabledCommand
	} from '../../../../../routes/reseller/page.remote';

	type RequestStatus = 'active' | 'disabled' | 'depleted' | 'expired' | 'revoked' | 'missing';
	type RequestStatusFilter =
		| 'all'
		| 'active'
		| 'used'
		| 'expiring'
		| 'expired'
		| 'revoked'
		| 'missing'
		| 'disabled'
		| 'bookmarked';

	type RequestItem = {
		id: number;
		customerLabel: string;
		internalNote: string;
		status: RequestStatus;
		xuiClientUuid: string;
		xuiEmail: string;
		quotaGbSnapshot: number;
		durationDaysSnapshot: number;
		priceTomanSnapshot: number;
		chargeAmountToman: number;
		outstandingAmountToman: number;
		createdAt: number;
		lastRechargeAt: number | null;
		rechargeCount: number;
		revokedAt: number | null;
		configUrl: string | null;
		canRecharge: boolean;
		rechargeBlockedReason: string | null;
		rechargePlan: { quotaGb: number; durationDays: number; priceToman: number } | null;
		usage:
			| {
					usedBytes: number;
					remainingBytes: number | null;
					totalBytes: number | null;
					usageRatio: number | null;
					expiresAt: string | null;
					activationExpiryDays: number | null;
			  }
			| null;
	};

	type ChargeItem = {
		id: number;
		requestId: number;
		type: 'create' | 'recharge';
		amountToman: number;
		reversedAmountToman: number;
		createdAt: number;
	};

	type Props = {
		data: {
			reseller: { username: string };
			requests: RequestItem[];
			charges?: ChargeItem[];
			salesEnabled: boolean;
		};
		resellerState?: any;
		stateTarget?: any;
		commands?: {
			toggle: any;
			recharge: any;
			addQuota: any;
			revoke: any;
		};
		ownerKey?: string;
	};

	let {
		data,
		resellerState,
		stateTarget = resellerState,
		commands = {
			toggle: defaultToggleConfigEnabledCommand,
			recharge: defaultRechargeConfigCommand,
			addQuota: defaultAddQuotaCommand,
			revoke: defaultRevokeConfigCommand
		},
		ownerKey = data.reseller.username
	}: Props = $props();

	const shellSearch = getContext<{ value: string }>('adminShellSearch') ?? { value: '' };
	let search = $state('');
	let statusFilter = $state<RequestStatusFilter>('all');
	let currentPage = $state(1);
	let selectedId = $state<number | null>(data.requests[0]?.id ?? null);
	const pageSize = 8;

	let bookmarks = new SvelteSet<number>();
	const storageKey = $derived(`skyline:reseller-bookmarks:${ownerKey}`);
	let loadedKey = $state<string | null>(null);

	let rechargeOpen = $state<number | null>(null);
	let revokeOpen = $state<number | null>(null);
	let addQuotaOpen = $state<number | null>(null);
	let addQuotaGb = $state(1);
	let openMenuId = $state<number | null>(null);
	let contextMenuStyle = $state('');
	let filterSelectOpen = $state(false);
	let mobileDetailsOpen = $state(false);
	let inspectorTab = $state<'info' | 'usage' | 'history'>('info');

	const statusCopy: Record<RequestStatus, { label: string; chip: string }> = {
		active: { label: 'فعال', chip: 'admin-chip-success' },
		disabled: { label: 'غیرفعال', chip: 'admin-chip-warning' },
		depleted: { label: 'حجم تمام شده', chip: 'admin-chip-danger' },
		expired: { label: 'منقضی', chip: 'admin-chip-danger' },
		revoked: { label: 'لغو شده', chip: 'admin-chip' },
		missing: { label: 'پیدا نشد', chip: 'admin-chip-danger' }
	};

	const statusFilters: Array<{ id: RequestStatusFilter; label: string }> = [
		{ id: 'all', label: 'همه' },
		{ id: 'active', label: 'فعال' },
		{ id: 'used', label: 'مصرف‌شده' },
		{ id: 'expiring', label: 'رو به پایان' },
		{ id: 'expired', label: 'منقضی' },
		{ id: 'revoked', label: 'لغوشده' },
		{ id: 'disabled', label: 'غیرفعال' },
		{ id: 'missing', label: 'مشکل‌دار' },
		{ id: 'bookmarked', label: 'نشان‌شده' }
	];

	function matchesStatus(request: RequestItem, filter: RequestStatusFilter) {
		if (filter === 'all') return true;
		if (filter === 'bookmarked') return bookmarks.has(request.id);
		if (filter === 'used') {
			return (
				request.status === 'depleted' ||
				(request.usage?.totalBytes !== null &&
					request.usage?.totalBytes !== undefined &&
					request.usage?.remainingBytes === 0)
			);
		}
		if (filter === 'expiring') {
			if (!request.usage?.expiresAt || request.status === 'revoked' || request.status === 'missing') return false;
			const expiresAt = new Date(request.usage.expiresAt).getTime();
			const sevenDays = Date.now() + 7 * 24 * 60 * 60 * 1000;
			return expiresAt > Date.now() && expiresAt <= sevenDays;
		}
		return request.status === filter;
	}

	const filtered = $derived.by(() => {
		const q = (search || shellSearch.value).trim().toLowerCase();
		return data.requests.filter((request) => {
			if (!matchesStatus(request, statusFilter)) return false;
			if (!q) return true;
			return [
				request.customerLabel,
				request.xuiEmail,
				request.xuiClientUuid,
				`${request.quotaGbSnapshot}gb`,
				`${request.durationDaysSnapshot}d`,
				String(request.priceTomanSnapshot)
			]
				.join(' ')
				.toLowerCase()
				.includes(q);
		});
	});

	const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
	const paginated = $derived(filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize));
	const selectedRequest = $derived(
		(selectedId !== null ? data.requests.find((request) => request.id === selectedId) : null) ??
			paginated[0] ??
			null
	);
	const selectedCharges = $derived(
		selectedRequest ? (data.charges ?? []).filter((charge) => charge.requestId === selectedRequest.id) : []
	);
	const menuRequest = $derived(
		openMenuId !== null ? data.requests.find((request) => request.id === openMenuId) ?? null : null
	);
	const selectedStatusFilter = $derived(
		statusFilters.find((filter) => filter.id === statusFilter) ?? statusFilters[0]
	);
	const selectedTitle = $derived(selectedRequest?.customerLabel || selectedRequest?.xuiEmail || 'جزئیات کانفیگ');
	const stats = $derived([
		{
			label: 'فعال',
			value: data.requests.filter((request) => request.status === 'active').length.toLocaleString('fa-IR-u-nu-latn'),
			delta: `از ${data.requests.length.toLocaleString('fa-IR-u-nu-latn')} کانفیگ صادر شده`,
			deltaTone: 'muted' as const
		},
		{
			label: 'مصرف شده',
			value: formatTraffic(
				data.requests.reduce((total, request) => total + (request.usage?.usedBytes ?? 0), 0)
			),
			delta: 'مجموع زنده از x-ui',
			deltaTone: 'muted' as const
		},
		{
			label: 'انقضای ۷ روز',
			value: data.requests.filter((request) => matchesStatus(request, 'expiring')).length.toLocaleString(
				'fa-IR-u-nu-latn'
			),
			delta: 'نیازمند پیگیری',
			deltaTone: 'warning' as const
		},
		{
			label: 'گیگ فروخته‌شده',
			value: data.requests.reduce((total, request) => total + request.quotaGbSnapshot, 0).toLocaleString('fa-IR-u-nu-latn'),
			unit: 'GB',
			delta: `${data.requests.length.toLocaleString('fa-IR-u-nu-latn')} کانفیگ`,
			deltaTone: 'muted' as const
		}
	]);

	function filterCount(filter: RequestStatusFilter) {
		return data.requests.filter((r) => matchesStatus(r, filter)).length;
	}

	function formatDate(timestamp: number) {
		return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(
			new Date(timestamp * 1000)
		);
	}

	function chargeTypeLabel(type: ChargeItem['type']) {
		return type === 'recharge' ? 'شارژ مجدد' : 'ساخت کانفیگ';
	}

	function expiryText(request: RequestItem) {
		if (!request.usage) return 'نامشخص';
		if (request.usage.expiresAt) return formatRelativeExpiry(request.usage.expiresAt);
		if (request.usage.activationExpiryDays) return `${request.usage.activationExpiryDays} روز پس از اولین استفاده`;
		return 'بدون انقضا';
	}

	function usagePercent(request: RequestItem) {
		if (!request.usage || request.usage.usageRatio === null) return 0;
		return Math.round(request.usage.usageRatio * 100);
	}

	function statusTone(status: RequestStatus): 'success' | 'warning' | 'danger' | 'muted' {
		if (status === 'active') return 'success';
		if (status === 'disabled' || status === 'revoked') return 'muted';
		if (status === 'depleted') return 'warning';
		return 'danger';
	}

	function usageTone(request: RequestItem): 'accent' | 'warning' | 'danger' | null {
		const percent = usagePercent(request);
		if (request.status === 'expired' || request.status === 'depleted' || percent >= 92) return 'danger';
		if (percent >= 75) return 'warning';
		return null;
	}

	function isBookmarked(id: number) {
		return bookmarks.has(id);
	}

	function toggleBookmark(id: number) {
		if (bookmarks.has(id)) {
			bookmarks.delete(id);
		} else {
			bookmarks.add(id);
		}
	}

	function setStatusFilter(filter: RequestStatusFilter) {
		statusFilter = filter;
		filterSelectOpen = false;
	}

	function openMobileDetails(request: RequestItem) {
		selectedId = request.id;
		inspectorTab = 'info';
		mobileDetailsOpen = true;
		closeContextMenu();
	}

	function toggleContextMenu(event: MouseEvent, id: number) {
		event.stopPropagation();
		if (openMenuId === id) {
			closeContextMenu();
			return;
		}
		const trigger = event.currentTarget as HTMLElement;
		const rect = trigger.getBoundingClientRect();
		const menuWidth = 220;
		const menuHeight = 306;
		const margin = 8;
		const gap = 6;

		// Vertical: open below; flip above if not enough room
		let top = rect.bottom + gap;
		if (top + menuHeight > window.innerHeight - margin) {
			top = Math.max(margin, rect.top - menuHeight - gap);
		}

		// Horizontal: anchor right-edge to button right-edge, but never
		// extend further left than the button's own left edge (prevents
		// the menu from bleeding into the inspector panel in split layouts).
		const panel = trigger.closest('.va-page-main') ?? trigger.closest('.admin-content');
		const panelLeft = panel ? panel.getBoundingClientRect().left : 0;
		const minLeft = Math.max(margin, panelLeft);
		let left = rect.right - menuWidth;
		left = Math.max(minLeft, left);
		left = Math.min(left, window.innerWidth - menuWidth - margin);

		contextMenuStyle = `top: ${Math.round(top)}px; left: ${Math.round(left)}px;`;
		openMenuId = id;
	}

	async function copyConfig(url: string) {
		try {
			await navigator.clipboard.writeText(url);
			toast.success('لینک کانفیگ کپی شد.');
		} catch {
			toast.error('کپی لینک انجام نشد.');
		}
	}

	async function copyUserPage(uuid: string) {
		try {
			const url = new URL(
				resolve(`/user/${uuid}?ri=${encodeURIComponent(ownerKey)}`),
				window.location.origin
			).toString();
			await navigator.clipboard.writeText(url);
			toast.success('لینک صفحه کاربر کپی شد.');
		} catch {
			toast.error('کپی انجام نشد.');
		}
	}

	async function handleToggle(request: RequestItem) {
		try {
			const result = (await commands.toggle({
				id: request.id,
				enabled: request.status === 'disabled'
			}).updates(stateTarget)) as Record<string, unknown> | null;
			if (result?.toggleConfigSuccess) toast.success(result.toggleConfigSuccess as string);
			if (result?.toggleConfigError) toast.error(result.toggleConfigError as string);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'تغییر وضعیت انجام نشد.');
		}
	}

	async function handleRecharge() {
		if (rechargeOpen === null) return;
		try {
			const result = (await commands.recharge({ id: rechargeOpen }).updates(stateTarget)) as
				| Record<string, unknown>
				| null;
			if (result?.rechargeSuccess) {
				toast.success(result.rechargeSuccess as string);
				rechargeOpen = null;
			}
			if (result?.rechargeError) toast.error(result.rechargeError as string);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'شارژ مجدد انجام نشد.');
		}
	}

	async function handleAddQuota() {
		if (addQuotaOpen === null) return;
		try {
			const result = (await commands.addQuota({ id: addQuotaOpen, addGb: addQuotaGb }).updates(stateTarget)) as
				| Record<string, unknown>
				| null;
			if (result?.addQuotaSuccess) {
				toast.success(result.addQuotaSuccess as string);
				addQuotaOpen = null;
			}
			if (result?.addQuotaError) toast.error(result.addQuotaError as string);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'افزایش حجم انجام نشد.');
		}
	}

	async function handleRevoke() {
		if (revokeOpen === null) return;
		try {
			const result = (await commands.revoke({ id: revokeOpen }).updates(stateTarget)) as
				| Record<string, unknown>
				| null;
			if (result?.revokeSuccess) {
				toast.success(result.revokeSuccess as string);
				revokeOpen = null;
			}
			if (result?.revokeError) toast.error(result.revokeError as string);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'لغو کانفیگ انجام نشد.');
		}
	}

	function closeContextMenu() {
		openMenuId = null;
		contextMenuStyle = '';
	}

	$effect(() => {
		if (search !== undefined || statusFilter !== undefined) currentPage = 1;
	});

	$effect(() => {
		if (currentPage > totalPages) currentPage = totalPages;
	});

	$effect(() => {
		if (!browser) return;
		function closeOnOutside() {
			openMenuId = null;
			filterSelectOpen = false;
		}
		window.addEventListener('click', closeOnOutside);
		window.addEventListener('scroll', closeOnOutside, true);
		return () => {
			window.removeEventListener('click', closeOnOutside);
			window.removeEventListener('scroll', closeOnOutside, true);
		};
	});

	$effect(() => {
		if (!browser || loadedKey === storageKey) return;
		try {
			const stored = localStorage.getItem(storageKey);
			bookmarks.clear();
			const ids = stored
				? (JSON.parse(stored) as unknown[]).filter((id): id is number => Number.isInteger(id))
				: [];
			for (const id of ids) bookmarks.add(id);
		} catch {
			bookmarks.clear();
		}
		loadedKey = storageKey;
	});

	$effect(() => {
		if (!browser || loadedKey !== storageKey) return;
		localStorage.setItem(storageKey, JSON.stringify([...bookmarks]));
	});

	const rechargeRequest = $derived(
		rechargeOpen !== null ? data.requests.find((r) => r.id === rechargeOpen) ?? null : null
	);
	const revokeRequest = $derived(
		revokeOpen !== null ? data.requests.find((r) => r.id === revokeOpen) ?? null : null
	);
	const addQuotaRequest = $derived(
		addQuotaOpen !== null ? data.requests.find((r) => r.id === addQuotaOpen) ?? null : null
	);
</script>

<InspectorPortal content={configsInspector} />
<div class="configs-va">
		<VaStatRow items={stats} />

		<div class="va-toolbar">
			<label class="va-toolbar-search" aria-label="جستجوی کانفیگ‌ها">
				<AnimatedIcon name="search" size={13} />
				<input type="search" bind:value={search} placeholder="نام مشتری، UUID یا ایمیل..." />
			</label>
			<div class="mobile-filter-select">
				<button
					type="button"
					class="mobile-filter-trigger"
					aria-haspopup="listbox"
					aria-expanded={filterSelectOpen}
					onclick={(event) => {
						event.stopPropagation();
						filterSelectOpen = !filterSelectOpen;
					}}
				>
					<span class="mdi mdi-filter-variant"></span>
					<span>{selectedStatusFilter.label}</span>
					<strong>{filterCount(selectedStatusFilter.id).toLocaleString('fa-IR-u-nu-latn')}</strong>
					<span class="mdi mdi-chevron-down"></span>
				</button>
				{#if filterSelectOpen}
					<div
						class="mobile-filter-menu"
						role="listbox"
						tabindex="-1"
						transition:scale={{ duration: 120, start: 0.96, opacity: 0.8 }}
						onclick={(event) => event.stopPropagation()}
						onkeydown={(event) => event.stopPropagation()}
					>
						{#each statusFilters as item (item.id)}
							<button
								type="button"
								role="option"
								aria-selected={statusFilter === item.id}
								class:is-active={statusFilter === item.id}
								onclick={() => setStatusFilter(item.id)}
							>
								<span>{item.label}</span>
								<strong>{filterCount(item.id).toLocaleString('fa-IR-u-nu-latn')}</strong>
							</button>
						{/each}
					</div>
				{/if}
			</div>
			<span class="va-divider-vertical desktop-filter-chips" aria-hidden="true"></span>
			<div class="desktop-filter-chips filter-chip-row">
				{#each statusFilters as item (item.id)}
					<button
						type="button"
						class="va-chip"
						class:is-active={statusFilter === item.id}
						onclick={() => setStatusFilter(item.id)}
					>
						{item.label}
						<span class="va-chip-count">{filterCount(item.id).toLocaleString('fa-IR-u-nu-latn')}</span>
					</button>
				{/each}
			</div>
		</div>

		{#if paginated.length === 0}
			<div class="va-card empty-wrap">
				<EmptyState
					title="کانفیگی با این فیلتر پیدا نشد"
					description="فیلتر را تغییر دهید یا یک کانفیگ جدید بسازید."
					icon="search"
				/>
			</div>
		{:else}
			<div class="va-table-wrap desktop-only">
				<table class="va-table configs-table">
					<thead>
						<tr>
							<th></th>
							<th>مشتری</th>
							<th>وضعیت / پلن</th>
							<th class="align-left">مصرف</th>
							<th class="align-left">انقضا</th>
							<th class="align-left">حجم</th>
							<th class="align-left"></th>
						</tr>
					</thead>
					<tbody>
						{#each paginated as request (request.id)}
							<tr
								class:is-selected={selectedRequest?.id === request.id}
								onclick={() => (selectedId = request.id)}
							>
								<td class="bookmark-cell">
									<button
										type="button"
										class="va-icon-btn bookmark-btn"
										class:is-active={isBookmarked(request.id)}
										aria-label={isBookmarked(request.id) ? 'حذف نشان' : 'نشان کردن'}
										onclick={(event) => {
											event.stopPropagation();
											toggleBookmark(request.id);
										}}
									>
										<span class="mdi {isBookmarked(request.id) ? 'mdi-bookmark' : 'mdi-bookmark-outline'}"></span>
									</button>
								</td>
								<td>
									<div class="customer-cell">
										<VaAvatar name={request.customerLabel || request.xuiEmail} />
										<div>
											<div class="cell-name">{request.customerLabel}</div>
											<div class="cell-meta">{request.xuiEmail}</div>
											<div class="cell-meta" dir="ltr">{shortenUuid(request.xuiClientUuid)}</div>
										</div>
									</div>
								</td>
								<td>
									<VaStatusDot
										tone={statusTone(request.status)}
										label={statusCopy[request.status].label}
									/>
									<div class="cell-meta">{request.quotaGbSnapshot}G · {request.durationDaysSnapshot} روز</div>
								</td>
								<td class="align-left usage-table-cell">
									<div class="usage-line va-mono">
										<span>{request.usage ? formatTraffic(request.usage.usedBytes) : '—'}</span>
										<span class="muted">{request.usage ? `${formatTraffic(request.usage.remainingBytes ?? 0)} مانده` : '—'}</span>
									</div>
									<VaProgressBar
										value={request.usage?.usedBytes ?? 0}
										max={request.usage?.totalBytes ?? request.quotaGbSnapshot * 1024 ** 3}
										tone={usageTone(request)}
									/>
								</td>
								<td class="align-left">
									<div class="cell-name">{expiryText(request)}</div>
									<div class="cell-meta">ثبت: {formatDate(request.createdAt)}</div>
								</td>
								<td class="align-left">
									<div class="va-mono">{request.quotaGbSnapshot.toLocaleString('fa-IR-u-nu-latn')} GB</div>
									<div class="cell-meta">{request.rechargeCount > 0 ? `${request.rechargeCount}× شارژ` : '—'}</div>
								</td>
								<td class="align-left">
									<div class="table-actions">
										{#if request.configUrl}
											<button
												type="button"
												class="va-icon-btn"
												use:tippy={{ content: 'کپی VLESS' }}
												aria-label="کپی لینک کانفیگ"
												onclick={(event) => {
													event.stopPropagation();
													closeContextMenu();
													if (request.configUrl) void copyConfig(request.configUrl);
												}}
											>
												<span class="mdi mdi-content-copy"></span>
											</button>
										{/if}
										<button
											type="button"
											class="va-icon-btn"
											use:tippy={{ content: 'کپی صفحه کاربر' }}
											aria-label="کپی صفحه کاربر"
											onclick={(event) => {
												event.stopPropagation();
												closeContextMenu();
												copyUserPage(request.xuiClientUuid);
											}}
										>
											<span class="mdi mdi-cloud-outline"></span>
										</button>
										<button
											type="button"
											class="va-icon-btn"
											class:is-active={openMenuId === request.id}
											use:tippy={{ content: 'عملیات بیشتر' }}
											aria-label="عملیات بیشتر"
											aria-expanded={openMenuId === request.id}
											onclick={(event) => toggleContextMenu(event, request.id)}
										>
											<AnimatedIcon name="menu" size={13} />
										</button>
										{#if false && openMenuId === request.id}
											<div
												class="va-context-menu"
												style={contextMenuStyle}
												role="menu"
												tabindex="-1"
												transition:scale={{ duration: 120, start: 0.96, opacity: 0.75 }}
												onclick={(event) => event.stopPropagation()}
												onkeydown={(event) => event.stopPropagation()}
											>
												<button
													type="button"
													onclick={() => {
														toggleBookmark(request.id);
														closeContextMenu();
													}}
												>
													<span class="mdi {isBookmarked(request.id) ? 'mdi-bookmark-off-outline' : 'mdi-bookmark-outline'}"></span>
													<span>{isBookmarked(request.id) ? 'حذف نشان' : 'نشان کردن'}</span>
												</button>
												<button
													type="button"
													disabled={!request.canRecharge || !data.salesEnabled}
													onclick={() => {
														rechargeOpen = request.id;
														closeContextMenu();
													}}
												>
													<span class="mdi mdi-refresh"></span>
													<span>شارژ مجدد</span>
												</button>
												<button
													type="button"
													disabled={request.revokedAt !== null || request.status === 'missing'}
													onclick={() => {
														void handleToggle(request);
														closeContextMenu();
													}}
												>
													<span class="mdi mdi-power"></span>
													<span>{request.status === 'disabled' ? 'فعال‌سازی' : 'غیرفعال‌سازی'}</span>
												</button>
												<a
													href={resolve(`/user/${request.xuiClientUuid}?ri=${encodeURIComponent(ownerKey)}`)}
													target="_blank"
													rel="noreferrer"
													onclick={closeContextMenu}
												>
													<span class="mdi mdi-open-in-new"></span>
													<span>باز کردن صفحه کاربر</span>
												</a>
												{#if request.revokedAt === null}
													<button
														type="button"
														class="danger"
														onclick={() => {
															revokeOpen = request.id;
															closeContextMenu();
														}}
													>
														<span class="mdi mdi-trash-can-outline"></span>
														<span>لغو کانفیگ</span>
													</button>
												{/if}
											</div>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="va-mobile-list configs-mobile-list">
				{#each paginated as request (request.id)}
					<article
						class="va-card config-mobile-card"
						class:is-selected={selectedRequest?.id === request.id}
					>
						<div class="mobile-card-head">
							<VaAvatar name={request.customerLabel || request.xuiEmail} size={32} />
							<button
								type="button"
								class="mobile-card-main"
								onclick={() => (selectedId = request.id)}
							>
								<div class="cell-name">{request.customerLabel}</div>
								<div class="cell-meta">{request.xuiEmail} · {request.quotaGbSnapshot}G/{request.durationDaysSnapshot}d</div>
							</button>
							<VaStatusDot tone={statusTone(request.status)} label={statusCopy[request.status].label} />
						</div>
						<div class="mobile-usage-row va-mono">
							<span>{request.usage ? formatTraffic(request.usage.usedBytes) : '—'}</span>
							<span>{expiryText(request)}</span>
						</div>
						<VaProgressBar
							value={request.usage?.usedBytes ?? 0}
							max={request.usage?.totalBytes ?? request.quotaGbSnapshot * 1024 ** 3}
							tone={usageTone(request)}
						/>
						<div class="mobile-card-actions">
							<button
								type="button"
								class="va-icon-btn mobile-detail-btn"
								aria-label="نمایش جزئیات"
								onclick={() => openMobileDetails(request)}
							>
								<span class="mdi mdi-eye-outline"></span>
							</button>
							<button
								type="button"
								class="va-icon-btn"
								aria-label={isBookmarked(request.id) ? 'حذف نشان' : 'نشان کردن'}
								onclick={() => toggleBookmark(request.id)}
							>
								<span class="mdi {isBookmarked(request.id) ? 'mdi-bookmark' : 'mdi-bookmark-outline'}"></span>
							</button>
							<button
								type="button"
								class="va-icon-btn"
								class:is-active={openMenuId === request.id}
								aria-label="عملیات بیشتر"
								aria-expanded={openMenuId === request.id}
								onclick={(event) => toggleContextMenu(event, request.id)}
							>
								<AnimatedIcon name="menu" size={13} />
							</button>
						</div>
					</article>
				{/each}
			</div>

			<div class="va-pagination">
				<div>{paginated.length.toLocaleString('fa-IR-u-nu-latn')} ردیف از {filtered.length.toLocaleString('fa-IR-u-nu-latn')}</div>
				<div class="pagination-controls">
					<button
						type="button"
						class="va-icon-btn"
						disabled={currentPage <= 1}
						onclick={() => (currentPage = Math.max(1, currentPage - 1))}
						aria-label="صفحه قبل"
					>
						<span class="pagination-prev-icon">
							<AnimatedIcon name="chevron-left" size={13} />
						</span>
					</button>
					<span>{currentPage} / {totalPages}</span>
					<button
						type="button"
						class="va-icon-btn"
						disabled={currentPage >= totalPages}
						onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
						aria-label="صفحه بعد"
					>
						<AnimatedIcon name="chevron-left" size={13} />
					</button>
				</div>
			</div>
		{/if}
</div>

{#snippet configsInspector()}
<aside class="va-inspector">
		{#if selectedRequest}
			<div class="va-inspector-head">
				<VaAvatar name={selectedRequest.customerLabel || selectedRequest.xuiEmail} size={28} />
				<div class="inspector-title-block">
					<p class="va-inspector-title">{selectedRequest.customerLabel}</p>
					<p class="va-inspector-sub">{selectedRequest.xuiEmail}</p>
				</div>
			</div>

			<div class="va-inspector-tabs">
				<button type="button" class="va-inspector-tab" class:is-active={inspectorTab === 'info'} onclick={() => (inspectorTab = 'info')}>اطلاعات</button>
				<button type="button" class="va-inspector-tab" class:is-active={inspectorTab === 'usage'} onclick={() => (inspectorTab = 'usage')}>مصرف</button>
				<button type="button" class="va-inspector-tab" class:is-active={inspectorTab === 'history'} onclick={() => (inspectorTab = 'history')}>تاریخچه</button>
			</div>

			<div class="va-inspector-body">
				<div class="inspector-status-row">
					<div>
						<div class="va-section-label">وضعیت</div>
						<VaStatusDot
							tone={statusTone(selectedRequest.status)}
							label={statusCopy[selectedRequest.status].label}
						/>
					</div>
					{#if selectedRequest.revokedAt === null && selectedRequest.status !== 'missing'}
						<button
							type="button"
							class="va-switch"
							class:is-on={selectedRequest.status !== 'disabled'}
							aria-label={selectedRequest.status === 'disabled' ? 'فعال‌سازی' : 'غیرفعال‌سازی'}
							onclick={() => handleToggle(selectedRequest)}
						>
							<span></span>
						</button>
					{/if}
				</div>

				{#if inspectorTab === 'usage'}
					<div>
						<div class="va-section-label">مصرف</div>
						<div class="usage-inspector-head">
							<div class="usage-big va-mono">{selectedRequest.usage ? formatTraffic(selectedRequest.usage.usedBytes) : '—'}</div>
							<div class="cell-meta">از {selectedRequest.quotaGbSnapshot} GB</div>
						</div>
						<VaProgressBar
							value={selectedRequest.usage?.usedBytes ?? 0}
							max={selectedRequest.usage?.totalBytes ?? selectedRequest.quotaGbSnapshot * 1024 ** 3}
							tone={usageTone(selectedRequest)}
						/>
						<div class="field-hint">
							{usagePercent(selectedRequest).toLocaleString('fa-IR-u-nu-latn')}٪ مصرف شده ·
							{selectedRequest.usage ? formatTraffic(selectedRequest.usage.remainingBytes ?? 0) : '—'} باقی‌مانده
						</div>
					</div>
				{:else if inspectorTab === 'history'}
					<div>
						<div class="va-section-label">تاریخچه مصرف اعتبار این کانفیگ</div>
						<div class="charge-history-list">
							{#if selectedCharges.length === 0}
								<div class="field-hint">رویدادی برای این کانفیگ ثبت نشده است.</div>
							{:else}
								{#each selectedCharges as charge (charge.id)}
									<div class="charge-history-row">
										<span class="mdi {charge.type === 'recharge' ? 'mdi-refresh' : 'mdi-plus-circle-outline'}"></span>
										<div>
											<strong>{chargeTypeLabel(charge.type)}</strong>
											<small>{formatDate(charge.createdAt)}</small>
										</div>
										<div class="va-mono">{formatToman(charge.amountToman - charge.reversedAmountToman)}</div>
									</div>
								{/each}
							{/if}
						</div>
					</div>
				{/if}

				{#if inspectorTab === 'info'}
				<div>
					<div class="va-section-label">شناسه‌ها</div>
					<div class="identifier-list">
						<div class="identifier-row">
							<span>UUID</span>
							<strong dir="ltr">{selectedRequest.xuiClientUuid}</strong>
							<button
								type="button"
								class="va-icon-btn"
								onclick={() => copyUserPage(selectedRequest.xuiClientUuid)}
								aria-label="کپی UUID"
							>
								<span class="mdi mdi-content-copy"></span>
							</button>
						</div>
						<div class="identifier-row">
							<span>Email</span>
							<strong dir="ltr">{selectedRequest.xuiEmail}</strong>
						</div>
						<div class="identifier-row">
							<span>Plan</span>
							<strong>{selectedRequest.quotaGbSnapshot}G · {selectedRequest.durationDaysSnapshot} روز</strong>
						</div>
						<div class="identifier-row">
							<span>قیمت فروش</span>
							<strong>{formatToman(selectedRequest.priceTomanSnapshot)} تومان</strong>
						</div>
					</div>
				</div>

				{#if selectedRequest.internalNote}
					<div>
						<div class="va-section-label">یادداشت داخلی</div>
						<div class="internal-note-box">{selectedRequest.internalNote}</div>
					</div>
				{/if}

				<div>
					<div class="va-section-label">شارژ مجدد</div>
					<div class="plan-current">
						<span>پلن فعلی</span>
						<strong>
							{#if selectedRequest.rechargePlan}
								{selectedRequest.rechargePlan.quotaGb}G · {selectedRequest.rechargePlan.durationDays} روز
							{:else}
								{selectedRequest.rechargeBlockedReason ?? 'قابل شارژ نیست'}
							{/if}
						</strong>
					</div>
					<button
						type="button"
						class="admin-btn admin-btn-primary full-width"
						disabled={!data.salesEnabled || !selectedRequest.canRecharge}
						onclick={() => (rechargeOpen = selectedRequest.id)}
					>
						<AnimatedIcon name="cloud" size={13} />
						<span>شارژ مجدد{selectedRequest.rechargePlan ? ` · ${selectedRequest.rechargePlan.quotaGb} GB` : ''}</span>
					</button>
					<div class="field-hint">مصرف صفر می‌شود و اعتبار از امروز تمدید می‌شود.</div>
				</div>

				<div>
					<div class="va-section-label">افزایش حجم</div>
					<div class="add-quota-row">
						<div class="va-field-shell add-quota-field">
							<input
								type="number"
								class="add-quota-input"
								min="0.01"
								step="0.5"
								bind:value={addQuotaGb}
								dir="ltr"
							/>
							<span class="va-field-suffix">GB</span>
						</div>
						<button
							type="button"
							class="admin-btn admin-btn-primary"
							disabled={!data.salesEnabled || selectedRequest.revokedAt !== null || selectedRequest.status === 'missing' || addQuotaGb <= 0}
							onclick={() => (addQuotaOpen = selectedRequest.id)}
						>
							<span class="mdi mdi-plus"></span>
							<span>اضافه کن</span>
						</button>
					</div>
					<div class="field-hint">بدون صفر شدن مصرف، حجم به کانفیگ اضافه می‌شود.</div>
				</div>

				<div>
					<div class="va-section-label">اقدامات سریع</div>
					<div class="va-actions-list">
						{#if selectedRequest.configUrl}
							<button
								type="button"
								class="va-action-row"
								onclick={() => selectedRequest.configUrl && copyConfig(selectedRequest.configUrl)}
							>
								<span class="mdi mdi-content-copy"></span>
								<span>کپی VLESS</span>
							</button>
						{/if}
						<button type="button" class="va-action-row" onclick={() => copyUserPage(selectedRequest.xuiClientUuid)}>
							<span class="mdi mdi-cloud-outline"></span>
							<span>کپی صفحه کاربر</span>
						</button>
						<a
							href={resolve(`/user/${selectedRequest.xuiClientUuid}?ri=${encodeURIComponent(ownerKey)}`)}
							target="_blank"
							rel="noreferrer"
							class="va-action-row"
						>
							<span class="mdi mdi-open-in-new"></span>
							<span>باز کردن صفحه کاربر</span>
						</a>
						{#if selectedRequest.revokedAt === null}
							<button
								type="button"
								class="va-action-row danger"
								onclick={() => (revokeOpen = selectedRequest.id)}
							>
								<span class="mdi mdi-trash-can-outline"></span>
								<span>لغو کانفیگ از x-ui</span>
							</button>
						{/if}
					</div>
				</div>
				{/if}
			</div>
		{/if}
</aside>
{/snippet}

{#if menuRequest}
	<div
		class="va-context-menu"
		style={contextMenuStyle}
		role="menu"
		tabindex="-1"
		transition:scale={{ duration: 120, start: 0.96, opacity: 0.75 }}
		onclick={(event) => event.stopPropagation()}
		onkeydown={(event) => event.stopPropagation()}
	>
		<button
			type="button"
			onclick={() => {
				toggleBookmark(menuRequest.id);
				closeContextMenu();
			}}
		>
			<span class="mdi {isBookmarked(menuRequest.id) ? 'mdi-bookmark-off-outline' : 'mdi-bookmark-outline'}"></span>
			<span>{isBookmarked(menuRequest.id) ? 'حذف نشان' : 'نشان کردن'}</span>
		</button>
		<button
			type="button"
			disabled={!menuRequest.canRecharge || !data.salesEnabled}
			onclick={() => {
				rechargeOpen = menuRequest.id;
				closeContextMenu();
			}}
		>
			<span class="mdi mdi-refresh"></span>
			<span>شارژ مجدد</span>
		</button>
		<button
			type="button"
			disabled={menuRequest.revokedAt !== null || menuRequest.status === 'missing'}
			onclick={() => {
				void handleToggle(menuRequest);
				closeContextMenu();
			}}
		>
			<span class="mdi mdi-power"></span>
			<span>{menuRequest.status === 'disabled' ? 'فعال‌سازی' : 'غیرفعال‌سازی'}</span>
		</button>
		<a
			href={resolve(`/user/${menuRequest.xuiClientUuid}?ri=${encodeURIComponent(ownerKey)}`)}
			target="_blank"
			rel="noreferrer"
			onclick={closeContextMenu}
		>
			<span class="mdi mdi-open-in-new"></span>
			<span>باز کردن صفحه کاربر</span>
		</a>
		{#if menuRequest.revokedAt === null}
			<button
				type="button"
				class="danger"
				onclick={() => {
					revokeOpen = menuRequest.id;
					closeContextMenu();
				}}
			>
				<span class="mdi mdi-trash-can-outline"></span>
				<span>لغو کانفیگ</span>
			</button>
		{/if}
	</div>
{/if}

<Modal open={mobileDetailsOpen && selectedRequest !== null} title={selectedTitle} eyebrow="جزئیات کانفیگ" onClose={() => (mobileDetailsOpen = false)}>
	{#if selectedRequest}
		<div class="mobile-details-stack">
			<div class="inspector-status-row">
				<div>
					<div class="va-section-label">وضعیت</div>
					<VaStatusDot tone={statusTone(selectedRequest.status)} label={statusCopy[selectedRequest.status].label} />
				</div>
				{#if selectedRequest.revokedAt === null && selectedRequest.status !== 'missing'}
					<button
						type="button"
						class="va-switch"
						class:is-on={selectedRequest.status !== 'disabled'}
						aria-label={selectedRequest.status === 'disabled' ? 'فعال‌سازی' : 'غیرفعال‌سازی'}
						onclick={() => handleToggle(selectedRequest)}
					>
						<span></span>
					</button>
				{/if}
			</div>
			<div>
				<div class="va-section-label">شناسه‌ها</div>
				<div class="identifier-list">
					<div class="identifier-row">
						<span>UUID</span>
						<strong dir="ltr">{selectedRequest.xuiClientUuid}</strong>
						<button type="button" class="va-icon-btn" onclick={() => copyUserPage(selectedRequest.xuiClientUuid)} aria-label="کپی UUID">
							<span class="mdi mdi-content-copy"></span>
						</button>
					</div>
					<div class="identifier-row">
						<span>Email</span>
						<strong dir="ltr">{selectedRequest.xuiEmail}</strong>
					</div>
					<div class="identifier-row">
						<span>Plan</span>
						<strong>{selectedRequest.quotaGbSnapshot}G · {selectedRequest.durationDaysSnapshot} روز</strong>
					</div>
				</div>
			</div>
			<div>
				<div class="va-section-label">مصرف</div>
				<div class="usage-inspector-head">
					<div class="usage-big va-mono">{selectedRequest.usage ? formatTraffic(selectedRequest.usage.usedBytes) : '—'}</div>
					<div class="cell-meta">از {selectedRequest.quotaGbSnapshot} GB</div>
				</div>
				<VaProgressBar
					value={selectedRequest.usage?.usedBytes ?? 0}
					max={selectedRequest.usage?.totalBytes ?? selectedRequest.quotaGbSnapshot * 1024 ** 3}
					tone={usageTone(selectedRequest)}
				/>
				<div class="field-hint">{expiryText(selectedRequest)}</div>
			</div>
			{#if selectedRequest.internalNote}
				<div>
					<div class="va-section-label">یادداشت داخلی</div>
					<div class="internal-note-box">{selectedRequest.internalNote}</div>
				</div>
			{/if}
			<div>
				<div class="va-section-label">افزایش حجم</div>
				<div class="add-quota-row">
					<div class="va-field-shell add-quota-field">
						<input
							type="number"
							class="add-quota-input"
							min="0.01"
							step="0.5"
							bind:value={addQuotaGb}
							dir="ltr"
						/>
						<span class="va-field-suffix">GB</span>
					</div>
					<button
						type="button"
						class="admin-btn admin-btn-primary"
						disabled={!data.salesEnabled || selectedRequest.revokedAt !== null || selectedRequest.status === 'missing' || addQuotaGb <= 0}
						onclick={() => (addQuotaOpen = selectedRequest.id)}
					>
						<span class="mdi mdi-plus"></span>
						<span>اضافه کن</span>
					</button>
				</div>
				<div class="field-hint">بدون صفر شدن مصرف، حجم به کانفیگ اضافه می‌شود.</div>
			</div>
			<div class="va-actions-list">
				{#if selectedRequest.configUrl}
					<button type="button" class="va-action-row" onclick={() => selectedRequest?.configUrl && copyConfig(selectedRequest.configUrl)}>
						<span class="mdi mdi-content-copy"></span>
						<span>کپی VLESS</span>
					</button>
				{/if}
				<button type="button" class="va-action-row" onclick={() => copyUserPage(selectedRequest.xuiClientUuid)}>
					<span class="mdi mdi-cloud-outline"></span>
					<span>کپی صفحه کاربر</span>
				</button>
				<a
					href={resolve(`/user/${selectedRequest.xuiClientUuid}?ri=${encodeURIComponent(ownerKey)}`)}
					target="_blank"
					rel="noreferrer"
					class="va-action-row"
				>
					<span class="mdi mdi-open-in-new"></span>
					<span>باز کردن صفحه کاربر</span>
				</a>
			</div>
		</div>
	{/if}
</Modal>

<!-- Recharge confirmation -->
<Modal open={rechargeOpen !== null} title="شارژ مجدد کانفیگ" eyebrow="تایید عملیات" onClose={() => (rechargeOpen = null)}>
	{#if rechargeRequest}
		<p>
			با تایید، مصرف کانفیگ <strong>{rechargeRequest.customerLabel}</strong> صفر می‌شود
			{#if rechargeRequest.rechargePlan}
				، اعتبار آن از امروز به مدت {rechargeRequest.rechargePlan.durationDays} روز تمدید می‌شود و {rechargeRequest.rechargePlan.quotaGb} گیگ از موجودی شما کم خواهد شد.
			{:else}
				. این کانفیگ در حال حاضر قابل شارژ مجدد نیست.
			{/if}
		</p>
		{#if rechargeRequest.rechargePlan}
			<div class="modal-summary">
				<div>حجم جدید: <strong>{rechargeRequest.rechargePlan.quotaGb} گیگ</strong></div>
				<div>مدت: <strong>{rechargeRequest.rechargePlan.durationDays} روز</strong></div>
				<div>مصرف اعتبار: <strong>{rechargeRequest.rechargePlan.quotaGb} گیگ</strong></div>
			</div>
		{/if}
	{/if}

	{#snippet footer()}
		<button type="button" class="admin-btn admin-btn-ghost" onclick={() => (rechargeOpen = null)}>انصراف</button>
		<button
			type="button"
			class="admin-btn admin-btn-success"
			disabled={!rechargeRequest?.canRecharge || commands.recharge.pending > 0}
			onclick={handleRecharge}
		>
			<AnimatedIcon name="cloud" size={14} />
			<span>{commands.recharge.pending > 0 ? 'در حال شارژ...' : 'بله، شارژ کن'}</span>
		</button>
	{/snippet}
</Modal>

<!-- Revoke confirmation -->
<Modal open={revokeOpen !== null} title="حذف کانفیگ از x-ui" eyebrow="تایید لغو" onClose={() => (revokeOpen = null)}>
	{#if revokeRequest}
		<p>
			با لغو این کانفیگ، درخواست <strong>{revokeRequest.customerLabel}</strong> از x-ui حذف می‌شود و گیگ مصرف‌شده آن به موجودی شما برمی‌گردد.
		</p>
		<div class="modal-summary">
			<div>{revokeRequest.quotaGbSnapshot} گیگ · {revokeRequest.durationDaysSnapshot} روز</div>
			<div>قابل برگشت: <strong>{revokeRequest.quotaGbSnapshot} گیگ</strong></div>
		</div>
		{#if (revokeRequest.usage?.usedBytes ?? 0) > 0}
			<p class="modal-warning">
				این کانفیگ مصرف داشته است. برای جلوگیری از سوءاستفاده، لغو فقط برای کانفیگ مصرف‌نشده مجاز است.
			</p>
		{/if}
	{/if}

	{#snippet footer()}
		<button type="button" class="admin-btn admin-btn-ghost" onclick={() => (revokeOpen = null)}>انصراف</button>
		<button
			type="button"
			class="admin-btn admin-btn-danger"
			disabled={commands.revoke.pending > 0 || (revokeRequest?.usage?.usedBytes ?? 0) > 0}
			onclick={handleRevoke}
		>
			<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
			<span>{commands.revoke.pending > 0 ? 'در حال حذف...' : 'بله، حذف کن'}</span>
		</button>
	{/snippet}
</Modal>

<!-- Add quota confirmation -->
<Modal open={addQuotaOpen !== null} title="افزایش حجم کانفیگ" eyebrow="تایید عملیات" onClose={() => (addQuotaOpen = null)}>
	{#if addQuotaRequest}
		<p>
			با تایید، <strong>{addQuotaGb.toLocaleString('fa-IR-u-nu-latn')} گیگ</strong> به حجم کانفیگ <strong>{addQuotaRequest.customerLabel || addQuotaRequest.xuiEmail}</strong> اضافه می‌شود. مصرف فعلی صفر نمی‌شود.
		</p>
		<div class="modal-summary">
			<div>افزایش: <strong>{addQuotaGb.toLocaleString('fa-IR-u-nu-latn')} گیگ</strong></div>
			<div>مصرف اعتبار: <strong>{addQuotaGb.toLocaleString('fa-IR-u-nu-latn')} گیگ</strong></div>
		</div>
	{/if}

	{#snippet footer()}
		<button type="button" class="admin-btn admin-btn-ghost" onclick={() => (addQuotaOpen = null)}>انصراف</button>
		<button
			type="button"
			class="admin-btn admin-btn-success"
			disabled={addQuotaGb <= 0 || commands.addQuota.pending > 0}
			onclick={handleAddQuota}
		>
			<span class="mdi mdi-plus"></span>
			<span>{commands.addQuota.pending > 0 ? 'در حال افزایش...' : `بله، ${addQuotaGb} گیگ اضافه کن`}</span>
		</button>
	{/snippet}
</Modal>

<style>
	.align-left {
		text-align: left !important;
	}

	.empty-wrap {
		padding: 28px;
	}

	.configs-table {
		min-width: 940px;
	}

	.filter-chip-row {
		display: contents;
	}

	.mobile-filter-select {
		position: relative;
		display: none;
		min-width: 148px;
	}

	.mobile-filter-trigger {
		width: 100%;
		min-height: 40px;
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		border: 1px solid var(--va-border);
		border-radius: 12px;
		background: var(--va-bg-panel);
		color: var(--va-text);
		cursor: pointer;
		font: 700 12px var(--va-font-fa);
		padding: 0 12px;
		transition: border-color 0.16s ease, background-color 0.16s ease, transform 0.16s ease;
	}

	.mobile-filter-trigger:hover {
		border-color: var(--va-border-strong);
		background: var(--va-bg-raised);
	}

	.mobile-filter-trigger strong {
		min-width: 24px;
		height: 22px;
		display: inline-grid;
		place-items: center;
		border-radius: 999px;
		background: var(--va-accent-soft);
		color: var(--va-accent);
		font: 700 11px var(--va-font-mono);
	}

	.mobile-filter-menu {
		position: absolute;
		inset-inline: 0;
		top: calc(100% + 8px);
		z-index: 40;
		display: grid;
		gap: 4px;
		padding: 6px;
		border: 1px solid var(--va-border-strong);
		border-radius: 14px;
		background: var(--va-bg-panel);
		box-shadow: var(--admin-shadow-pop);
		transform-origin: top center;
	}

	.mobile-filter-menu button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 9px 10px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--va-text-muted);
		cursor: pointer;
		font: 700 12px var(--va-font-fa);
	}

	.mobile-filter-menu button:hover,
	.mobile-filter-menu button.is-active {
		background: var(--va-accent-soft);
		color: var(--va-text);
	}

	.bookmark-cell {
		width: 32px;
		padding-inline-end: 6px !important;
	}

	.bookmark-btn.is-active {
		color: var(--va-warning);
	}

	.customer-cell {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	.cell-name {
		margin: 0;
		color: var(--va-text);
		font-size: 13px;
		font-weight: 500;
	}

	.cell-meta {
		margin: 3px 0 0;
		color: var(--va-text-faint);
		font: 500 10.5px var(--va-font-mono);
	}

	.usage-table-cell {
		width: 220px;
	}

	.usage-line {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 6px;
		font-size: 12px;
	}

	.muted {
		color: var(--va-text-faint);
	}

	.table-actions {
		position: relative;
		display: inline-flex;
		gap: 2px;
		color: var(--va-text-muted);
	}

	.table-actions .va-icon-btn.is-active {
		color: var(--va-accent);
		background: var(--va-accent-soft);
		border-color: color-mix(in srgb, var(--va-accent) 24%, var(--va-border));
	}

	.va-context-menu {
		position: fixed;
		z-index: 1000;
		width: 220px;
		max-width: calc(100vw - 20px);
		overflow: hidden;
		border: 1px solid var(--va-border-strong);
		border-radius: 8px;
		background: color-mix(in srgb, var(--va-bg-panel) 96%, transparent);
		box-shadow: var(--admin-shadow-pop);
		backdrop-filter: blur(14px);
		padding: 5px;
		transform-origin: top right;
	}

	.charge-history-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.charge-history-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border: 1px solid var(--va-border);
		border-radius: 8px;
		background: var(--va-bg-raised);
	}

	.charge-history-row > span {
		color: var(--va-accent);
	}

	.charge-history-row div:nth-child(2) {
		flex: 1;
		min-width: 0;
	}

	.charge-history-row strong,
	.charge-history-row small {
		display: block;
	}

	.charge-history-row strong {
		color: var(--va-text);
		font-size: 12px;
	}

	.charge-history-row small {
		margin-top: 3px;
		color: var(--va-text-faint);
		font-size: 10.5px;
	}

	.va-context-menu button,
	.va-context-menu a {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 9px 10px;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--va-text-muted);
		cursor: pointer;
		text-align: right;
		text-decoration: none;
		font: 600 12px var(--va-font-fa);
		transition: background-color 0.16s ease, color 0.16s ease;
	}

	.va-context-menu button:hover,
	.va-context-menu a:hover {
		background: var(--va-bg-raised);
		color: var(--va-text);
	}

	.va-context-menu button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.va-context-menu .danger {
		color: var(--va-danger);
	}

	.configs-mobile-list {
		display: none;
	}

	.config-mobile-card {
		width: 100%;
		padding: 12px 14px;
		color: var(--va-text);
		text-align: right;
	}

	.mobile-card-main {
		min-width: 0;
		flex: 1;
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
		text-align: right;
		font: inherit;
		padding: 0;
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

	.config-mobile-card.is-selected {
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

	.mobile-usage-row {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		margin: 10px 0 5px;
		color: var(--va-text-muted);
		font-size: 10.5px;
	}

	.pagination-controls {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.pagination-prev-icon {
		transform: rotate(180deg);
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
		border: 1px solid var(--va-border);
		border-radius: 9px;
		background: var(--va-bg-raised);
		cursor: pointer;
		transition:
			background-color 0.18s ease,
			border-color 0.18s ease;
	}

	.va-switch.is-on {
		border-color: var(--va-accent);
		background: var(--va-accent);
	}

	.va-switch span {
		position: absolute;
		top: 2px;
		inset-inline-end: 16px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--va-bg-panel);
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.22);
		transition: inset-inline-end 0.18s ease;
	}

	.va-switch.is-on span {
		inset-inline-end: 2px;
	}

	.usage-inspector-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 6px;
	}

	.usage-big {
		color: var(--va-text);
		font-size: 18px;
	}

	.field-hint {
		margin-top: 6px;
		color: var(--va-text-faint);
		font: 500 11px var(--va-font-mono);
	}

	.identifier-list {
		overflow: hidden;
		border: 1px solid var(--va-border);
		border-radius: 6px;
	}

	.identifier-row {
		display: grid;
		grid-template-columns: 52px minmax(0, 1fr) 30px;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-bottom: 1px solid var(--va-border);
	}

	.identifier-row:last-child {
		border-bottom: 0;
	}

	.identifier-list span {
		color: var(--va-text-faint);
		font: 500 10px var(--va-font-mono);
		text-transform: uppercase;
	}

	.identifier-list strong {
		min-width: 0;
		overflow: hidden;
		color: var(--va-text);
		font: 500 11.5px var(--va-font-mono);
		text-align: left;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.identifier-row .va-icon-btn {
		justify-self: end;
	}

	.internal-note-box {
		padding: 10px 12px;
		border: 1px solid var(--va-border);
		border-radius: 6px;
		background: var(--va-bg-raised);
		color: var(--va-text);
		font-size: 12px;
		line-height: 1.8;
		white-space: pre-wrap;
	}

	.plan-current {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 12px;
		margin-bottom: 8px;
		border: 1px solid var(--va-border);
		border-radius: 6px;
		background: var(--va-bg-raised);
	}

	.plan-current span {
		color: var(--va-text);
		font-size: 12px;
	}

	.plan-current strong {
		color: var(--va-text-faint);
		font: 500 11px var(--va-font-mono);
		text-align: left;
	}

	.full-width {
		width: 100%;
		justify-content: center;
	}

	.va-actions-list a {
		text-decoration: none;
	}

	.modal-summary {
		display: grid;
		gap: 0.4rem;
		padding: 0.85rem 1.1rem;
		border: 1px solid var(--va-border);
		border-radius: 6px;
		background: var(--va-bg-raised);
		margin-top: 0.85rem;
		font-size: 0.82rem;
	}
	.modal-warning {
		margin-top: 0.85rem;
		padding: 0.85rem 1rem;
		border-radius: 6px;
		background: color-mix(in srgb, var(--va-danger) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--va-danger) 28%, transparent);
		color: var(--va-danger);
		font-size: 0.82rem;
		line-height: 1.7;
	}

	.add-quota-row {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.add-quota-field {
		flex: 1;
		min-width: 0;
	}

	.add-quota-input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		color: var(--va-text);
		font: 500 13px var(--va-font-mono);
		outline: none;
		-moz-appearance: textfield;
	}

	.add-quota-input::-webkit-outer-spin-button,
	.add-quota-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
	}

	.mobile-details-stack {
		display: grid;
		gap: 14px;
	}

	@media (max-width: 760px) {
		.va-toolbar {
			display: grid;
			grid-template-columns: 1fr auto;
			align-items: stretch;
		}

		.va-toolbar-search {
			min-width: 0;
		}

		.desktop-filter-chips {
			display: none;
		}

		.mobile-filter-select {
			display: block;
		}

		.configs-mobile-list {
			display: flex;
		}
	}
</style>
