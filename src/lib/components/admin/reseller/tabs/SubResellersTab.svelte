<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { formatToman } from '$lib/utils/format';
	import EmptyState from '$lib/components/admin/EmptyState.svelte';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import VaStatRow from '$lib/components/admin/va/VaStatRow.svelte';
	import Modal from '$lib/components/admin/Modal.svelte';
	import InspectorPortal from '$lib/components/admin/InspectorPortal.svelte';
	import ConfirmDialog from '$lib/components/admin/ConfirmDialog.svelte';
	import ImagePreviewModal from '$lib/components/admin/ImagePreviewModal.svelte';
	import {
		createSubResellerCommand,
		setSubResellerActiveCommand,
		resetSubResellerPasswordCommand,
		transferGbToSubResellerCommand,
		createSubPackageCommand,
		updateSubPackageCommand,
		setSubPackageActiveCommand,
		deleteSubPackageCommand,
		reviewSubCreditRequestCommand
	} from '../../../../../routes/reseller/page.remote';

	type SubReseller = {
		id: number;
		username: string;
		email: string;
		isActive: boolean;
		gbBalance: number;
		totalConfigs: number;
		activeConfigs: number;
		createdAt: number;
	};

	type SubPackage = {
		id: number;
		quotaGb: number;
		priceToman: number;
		isActive: boolean;
	};

	type SubCreditRequest = {
		id: number;
		subResellerId: number;
		subResellerUsername: string;
		packageId: number;
		quotaGbSnapshot: number;
		priceTomanSnapshot: number;
		receiptText: string;
		receiptFileName: string | null;
		receiptMimeType: string | null;
		receiptDataBase64: string | null;
		status: 'pending' | 'approved' | 'rejected';
		parentNote: string;
		createdAt: number;
		reviewedAt: number | null;
	};

	type Props = {
		data: {
			stats: { gbBalance: number };
			reseller: { subResellerLimit: number };
			subResellers: SubReseller[];
			subPackages: SubPackage[];
			subCreditRequests: SubCreditRequest[];
		};
		resellerState?: any;
	};

	let { data, resellerState }: Props = $props();

	// ── section tabs ─────────────────────────────────────────────────────────
	let activeSection = $state<'resellers' | 'packages' | 'requests'>('resellers');

	// ── sub-reseller list ────────────────────────────────────────────────────
	let selectedSubId = $state<number | null>(null);
	let selectedPackageId = $state<number | null>(null);
	let createModalOpen = $state(false);
	let newUsername = $state('');
	let transferModalOpen = $state(false);
	let transferSubId = $state<number | null>(null);
	let transferAmount = $state(1);
	let passwordResetResult = $state<{ username: string; password: string } | null>(null);
	let passwordModalOpen = $state(false);
	let confirmDeactivate = $state<{ open: boolean; subId: number; isActive: boolean }>({ open: false, subId: 0, isActive: false });

	// ── packages ─────────────────────────────────────────────────────────────
	let packageModalOpen = $state(false);
	let editingPackage = $state<SubPackage | null>(null);
	let pkgQuotaGb = $state(10);
	let pkgPriceToman = $state(0);

	// ── credit requests ───────────────────────────────────────────────────────
	let selectedRequestId = $state<number | null>(null);
	let requestFilter = $state<'pending' | 'all'>('pending');
	let reviewConfirmOpen = $state(false);
	let reviewConfirmStatus = $state<'approved' | 'rejected'>('approved');
	let reviewConfirmResolve: ((v: boolean) => void) | null = null;
	let pendingReviewNote = $state('');
	let previewImage = $state<{ src: string; alt: string } | null>(null);
	let resellerPage = $state(1);
	let packagePage = $state(1);
	let requestPage = $state(1);
	const pageSize = 10;

	// ── derived ──────────────────────────────────────────────────────────────
	const selectedSub = $derived(
		selectedSubId !== null ? data.subResellers.find((s) => s.id === selectedSubId) ?? null : null
	);
	const selectedPackage = $derived(
		selectedPackageId !== null ? data.subPackages.find((p) => p.id === selectedPackageId) ?? null : data.subPackages[0] ?? null
	);
	const pendingRequests = $derived(data.subCreditRequests.filter((r) => r.status === 'pending'));
	const visibleRequests = $derived(
		(requestFilter === 'pending' ? pendingRequests : data.subCreditRequests).slice((requestPage - 1) * pageSize, requestPage * pageSize)
	);
	const filteredRequestCount = $derived((requestFilter === 'pending' ? pendingRequests : data.subCreditRequests).length);
	const resellerPages = $derived(Math.max(1, Math.ceil(data.subResellers.length / pageSize)));
	const packagePages = $derived(Math.max(1, Math.ceil(data.subPackages.length / pageSize)));
	const requestPages = $derived(Math.max(1, Math.ceil(filteredRequestCount / pageSize)));
	const visibleSubs = $derived(data.subResellers.slice((resellerPage - 1) * pageSize, resellerPage * pageSize));
	const visiblePackages = $derived(data.subPackages.slice((packagePage - 1) * pageSize, packagePage * pageSize));
	const subResellerLimit = $derived(data.reseller.subResellerLimit ?? 10);
	const isAtSubResellerLimit = $derived(data.subResellers.length >= subResellerLimit);
	const selectedRequest = $derived(
		selectedRequestId !== null
			? data.subCreditRequests.find((r) => r.id === selectedRequestId) ?? null
			: null
	);

	const statItems = $derived([
		{
			label: 'زیرفروشندگان',
			value: data.subResellers.length.toLocaleString('fa-IR-u-nu-latn'),
			delta: `${data.subResellers.length.toLocaleString('fa-IR-u-nu-latn')} از ${subResellerLimit.toLocaleString('fa-IR-u-nu-latn')} حساب`,
			deltaTone: isAtSubResellerLimit ? ('warning' as const) : ('muted' as const)
		},
		{
			label: 'درخواست‌های در انتظار',
			value: pendingRequests.length.toLocaleString('fa-IR-u-nu-latn'),
			delta: 'نیاز به بررسی',
			deltaTone: pendingRequests.length > 0 ? ('warning' as const) : ('success' as const)
		},
		{
			label: 'بسته‌های شارژ',
			value: data.subPackages.filter((p) => p.isActive).length.toLocaleString('fa-IR-u-nu-latn'),
			delta: 'بسته فعال',
			deltaTone: 'muted' as const
		}
	]);

	// ── helpers ───────────────────────────────────────────────────────────────
	function formatDate(ts: number) {
		return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts * 1000));
	}

	function openPackageModal(pkg?: SubPackage) {
		editingPackage = pkg ?? null;
		pkgQuotaGb = pkg?.quotaGb ?? 10;
		pkgPriceToman = pkg?.priceToman ?? 0;
		packageModalOpen = true;
	}

	function openTransferModal(subId: number) {
		transferSubId = subId;
		transferAmount = 1;
		transferModalOpen = true;
	}

	function awaitReviewConfirm(status: 'approved' | 'rejected'): Promise<boolean> {
		return new Promise((resolve) => {
			reviewConfirmStatus = status;
			reviewConfirmOpen = true;
			reviewConfirmResolve = resolve;
		});
	}

	function resolveReviewConfirm(confirmed: boolean) {
		reviewConfirmOpen = false;
		reviewConfirmResolve?.(confirmed);
		reviewConfirmResolve = null;
	}

	// ── actions ───────────────────────────────────────────────────────────────
	async function handleCreate() {
		if (!newUsername.trim()) return;
		try {
			const result = (await createSubResellerCommand({ username: newUsername.trim() }).updates(resellerState)) as unknown as Record<string, string> | null;
			if (result?.subResellerSuccess) {
				toast.success(result.subResellerSuccess);
				if (result.subResellerPassword) {
					passwordResetResult = { username: newUsername.trim(), password: result.subResellerPassword };
					passwordModalOpen = true;
				}
				newUsername = '';
				createModalOpen = false;
			}
			if (result?.subResellerError) toast.error(result.subResellerError);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'ساخت زیرفروشنده انجام نشد.');
		}
	}

	async function handleToggleActive(sub: SubReseller) {
		confirmDeactivate = { open: true, subId: sub.id, isActive: !sub.isActive };
	}

	async function confirmToggleActive() {
		const { subId, isActive } = confirmDeactivate;
		confirmDeactivate = { open: false, subId: 0, isActive: false };
		try {
			const result = (await setSubResellerActiveCommand({ subResellerId: subId, isActive }).updates(resellerState)) as unknown as Record<string, string> | null;
			if (result?.subResellerSuccess) toast.success(result.subResellerSuccess);
			if (result?.subResellerError) toast.error(result.subResellerError);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'تغییر وضعیت انجام نشد.');
		}
	}

	async function handleResetPassword(subId: number, username: string) {
		try {
			const result = (await resetSubResellerPasswordCommand({ subResellerId: subId }).updates(resellerState)) as unknown as Record<string, string> | null;
			if (result?.subResellerSuccess && result.subResellerPassword) {
				passwordResetResult = { username, password: result.subResellerPassword };
				passwordModalOpen = true;
			}
			if (result?.subResellerError) toast.error(result.subResellerError);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'بازنشانی گذرواژه انجام نشد.');
		}
	}

	async function handleTransfer() {
		if (!transferSubId || transferAmount <= 0) return;
		try {
			const result = (await transferGbToSubResellerCommand({ subResellerId: transferSubId, amountGb: transferAmount }).updates(resellerState)) as unknown as Record<string, string> | null;
			if (result?.transferSuccess) { toast.success(result.transferSuccess); transferModalOpen = false; }
			if (result?.transferError) toast.error(result.transferError);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'انتقال انجام نشد.');
		}
	}

	async function handleSavePackage() {
		try {
			const result = editingPackage
				? (await updateSubPackageCommand({ id: editingPackage.id, quotaGb: pkgQuotaGb, priceToman: pkgPriceToman }).updates(resellerState)) as unknown as Record<string, string> | null
				: (await createSubPackageCommand({ quotaGb: pkgQuotaGb, priceToman: pkgPriceToman }).updates(resellerState)) as unknown as Record<string, string> | null;
			if (result?.subPackageSuccess) { toast.success(result.subPackageSuccess); packageModalOpen = false; }
			if (result?.subPackageError) toast.error(result.subPackageError);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'ذخیره بسته انجام نشد.');
		}
	}

	async function handleTogglePackage(pkg: SubPackage) {
		try {
			const result = (await setSubPackageActiveCommand({ id: pkg.id, isActive: !pkg.isActive }).updates(resellerState)) as unknown as Record<string, string> | null;
			if (result?.subPackageSuccess) toast.success(result.subPackageSuccess);
			if (result?.subPackageError) toast.error(result.subPackageError);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'تغییر وضعیت بسته انجام نشد.');
		}
	}

	async function handleDeletePackage(id: number) {
		try {
			const result = (await deleteSubPackageCommand({ id }).updates(resellerState)) as unknown as Record<string, string> | null;
			if (result?.subPackageSuccess) toast.success(result.subPackageSuccess);
			if (result?.subPackageError) toast.error(result.subPackageError);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'حذف بسته انجام نشد.');
		}
	}

	async function handleReview(status: 'approved' | 'rejected') {
		const req = selectedRequest;
		if (!req) return;
		const confirmed = await awaitReviewConfirm(status);
		if (!confirmed) return;
		try {
			const result = (await reviewSubCreditRequestCommand({ id: req.id, status, parentNote: pendingReviewNote }).updates(resellerState)) as unknown as Record<string, string> | null;
			if (result?.subCreditRequestSuccess) { toast.success(result.subCreditRequestSuccess); pendingReviewNote = ''; }
			if (result?.subCreditRequestError) toast.error(result.subCreditRequestError);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'بررسی درخواست انجام نشد.');
		}
	}
</script>

<InspectorPortal content={subResellersInspector} />

<VaStatRow items={statItems} />

<!-- Section tabs -->
<div class="section-tabs">
	<button class="section-tab" class:is-active={activeSection === 'resellers'} onclick={() => (activeSection = 'resellers')}>
		<AnimatedIcon name="store" size={14} />
		<span>زیرفروشندگان</span>
		<span class="tab-count">{data.subResellers.length}</span>
	</button>
	<button class="section-tab" class:is-active={activeSection === 'packages'} onclick={() => (activeSection = 'packages')}>
		<AnimatedIcon name="spark-up" size={14} />
		<span>بسته‌های شارژ</span>
		<span class="tab-count">{data.subPackages.length}</span>
	</button>
	<button class="section-tab" class:is-active={activeSection === 'requests'} onclick={() => (activeSection = 'requests')}>
		<AnimatedIcon name="bell" size={14} />
		<span>درخواست‌های شارژ</span>
		{#if pendingRequests.length > 0}
			<span class="tab-count is-badge">{pendingRequests.length}</span>
		{/if}
	</button>
</div>

<!-- ── Sub-resellers list ─────────────────────────────────────────────── -->
{#if activeSection === 'resellers'}
<section class="va-card">
	<div class="section-head">
		<div>
			<div class="section-title">زیرفروشندگان</div>
			<div class="section-sub">روی هر ردیف کلیک کنید تا گزینه‌های مدیریت ظاهر شوند.</div>
		</div>
		<button class="admin-btn admin-btn-primary" disabled={isAtSubResellerLimit} onclick={() => (createModalOpen = true)}>
			<AnimatedIcon name="plus-network" size={13} />
			<span>زیرفروشنده جدید</span>
		</button>
	</div>
	{#if isAtSubResellerLimit}
		<div class="capacity-notice">
			سقف {subResellerLimit.toLocaleString('fa-IR-u-nu-latn')} زیرفروشنده تکمیل شده است. برای افزایش سقف با مدیر تماس بگیرید.
		</div>
	{/if}

	{#if data.subResellers.length === 0}
		<EmptyState title="زیرفروشنده‌ای وجود ندارد" description="زیرفروشنده بسازید تا مدیریت فروش را به آن‌ها واگذار کنید." icon="search" />
	{:else}
		<div class="va-table-wrap">
			<table class="va-table">
				<thead>
					<tr>
						<th>نام کاربری</th>
						<th>موجودی</th>
						<th>کانفیگ‌ها</th>
						<th>وضعیت</th>
						<th>تاریخ عضویت</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleSubs as sub (sub.id)}
						<tr
							class:is-selected={selectedSubId === sub.id}
							onclick={() => (selectedSubId = sub.id)}
							style="cursor: pointer"
						>
							<td class="sub-username">{sub.username}</td>
							<td class="va-mono">{sub.gbBalance} GB</td>
							<td class="va-mono">{sub.activeConfigs} / {sub.totalConfigs}</td>
							<td>
								<span class="status-pill" class:active={sub.isActive} class:inactive={!sub.isActive}>
									{sub.isActive ? 'فعال' : 'غیرفعال'}
								</span>
							</td>
							<td class="date-cell">{formatDate(sub.createdAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="table-pagination">
			<span>{resellerPage} / {resellerPages}</span>
			<div><button type="button" class="va-icon-btn" disabled={resellerPage <= 1} onclick={() => resellerPage--}><span class="pagination-prev-icon"><AnimatedIcon name="chevron-left" size={12} /></span></button><button type="button" class="va-icon-btn" disabled={resellerPage >= resellerPages} onclick={() => resellerPage++}><AnimatedIcon name="chevron-left" size={12} /></button></div>
		</div>
	{/if}
</section>
{/if}

<!-- ── Packages ───────────────────────────────────────────────────────── -->
{#if activeSection === 'packages'}
<section class="va-card">
	<div class="section-head">
		<div>
			<div class="section-title">بسته‌های شارژ زیرفروشندگان</div>
			<div class="section-sub">بسته‌هایی که زیرفروشندگان شما می‌توانند برای خرید گیگ انتخاب کنند.</div>
		</div>
		<button class="admin-btn admin-btn-primary" onclick={() => openPackageModal()}>
			<AnimatedIcon name="plus-network" size={13} />
			<span>بسته جدید</span>
		</button>
	</div>

	{#if data.subPackages.length === 0}
		<EmptyState title="بسته‌ای تعریف نشده" description="بسته‌های شارژ بسازید تا زیرفروشندگان بتوانند درخواست شارژ بدهند." icon="sparkle" />
	{:else}
		<div class="va-table-wrap">
			<table class="va-table">
				<thead>
					<tr>
						<th>حجم</th>
						<th>قیمت</th>
						<th>وضعیت</th>
					</tr>
				</thead>
				<tbody>
					{#each visiblePackages as pkg (pkg.id)}
						<tr class:is-selected={selectedPackage?.id === pkg.id} onclick={() => (selectedPackageId = pkg.id)} style="cursor: pointer">
							<td class="va-mono">{pkg.quotaGb} GB</td>
							<td class="va-mono">{formatToman(pkg.priceToman)}</td>
							<td>
								<span class="status-pill" class:active={pkg.isActive} class:inactive={!pkg.isActive}>
									{pkg.isActive ? 'فعال' : 'غیرفعال'}
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="table-pagination">
			<span>{packagePage} / {packagePages}</span>
			<div><button type="button" class="va-icon-btn" disabled={packagePage <= 1} onclick={() => packagePage--}><span class="pagination-prev-icon"><AnimatedIcon name="chevron-left" size={12} /></span></button><button type="button" class="va-icon-btn" disabled={packagePage >= packagePages} onclick={() => packagePage++}><AnimatedIcon name="chevron-left" size={12} /></button></div>
		</div>
	{/if}
</section>
{/if}

<!-- ── Credit requests ────────────────────────────────────────────────── -->
{#if activeSection === 'requests'}
<section class="va-card">
	<div class="section-head">
		<div>
			<div class="section-title">درخواست‌های شارژ زیرفروشندگان</div>
			<div class="section-sub">روی هر ردیف کلیک کنید تا رسید و گزینه‌های بررسی نمایش داده شود.</div>
		</div>
		<div class="filter-actions">
			<button class="va-chip" class:is-active={requestFilter === 'pending'} onclick={() => { requestFilter = 'pending'; requestPage = 1; }}>
				در انتظار
				{#if pendingRequests.length > 0}
					<span class="va-chip-count">{pendingRequests.length}</span>
				{/if}
			</button>
			<button class="va-chip" class:is-active={requestFilter === 'all'} onclick={() => { requestFilter = 'all'; requestPage = 1; }}>
				همه
			</button>
		</div>
		</div>

	{#if visibleRequests.length === 0}
		<EmptyState title="درخواستی وجود ندارد" description="بعد از ارسال رسید توسط زیرفروشنده، اینجا نمایش داده می‌شود." icon="bell" />
	{:else}
		<div class="va-table-wrap">
			<table class="va-table">
				<thead>
					<tr>
						<th>زیرفروشنده</th>
						<th>حجم</th>
						<th>قیمت</th>
						<th>وضعیت</th>
						<th>تاریخ</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleRequests as req (req.id)}
						<tr
							class:is-selected={selectedRequestId === req.id}
							onclick={() => (selectedRequestId = req.id)}
							style="cursor: pointer"
						>
							<td class="sub-username">{req.subResellerUsername || `#${req.subResellerId}`}</td>
							<td class="va-mono">{req.quotaGbSnapshot.toLocaleString('fa-IR-u-nu-latn')} GB</td>
							<td class="va-mono">{formatToman(req.priceTomanSnapshot)}</td>
							<td>
								<span class="status-pill {req.status}">
									{req.status === 'pending' ? 'در انتظار' : req.status === 'approved' ? 'تأیید شده' : 'رد شده'}
								</span>
							</td>
							<td class="date-cell">{formatDate(req.createdAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			</div>
			<div class="table-pagination">
				<span>{requestPage} / {requestPages}</span>
				<div><button type="button" class="va-icon-btn" disabled={requestPage <= 1} onclick={() => requestPage--}><span class="pagination-prev-icon"><AnimatedIcon name="chevron-left" size={12} /></span></button><button type="button" class="va-icon-btn" disabled={requestPage >= requestPages} onclick={() => requestPage++}><AnimatedIcon name="chevron-left" size={12} /></button></div>
			</div>
		{/if}
</section>
{/if}

<!-- ── Inspector ──────────────────────────────────────────────────────── -->
{#snippet subResellersInspector()}
<aside class="va-inspector">
	<div class="va-inspector-head">
		<AnimatedIcon name="store" size={20} active />
		<div>
			<p class="va-inspector-title">جزئیات</p>
			<p class="va-inspector-sub">
				{#if activeSection === 'resellers'}مدیریت زیرفروشنده انتخاب‌شده
				{:else if activeSection === 'requests'}بررسی درخواست شارژ
				{:else}بسته‌های شارژ{/if}
			</p>
		</div>
	</div>

	<div class="va-inspector-body">
		{#if activeSection === 'resellers'}
			{#if selectedSub}
				<div class="detail-header">
					<div class="detail-who">
						<strong>{selectedSub.username}</strong>
						<span class="va-mono">{selectedSub.gbBalance} GB موجودی</span>
					</div>
					<span class="status-pill" class:active={selectedSub.isActive} class:inactive={!selectedSub.isActive}>
						{selectedSub.isActive ? 'فعال' : 'غیرفعال'}
					</span>
				</div>

				<div class="detail-meta">
					<span class="detail-label">کانفیگ‌های فعال</span>
					<span>{selectedSub.activeConfigs} از {selectedSub.totalConfigs}</span>
				</div>
				<div class="detail-meta">
					<span class="detail-label">تاریخ ثبت‌نام</span>
					<span>{formatDate(selectedSub.createdAt)}</span>
				</div>

				<div class="inspector-actions">
					<button
						class="admin-btn admin-btn-primary"
						onclick={() => openTransferModal(selectedSub!.id)}
					>
						<AnimatedIcon name="spark-up" size={13} />
						<span>انتقال گیگ</span>
					</button>
					<button
						class="admin-btn admin-btn-ghost"
						onclick={() => handleResetPassword(selectedSub!.id, selectedSub!.username)}
					>
						<AnimatedIcon name="key" size={13} />
						<span>بازنشانی گذرواژه</span>
					</button>
					<button
						class="admin-btn admin-btn-ghost"
						onclick={() => handleToggleActive(selectedSub!)}
					>
						<AnimatedIcon name={selectedSub.isActive ? 'toggle' : 'check'} size={13} />
						<span>{selectedSub.isActive ? 'غیرفعال کردن' : 'فعال کردن'}</span>
					</button>
				</div>
			{:else}
				<EmptyState
					title="انتخابی نشده"
					description="روی یک ردیف کلیک کنید تا گزینه‌های مدیریت نمایش داده شود."
					icon="search"
				/>
			{/if}

		{:else if activeSection === 'requests'}
			{#if selectedRequest}
				<div class="detail-header">
					<div class="detail-who">
						<strong>{selectedRequest.subResellerUsername || `#${selectedRequest.subResellerId}`}</strong>
						<span class="va-mono">{selectedRequest.quotaGbSnapshot} GB · {formatToman(selectedRequest.priceTomanSnapshot)} تومان</span>
					</div>
					<span class="status-pill {selectedRequest.status}">
						{selectedRequest.status === 'pending' ? 'در انتظار' : selectedRequest.status === 'approved' ? 'تأیید شده' : 'رد شده'}
					</span>
				</div>

				<div class="detail-meta">
					<span class="detail-label">تاریخ درخواست</span>
					<span>{formatDate(selectedRequest.createdAt)}</span>
				</div>
				{#if selectedRequest.reviewedAt}
					<div class="detail-meta">
						<span class="detail-label">تاریخ بررسی</span>
						<span>{formatDate(selectedRequest.reviewedAt)}</span>
					</div>
				{/if}

				{#if selectedRequest.receiptText}
					<div>
						<div class="va-section-label">متن رسید</div>
						<p class="receipt-text">{selectedRequest.receiptText}</p>
					</div>
				{/if}

				{#if selectedRequest.receiptDataBase64 && selectedRequest.receiptMimeType}
					<div>
						<div class="va-section-label">تصویر رسید</div>
						<button type="button" class="receipt-preview" onclick={() => (previewImage = { src: `data:${selectedRequest.receiptMimeType};base64,${selectedRequest.receiptDataBase64}`, alt: selectedRequest.receiptFileName ?? 'رسید' })}>
							<img src={`data:${selectedRequest.receiptMimeType};base64,${selectedRequest.receiptDataBase64}`} alt={selectedRequest.receiptFileName ?? 'رسید'} class="receipt-img" />
						</button>
					</div>
				{/if}

				{#if selectedRequest.status === 'pending'}
					<div class="review-form">
						<div class="va-section-label">بررسی درخواست</div>
						<input
							class="admin-field"
							type="text"
							bind:value={pendingReviewNote}
							placeholder="یادداشت، اختیاری"
						/>
						<div class="review-actions">
							<button class="admin-btn admin-btn-primary" onclick={() => handleReview('approved')}>
								<AnimatedIcon name="check" size={13} />
								<span>تأیید</span>
							</button>
							<button class="admin-btn admin-btn-ghost" onclick={() => handleReview('rejected')}>رد</button>
						</div>
					</div>
				{:else if selectedRequest.parentNote}
					<div>
						<div class="va-section-label">یادداشت شما</div>
						<div class="manager-note-view">{selectedRequest.parentNote}</div>
					</div>
				{/if}
			{:else}
				<EmptyState
					title="درخواستی انتخاب نشده"
					description="روی یک ردیف کلیک کنید."
					icon="bell"
				/>
			{/if}

		{:else}
			{#if selectedPackage}
				<div class="detail-header">
					<div class="detail-who">
						<strong>{selectedPackage.quotaGb} GB</strong>
						<span class="va-mono">{formatToman(selectedPackage.priceToman)} تومان</span>
					</div>
					<span class="status-pill" class:active={selectedPackage.isActive} class:inactive={!selectedPackage.isActive}>{selectedPackage.isActive ? 'فعال' : 'غیرفعال'}</span>
				</div>
				<div class="inspector-actions">
					<button class="admin-btn admin-btn-primary" onclick={() => openPackageModal(selectedPackage)}>ویرایش</button>
					<button class="admin-btn admin-btn-ghost" onclick={() => handleTogglePackage(selectedPackage)}>{selectedPackage.isActive ? 'غیرفعال کردن' : 'فعال کردن'}</button>
					<button class="admin-btn admin-btn-ghost" onclick={() => handleDeletePackage(selectedPackage.id)}>حذف</button>
				</div>
			{:else}
				<EmptyState title="بسته‌ای انتخاب نشده" description="روی یک بسته کلیک کنید." icon="sparkle" />
			{/if}
		{/if}
	</div>
</aside>
{/snippet}

<!-- ── Create sub-reseller modal ──────────────────────────────────────── -->
<Modal open={createModalOpen} title="زیرفروشنده جدید" eyebrow="ساخت حساب" onClose={() => (createModalOpen = false)}>
	<div class="modal-form">
		<label>
			<span>نام کاربری</span>
			<input
				class="admin-field"
				type="text"
				bind:value={newUsername}
				placeholder="username"
				dir="ltr"
				autocomplete="off"
			/>
		</label>
		<p class="modal-hint">گذرواژه به‌صورت تصادفی تولید می‌شود و پس از ساخت نمایش داده خواهد شد.</p>
		<p class="modal-hint">ظرفیت: {data.subResellers.length.toLocaleString('fa-IR-u-nu-latn')} از {subResellerLimit.toLocaleString('fa-IR-u-nu-latn')}</p>
		<div class="modal-actions">
			<button
				class="admin-btn admin-btn-primary"
				disabled={isAtSubResellerLimit || !newUsername.trim() || createSubResellerCommand.pending > 0}
				onclick={handleCreate}
			>
				<AnimatedIcon name="plus-network" size={13} />
				<span>{createSubResellerCommand.pending > 0 ? 'در حال ساخت...' : 'ساخت زیرفروشنده'}</span>
			</button>
		</div>
	</div>
</Modal>

<!-- ── Transfer GB modal ─────────────────────────────────────────────── -->
<Modal open={transferModalOpen} title="انتقال گیگابایت" eyebrow="از موجودی شما" onClose={() => (transferModalOpen = false)}>
	<div class="modal-form">
		<div class="transfer-balance">
			<AnimatedIcon name="spark-up" size={16} />
			<span>موجودی شما: <strong>{data.stats.gbBalance} GB</strong></span>
		</div>
		<label>
			<span>مقدار انتقال (گیگابایت)</span>
			<input
				class="admin-field"
				type="number"
				min="1"
				max={data.stats.gbBalance}
				bind:value={transferAmount}
				dir="ltr"
			/>
		</label>
		<div class="modal-actions">
			<button
				class="admin-btn admin-btn-primary"
				disabled={transferAmount <= 0 || transferAmount > data.stats.gbBalance || transferGbToSubResellerCommand.pending > 0}
				onclick={handleTransfer}
			>
				<AnimatedIcon name="spark-up" size={13} />
				<span>{transferGbToSubResellerCommand.pending > 0 ? 'در حال انتقال...' : `انتقال ${transferAmount} GB`}</span>
			</button>
		</div>
	</div>
</Modal>

<!-- ── Package edit modal ─────────────────────────────────────────────── -->
<Modal open={packageModalOpen} title={editingPackage ? 'ویرایش بسته' : 'بسته جدید'} eyebrow="بسته شارژ زیرفروشنده" onClose={() => (packageModalOpen = false)}>
	<div class="modal-form">
		<label>
			<span>حجم (گیگابایت)</span>
			<input class="admin-field" type="number" min="1" bind:value={pkgQuotaGb} dir="ltr" />
		</label>
		<label>
			<span>قیمت (تومان)</span>
			<input class="admin-field" type="number" min="0" bind:value={pkgPriceToman} dir="ltr" />
		</label>
		<div class="modal-actions">
			<button
				class="admin-btn admin-btn-primary"
				disabled={pkgQuotaGb <= 0 || createSubPackageCommand.pending > 0 || updateSubPackageCommand.pending > 0}
				onclick={handleSavePackage}
			>
				<AnimatedIcon name="check" size={13} />
				<span>ذخیره بسته</span>
			</button>
		</div>
	</div>
</Modal>

<!-- ── Password reveal modal ──────────────────────────────────────────── -->
<Modal open={passwordModalOpen} title="گذرواژه جدید" eyebrow="حتماً کپی کنید" onClose={() => (passwordModalOpen = false)}>
	{#if passwordResetResult}
		<div class="password-reveal">
			<div class="password-reveal-info">
				<AnimatedIcon name="key" size={18} active />
				<div>
					<p class="password-reveal-sub">نام کاربری: <code>{passwordResetResult.username}</code></p>
					<p class="password-reveal-sub">گذرواژه:</p>
					<code class="password-reveal-code">{passwordResetResult.password}</code>
				</div>
			</div>
			<p class="modal-hint">این گذرواژه فقط یک‌بار نمایش داده می‌شود. آن را به زیرفروشنده بدهید.</p>
		</div>
	{/if}
</Modal>

<!-- ── Confirm deactivate dialog ─────────────────────────────────────── -->
<ConfirmDialog
	open={confirmDeactivate.open}
	title={confirmDeactivate.isActive ? 'فعال‌سازی زیرفروشنده' : 'غیرفعال‌سازی زیرفروشنده'}
	description={confirmDeactivate.isActive
		? 'با فعال‌سازی، زیرفروشنده می‌تواند وارد پنل شود.'
		: 'با غیرفعال‌سازی، زیرفروشنده دسترسی به پنل خود را از دست می‌دهد.'}
	confirmLabel={confirmDeactivate.isActive ? 'بله، فعال کن' : 'بله، غیرفعال کن'}
	intent={confirmDeactivate.isActive ? 'info' : 'danger'}
	onConfirm={confirmToggleActive}
	onClose={() => (confirmDeactivate = { open: false, subId: 0, isActive: false })}
/>

<ImagePreviewModal open={previewImage !== null} src={previewImage?.src ?? null} alt={previewImage?.alt} onClose={() => (previewImage = null)} />

<!-- ── Review confirm dialog ─────────────────────────────────────────── -->
<ConfirmDialog
	open={reviewConfirmOpen}
	title={reviewConfirmStatus === 'approved' ? 'تأیید درخواست شارژ' : 'رد درخواست شارژ'}
	description={reviewConfirmStatus === 'approved'
		? 'با تأیید، گیگابایت از موجودی شما کسر و به زیرفروشنده اضافه می‌شود.'
		: 'آیا از رد این درخواست مطمئن هستید؟'}
	confirmLabel={reviewConfirmStatus === 'approved' ? 'بله، تأیید کن' : 'بله، رد کن'}
	intent={reviewConfirmStatus === 'approved' ? 'info' : 'danger'}
	onConfirm={() => resolveReviewConfirm(true)}
	onClose={() => resolveReviewConfirm(false)}
/>

<style>
	.section-tabs {
		display: flex;
		gap: 6px;
		padding: 0 4px 2px;
		border-bottom: 1px solid var(--va-border);
		margin-bottom: 4px;
		flex-wrap: wrap;
	}

	.table-pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-top: 1px solid var(--va-border);
		color: var(--va-text-muted);
		font: 500 12px var(--va-font-mono);
	}

	.table-pagination div {
		display: flex;
		gap: 6px;
	}

	.section-tab {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		border: none;
		background: none;
		color: var(--va-text-muted);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		transition: color 0.15s, border-color 0.15s;
	}

	.section-tab:hover {
		color: var(--va-text);
	}

	.section-tab.is-active {
		color: var(--va-accent);
		border-bottom-color: var(--va-accent);
	}

	.tab-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 999px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		font-size: 10px;
		font-weight: 700;
	}

	.tab-count.is-badge {
		background: color-mix(in srgb, var(--va-warning) 18%, transparent);
		color: var(--va-warning);
	}

	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 16px;
		border-bottom: 1px solid var(--va-border);
		flex-wrap: wrap;
	}

	.section-title {
		color: var(--va-text);
		font-size: 14px;
		font-weight: 700;
	}

	.capacity-notice {
		margin: 12px 16px 0;
		padding: 9px 12px;
		border: 1px solid color-mix(in srgb, var(--va-warning) 32%, var(--va-border));
		border-radius: 7px;
		background: color-mix(in srgb, var(--va-warning) 8%, transparent);
		color: var(--va-text-muted);
		font-size: 12px;
	}

	.section-sub {
		margin-top: 3px;
		color: var(--va-text-faint);
		font-size: 11px;
	}

	.filter-actions {
		display: flex;
		gap: 8px;
	}

	.sub-username {
		font-weight: 600;
	}

	.date-cell {
		color: var(--va-text-muted);
		font: 500 11px var(--va-font-mono);
		white-space: nowrap;
	}

	.status-pill {
		display: inline-block;
		white-space: nowrap;
		border-radius: 999px;
		padding: 4px 10px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		font-size: 11px;
		font-weight: 700;
	}

	.status-pill.active {
		background: color-mix(in srgb, var(--va-success) 14%, transparent);
		color: var(--va-success);
	}

	.status-pill.inactive {
		background: color-mix(in srgb, var(--va-danger) 14%, transparent);
		color: var(--va-danger);
	}

	.status-pill.approved {
		background: color-mix(in srgb, var(--va-success) 14%, transparent);
		color: var(--va-success);
	}

	.status-pill.rejected {
		background: color-mix(in srgb, var(--va-danger) 14%, transparent);
		color: var(--va-danger);
	}

	.row-actions {
		display: flex;
		gap: 4px;
	}

	.va-icon-btn-danger {
		color: var(--va-danger);
	}

	/* Inspector */
	.detail-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
	}

	.detail-who {
		display: grid;
		gap: 4px;
	}

	.detail-who strong {
		font-size: 14px;
		color: var(--va-text);
	}

	.detail-who span {
		font-size: 11px;
		color: var(--va-text-muted);
	}

	.detail-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		font-size: 12px;
		color: var(--va-text-muted);
	}

	.detail-label {
		color: var(--va-text-faint);
		font: 500 11px var(--va-font-mono);
	}

	.inspector-actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 4px;
	}

	.inspector-actions .admin-btn {
		justify-content: center;
	}

	.receipt-text {
		margin: 0;
		border-radius: 10px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		font-size: 12px;
		line-height: 1.8;
		padding: 10px;
	}

	.receipt-img {
		width: 100%;
		max-height: 220px;
		object-fit: contain;
		border: 1px solid var(--va-border);
		border-radius: 12px;
		background: var(--va-bg-raised);
	}

	.receipt-preview {
		width: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: zoom-in;
	}

	.review-form {
		display: grid;
		gap: 10px;
	}

	.review-actions {
		display: flex;
		gap: 8px;
	}

	.review-actions .admin-btn {
		flex: 1;
		justify-content: center;
	}

	.manager-note-view {
		border-radius: 10px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		font-size: 12px;
		padding: 8px 10px;
	}

	/* Modals */
	.modal-form {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 4px 0 2px;
	}

	.modal-form label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 12px;
		font-weight: 650;
		color: var(--va-text);
	}

	.modal-hint {
		margin: 0;
		font-size: 11.5px;
		color: var(--va-text-faint);
		line-height: 1.7;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 4px;
	}

	.transfer-balance {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		border-radius: 10px;
		background: color-mix(in srgb, var(--va-accent) 10%, transparent);
		color: var(--va-accent);
		font-size: 13px;
	}

	.transfer-balance strong {
		font-weight: 700;
	}

	.password-reveal {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.password-reveal-info {
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}

	.password-reveal-sub {
		margin: 0 0 4px;
		font-size: 12px;
		color: var(--va-text-muted);
	}

	.password-reveal-code {
		display: block;
		padding: 8px 12px;
		border-radius: 8px;
		background: var(--va-bg-raised);
		color: var(--va-text);
		font-size: 16px;
		letter-spacing: 1px;
		border: 1px solid var(--va-border);
		user-select: all;
		margin-top: 4px;
	}
</style>
