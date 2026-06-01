<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { formatToman } from '$lib/utils/format';
	import EmptyState from '$lib/components/admin/EmptyState.svelte';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import VaStatRow from '$lib/components/admin/va/VaStatRow.svelte';
	import Modal from '$lib/components/admin/Modal.svelte';
	import InspectorPortal from '$lib/components/admin/InspectorPortal.svelte';
	import ImagePreviewModal from '$lib/components/admin/ImagePreviewModal.svelte';
	import {
		requestCreditPackageCommand,
		requestSubCreditPackageCommand
	} from '../../../../../routes/reseller/page.remote';

	type CreditPackage = {
		id: number;
		quotaGb: number;
		priceToman: number;
		isActive: boolean;
		isPublic?: boolean;
		accessKind?: 'public' | 'group' | 'direct' | 'private';
		eligibleGroupName?: string | null;
	};

	type CreditRequest = {
		id: number;
		packageId: number;
		quotaGbSnapshot: number;
		priceTomanSnapshot: number;
		receiptText: string;
		receiptFileName: string | null;
		receiptMimeType: string | null;
		receiptDataBase64: string | null;
		status: 'pending' | 'approved' | 'rejected';
		managerNote?: string;
		parentNote?: string;
		createdAt: number;
		reviewedAt: number | null;
	};

	type LedgerEntry = {
		id: number;
		type: 'purchase' | 'create' | 'recharge' | 'refund' | 'transfer';
		amountGb: number;
		createdAt: number;
	};

	type Props = {
		data: {
			isSubReseller?: boolean;
			paymentCard?: { cardNumber: string; cardOwnerName: string };
			stats: {
				gbBalance: number;
				totalGbAdded: number;
				totalGbSold: number;
				totalGbRefunded: number;
			};
			creditPackages: CreditPackage[];
			creditRequests: CreditRequest[];
			gbLedger: LedgerEntry[];
		};
		resellerState?: any;
	};

	let { data, resellerState }: Props = $props();

	let selectedPackageId = $state<number | null>(null);
	let selectedRequestId = $state<number | null>(null);
	let buyModalOpen = $state(false);
	let mobileDetailOpen = $state(false);
	let receiptText = $state('');
	let receiptFileName = $state<string | null>(null);
	let receiptMimeType = $state<string | null>(null);
	let receiptDataBase64 = $state<string | null>(null);
	let receiptSizeBytes = $state<number | null>(null);
	let receiptPreviewUrl = $state<string | null>(null);
	let previewImage = $state<{ src: string; alt: string } | null>(null);

	const pageSize = 10;
	let requestsPage = $state(1);
	let ledgerPage = $state(1);

	const isSubReseller = $derived(data.isSubReseller ?? false);
	// The server normalizes a sub-reseller's parent catalog and its own requests into these fields.
	const activePackages = $derived(data.creditPackages);
	const activeRequests = $derived(data.creditRequests);

	const selectedPackage = $derived(
		selectedPackageId !== null
			? activePackages.find((item) => item.id === selectedPackageId) ?? null
			: activePackages[0] ?? null
	);
	const selectedRequest = $derived(
		selectedRequestId !== null
			? activeRequests.find((r) => r.id === selectedRequestId) ?? null
			: null
	);
	const visibleRequests = $derived(activeRequests.slice((requestsPage - 1) * pageSize, requestsPage * pageSize));
	const requestsPages = $derived(Math.max(1, Math.ceil(activeRequests.length / pageSize)));
	const visibleLedger = $derived(data.gbLedger.slice((ledgerPage - 1) * pageSize, ledgerPage * pageSize));
	const ledgerPages = $derived(Math.max(1, Math.ceil(data.gbLedger.length / pageSize)));
	const pendingCount = $derived(activeRequests.filter((r) => r.status === 'pending').length);
	const paymentCard = $derived(data.paymentCard ?? { cardNumber: '', cardOwnerName: '' });
	const hasPaymentCard = $derived(Boolean(paymentCard.cardNumber || paymentCard.cardOwnerName));

	const statItems = $derived([
		{
			label: 'موجودی قابل فروش',
			value: data.stats.gbBalance,
			unit: 'GB',
			delta: isSubReseller ? 'بعد از تأیید فروشنده والد افزایش می‌یابد' : 'بعد از تایید مدیر افزایش می‌یابد',
			deltaTone: data.stats.gbBalance > 0 ? ('success' as const) : ('warning' as const)
		},
		{
			label: 'کل گیگ خریداری‌شده',
			value: data.stats.totalGbAdded,
			unit: 'GB',
			delta: `${pendingCount.toLocaleString('fa-IR-u-nu-latn')} درخواست در انتظار`,
			deltaTone: 'muted' as const
		},
		{
			label: 'فروخته‌شده',
			value: data.stats.totalGbSold,
			unit: 'GB',
			delta: 'ساخت و شارژ مجدد کانفیگ',
			deltaTone: 'muted' as const
		},
		{
			label: 'برگشتی',
			value: data.stats.totalGbRefunded,
			unit: 'GB',
			delta: 'لغو کانفیگ مصرف‌نشده',
			deltaTone: 'success' as const
		}
	]);

	function selectRequest(id: number) {
		selectedRequestId = id;
		if (typeof window !== 'undefined' && window.innerWidth <= 1180) {
			mobileDetailOpen = true;
		}
	}

	function formatDate(timestamp: number) {
		return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(
			new Date(timestamp * 1000)
		);
	}

	function statusLabel(status: CreditRequest['status']) {
		if (status === 'approved') return 'تایید شده';
		if (status === 'rejected') return 'رد شده';
		return 'در انتظار';
	}

	function eventLabel(type: LedgerEntry['type']) {
		if (type === 'purchase') return 'افزایش اعتبار';
		if (type === 'create') return 'ساخت کانفیگ';
		if (type === 'recharge') return 'شارژ مجدد';
		if (type === 'transfer') return 'انتقال گیگ';
		return 'برگشت اعتبار';
	}

	async function copyCardNumber() {
		if (!paymentCard.cardNumber) return;
		try {
			await navigator.clipboard.writeText(paymentCard.cardNumber.replace(/\s+/g, ''));
			toast.success('شماره کارت کپی شد.');
		} catch {
			toast.error('کپی شماره کارت انجام نشد.');
		}
	}

	async function handleReceiptFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		if (!file.type.startsWith('image/')) {
			toast.error('فقط تصویر رسید قابل ارسال است.');
			input.value = '';
			return;
		}

		if (file.size > 5 * 1024 * 1024) {
			toast.error('حجم تصویر رسید باید حداکثر ۵ مگابایت باشد.');
			input.value = '';
			return;
		}

		const dataUrl = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(new Error('خواندن فایل انجام نشد.'));
			reader.readAsDataURL(file);
		});

		if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
		receiptFileName = file.name;
		receiptMimeType = file.type;
		receiptDataBase64 = dataUrl.split(',')[1] ?? '';
		receiptSizeBytes = file.size;
		receiptPreviewUrl = URL.createObjectURL(file);
	}

	function clearReceiptFile() {
		if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
		receiptPreviewUrl = null;
		receiptFileName = null;
		receiptMimeType = null;
		receiptDataBase64 = null;
		receiptSizeBytes = null;
	}

	async function submitRequest() {
		if (!selectedPackage?.id) {
			toast.error('یک بسته شارژ انتخاب کنید.');
			return;
		}

		try {
			const cmd = isSubReseller ? requestSubCreditPackageCommand : requestCreditPackageCommand;
			const result = (await cmd({
				packageId: selectedPackage.id,
				receiptText,
				receiptFileName,
				receiptMimeType,
				receiptDataBase64,
				receiptSizeBytes
			}).updates(resellerState)) as Record<string, unknown> | null;

			if (result?.creditRequestSuccess) {
				toast.success(result.creditRequestSuccess as string);
				receiptText = '';
				clearReceiptFile();
				buyModalOpen = false;
			}
			if (result?.creditRequestError) toast.error(result.creditRequestError as string);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'ثبت درخواست شارژ انجام نشد.');
		}
	}
</script>

<InspectorPortal content={financeInspector} />

<VaStatRow items={statItems} />

<section class="va-card">
	<div class="section-head">
		<div>
			<div class="section-title">درخواست‌های شارژ</div>
			<div class="section-sub">رسیدهای ثبت‌شده و وضعیت بررسی مدیر — روی ردیف کلیک کنید تا جزئیات نمایش داده شود</div>
		</div>
		<button type="button" class="admin-btn admin-btn-primary" onclick={() => (buyModalOpen = true)}>
			<AnimatedIcon name="spark-up" size={13} />
			<span>درخواست جدید</span>
		</button>
	</div>

	{#if activeRequests.length === 0}
		<EmptyState title="درخواستی ثبت نشده" description="برای ثبت اولین درخواست شارژ روی «درخواست جدید» کلیک کنید." icon="inbox" />
	{:else}
		<div class="va-table-wrap">
			<table class="va-table">
				<thead>
					<tr>
						<th>حجم</th>
						<th>قیمت</th>
						<th>وضعیت</th>
						<th>تاریخ</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleRequests as request (request.id)}
						<tr
							class:is-selected={selectedRequest?.id === request.id}
							onclick={() => selectRequest(request.id)}
							style="cursor: pointer"
						>
							<td class="va-mono">{request.quotaGbSnapshot.toLocaleString('fa-IR-u-nu-latn')} GB</td>
							<td class="va-mono">{formatToman(request.priceTomanSnapshot)}</td>
							<td>
								<span class="status-pill {request.status}">{statusLabel(request.status)}</span>
							</td>
							<td class="date-cell">{formatDate(request.createdAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if requestsPages > 1}
			<div class="va-pagination">
				<div>{requestsPage} / {requestsPages}</div>
				<div class="pagination-controls">
					<button
						type="button"
						class="va-icon-btn"
						disabled={requestsPage <= 1}
						onclick={() => (requestsPage = Math.max(1, requestsPage - 1))}
					>
						<span class="pagination-prev-icon"><AnimatedIcon name="chevron-left" size={13} /></span>
					</button>
					<button
						type="button"
						class="va-icon-btn next-page"
						disabled={requestsPage >= requestsPages}
						onclick={() => (requestsPage = Math.min(requestsPages, requestsPage + 1))}
					>
						<AnimatedIcon name="chevron-left" size={13} />
					</button>
				</div>
			</div>
		{/if}
	{/if}
</section>

<section class="va-card ledger-section">
	<div class="section-head">
		<div>
			<div class="section-title">دفتر اعتبار گیگابایت</div>
			<div class="section-sub">هر افزایش، فروش، شارژ مجدد یا برگشت اعتبار اینجا ثبت می‌شود.</div>
		</div>
	</div>

	{#if data.gbLedger.length === 0}
		<EmptyState title="رویدادی ثبت نشده" description="بعد از تایید اولین شارژ، دفتر اعتبار شما فعال می‌شود." icon="inbox" />
	{:else}
		<div class="va-table-wrap">
			<table class="va-table">
				<thead>
					<tr>
						<th>رویداد</th>
						<th>مقدار</th>
						<th>زمان</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleLedger as entry (entry.id)}
						<tr>
							<td>{eventLabel(entry.type)}</td>
							<td class="amount va-mono" class:positive={entry.amountGb > 0} class:negative={entry.amountGb < 0}>
								{entry.amountGb > 0 ? '+' : ''}{entry.amountGb.toLocaleString('fa-IR-u-nu-latn')} GB
							</td>
							<td class="date-cell">{formatDate(entry.createdAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if ledgerPages > 1}
			<div class="va-pagination">
				<div>{ledgerPage} / {ledgerPages}</div>
				<div class="pagination-controls">
					<button
						type="button"
						class="va-icon-btn"
						disabled={ledgerPage <= 1}
						onclick={() => (ledgerPage = Math.max(1, ledgerPage - 1))}
					>
						<span class="pagination-prev-icon"><AnimatedIcon name="chevron-left" size={13} /></span>
					</button>
					<button
						type="button"
						class="va-icon-btn next-page"
						disabled={ledgerPage >= ledgerPages}
						onclick={() => (ledgerPage = Math.min(ledgerPages, ledgerPage + 1))}
					>
						<AnimatedIcon name="chevron-left" size={13} />
					</button>
				</div>
			</div>
		{/if}
	{/if}
</section>

{#snippet requestDetailContent()}
	{#if selectedRequest}
		<div class="detail-row">
			<span class="detail-label">حجم</span>
			<span class="va-mono">{selectedRequest.quotaGbSnapshot.toLocaleString('fa-IR-u-nu-latn')} GB</span>
		</div>
		<div class="detail-row">
			<span class="detail-label">قیمت</span>
			<span class="va-mono">{formatToman(selectedRequest.priceTomanSnapshot)} تومان</span>
		</div>
		<div class="detail-row">
			<span class="detail-label">تاریخ درخواست</span>
			<span>{formatDate(selectedRequest.createdAt)}</span>
		</div>
		{#if selectedRequest.reviewedAt}
			<div class="detail-row">
				<span class="detail-label">تاریخ بررسی</span>
				<span>{formatDate(selectedRequest.reviewedAt)}</span>
			</div>
		{/if}
		<div class="detail-row">
			<span class="detail-label">وضعیت</span>
			<span class="status-pill {selectedRequest.status}">{statusLabel(selectedRequest.status)}</span>
		</div>

		{#if selectedRequest.receiptText}
			<div>
				<div class="va-section-label">متن رسید</div>
				<p class="receipt-text">{selectedRequest.receiptText}</p>
			</div>
		{/if}

		{#if selectedRequest.receiptDataBase64 && selectedRequest.receiptMimeType}
			<div>
				<div class="va-section-label">تصویر رسید</div>
				<button type="button" class="receipt-preview" onclick={() => (previewImage = { src: `data:${selectedRequest.receiptMimeType};base64,${selectedRequest.receiptDataBase64}`, alt: selectedRequest.receiptFileName ?? 'رسید پرداخت' })}>
					<img src={`data:${selectedRequest.receiptMimeType};base64,${selectedRequest.receiptDataBase64}`} alt={selectedRequest.receiptFileName ?? 'رسید پرداخت'} class="receipt-img" />
				</button>
			</div>
		{/if}

		{#if selectedRequest.managerNote || selectedRequest.parentNote}
			<div>
				<div class="va-section-label">یادداشت</div>
				<div class="manager-note-view">{selectedRequest.managerNote ?? selectedRequest.parentNote}</div>
			</div>
		{/if}
	{:else}
		<EmptyState
			title="ردیفی انتخاب نشده"
			description="روی یک درخواست از جدول کلیک کنید تا رسید و جزئیات آن اینجا نمایش داده شود."
			icon="inbox"
		/>
	{/if}
{/snippet}

{#snippet financeInspector()}
<aside class="va-inspector">
	<div class="va-inspector-head">
		<AnimatedIcon name="spark-up" size={20} active />
		<div>
			<p class="va-inspector-title">جزئیات درخواست</p>
			<p class="va-inspector-sub">رسید و وضعیت بررسی مدیر</p>
		</div>
	</div>

	<div class="va-inspector-body">
		{@render requestDetailContent()}
	</div>
</aside>
{/snippet}

<Modal
	open={mobileDetailOpen && selectedRequest !== null}
	title="جزئیات درخواست"
	eyebrow="رسید و وضعیت بررسی"
	onClose={() => { mobileDetailOpen = false; }}
>
	{#if selectedRequest}
		<div class="mobile-detail-body">
			{@render requestDetailContent()}
		</div>
	{/if}
</Modal>

<Modal
	open={buyModalOpen}
	title="درخواست شارژ جدید"
	eyebrow="خرید اعتبار گیگابایت"
	onClose={() => { buyModalOpen = false; }}
>
	<div class="buy-modal-body">
		{#if activePackages.length === 0}
			<EmptyState
				title="بسته شارژی تعریف نشده"
				description={isSubReseller ? 'فروشنده والد هنوز بسته‌ای تعریف نکرده است.' : 'مدیر هنوز بسته‌های خرید گیگابایت را فعال نکرده است.'}
				icon="inbox"
			/>
		{:else}
			<div class="va-section-label">بسته شارژ</div>
			<div class="package-grid">
				{#each activePackages as item (item.id)}
					<button
						type="button"
						class="package-card"
						class:is-selected={selectedPackage?.id === item.id}
						onclick={() => (selectedPackageId = item.id)}
					>
						<strong>{item.quotaGb.toLocaleString('fa-IR-u-nu-latn')} GB</strong>
						<span>{formatToman(item.priceToman)} تومان</span>
						{#if !isSubReseller && item.accessKind === 'group'}
							<small class="targeted-offer">ویژه گروه: {item.eligibleGroupName ?? 'گروه شما'}</small>
						{:else if !isSubReseller && item.accessKind === 'direct'}
							<small class="targeted-offer">اختصاصی شما</small>
						{/if}
					</button>
				{/each}
			</div>

			<div class="payment-target-card" class:is-empty={!hasPaymentCard}>
				<div class="payment-target-icon">
					<AnimatedIcon name="ticket" size={18} />
				</div>
				<div class="payment-target-main">
					<span>{isSubReseller ? 'کارت فروشنده والد' : 'کارت مدیر'}</span>
					<strong dir="ltr">{paymentCard.cardNumber || 'شماره کارت ثبت نشده'}</strong>
					<small>{paymentCard.cardOwnerName || 'نام صاحب کارت ثبت نشده'}</small>
				</div>
				<button
					type="button"
					class="admin-btn admin-btn-ghost"
					disabled={!paymentCard.cardNumber}
					onclick={copyCardNumber}
				>
					<span class="mdi mdi-content-copy"></span>
					<span>کپی کارت</span>
				</button>
			</div>

			<div class="va-section-label">رسید پرداخت</div>
			<textarea
				bind:value={receiptText}
				placeholder="شماره پیگیری، کارت مقصد، زمان پرداخت..."
			></textarea>

			{#if receiptPreviewUrl}
				<div class="img-preview-wrap">
					<img src={receiptPreviewUrl} alt={receiptFileName ?? 'رسید'} class="img-preview" />
					<button type="button" class="img-remove-btn" onclick={clearReceiptFile} aria-label="حذف تصویر">
						<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
							<line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
							<line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
						</svg>
					</button>
				</div>
			{:else}
				<label class="upload-card" for="receipt-file-modal">
					<AnimatedIcon name="cloud" size={15} />
					<span>تصویر رسید بانکی، اختیاری</span>
					<input id="receipt-file-modal" type="file" accept="image/png,image/jpeg,image/webp" onchange={handleReceiptFile} />
				</label>
			{/if}

			<div class="summary-row">
				<span class="detail-label">بسته انتخابی</span>
				<strong class="va-mono">
					{selectedPackage ? `${selectedPackage.quotaGb} GB · ${formatToman(selectedPackage.priceToman)} تومان` : '—'}
				</strong>
			</div>

			<button
				type="button"
				class="admin-btn admin-btn-primary full-width"
				disabled={requestCreditPackageCommand.pending > 0 || requestSubCreditPackageCommand.pending > 0}
				onclick={submitRequest}
			>
				<AnimatedIcon name="check" size={13} />
				<span>{(requestCreditPackageCommand.pending > 0 || requestSubCreditPackageCommand.pending > 0) ? 'در حال ارسال...' : 'ثبت درخواست شارژ'}</span>
			</button>
		{/if}
	</div>
</Modal>

<style>
	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 16px;
		border-bottom: 1px solid var(--va-border);
	}

	.section-title {
		color: var(--va-text);
		font-size: 14px;
		font-weight: 700;
	}

	.section-sub {
		margin-top: 3px;
		color: var(--va-text-faint);
		font-size: 11px;
	}

	.ledger-section {
		overflow: visible;
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

	.status-pill.approved {
		background: color-mix(in srgb, var(--va-success) 14%, transparent);
		color: var(--va-success);
	}

	.status-pill.rejected {
		background: color-mix(in srgb, var(--va-danger) 14%, transparent);
		color: var(--va-danger);
	}

	.amount {
		font-weight: 800;
	}

	.amount.positive { color: var(--va-success); }
	.amount.negative { color: var(--va-warning); }

	.va-pagination {
		padding: 10px 14px;
		border-top: 1px solid var(--va-border);
	}

	.pagination-controls {
		display: flex;
		gap: 4px;
	}

	.next-page {
		transform: rotate(180deg);
	}

	/* Mobile detail modal */
	.mobile-detail-body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 4px 0 2px;
	}

	/* Modal body */
	.buy-modal-body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 4px 0 2px;
	}

	.detail-row {
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

	.manager-note-view {
		border-radius: 10px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		font-size: 12px;
		padding: 8px 10px;
	}

	.package-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap: 8px;
	}

	.package-card {
		display: grid;
		gap: 5px;
		padding: 12px;
		border: 1px solid var(--va-border);
		border-radius: 12px;
		background: var(--va-bg-raised);
		color: var(--va-text);
		cursor: pointer;
		text-align: right;
		transition: border-color 0.16s ease, background-color 0.16s ease;
	}

	.package-card:hover,
	.package-card.is-selected {
		border-color: var(--va-accent);
		background: var(--va-accent-soft);
	}

	.package-card strong {
		font: 800 18px var(--va-font-mono);
	}

	.package-card span {
		color: var(--va-text-muted);
		font-size: 11px;
	}

	.package-card .targeted-offer {
		display: inline-flex;
		width: fit-content;
		border-radius: 5px;
		background: color-mix(in srgb, var(--va-accent) 12%, transparent);
		color: var(--va-accent);
		padding: 3px 6px;
		font-size: 10px;
		font-weight: 700;
	}

	.payment-target-card {
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr) auto;
		align-items: center;
		gap: 12px;
		border: 1px solid color-mix(in srgb, var(--va-accent) 26%, var(--va-border));
		border-radius: 16px;
		background:
			linear-gradient(135deg, color-mix(in srgb, var(--va-accent) 13%, transparent), transparent 62%),
			var(--va-bg-raised);
		padding: 12px;
	}

	.payment-target-card.is-empty {
		border-color: var(--va-border);
		background: var(--va-bg-raised);
	}

	.payment-target-icon {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border-radius: 13px;
		background: var(--va-accent-soft);
		color: var(--va-accent);
	}

	.payment-target-main {
		display: grid;
		gap: 3px;
		min-width: 0;
	}

	.payment-target-main span,
	.payment-target-main small {
		color: var(--va-text-faint);
		font-size: 11px;
	}

	.payment-target-main strong {
		color: var(--va-text);
		font: 800 16px var(--va-font-mono);
		letter-spacing: 0;
		overflow-wrap: anywhere;
	}

	textarea {
		width: 100%;
		min-height: 80px;
		resize: vertical;
		border: 1px solid var(--va-border);
		border-radius: 10px;
		background: var(--va-bg-panel);
		color: var(--va-text);
		font: 500 13px var(--va-font-fa);
		padding: 10px 12px;
		box-sizing: border-box;
	}

	.upload-card {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border: 1px dashed var(--va-border-strong);
		border-radius: 10px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		cursor: pointer;
		font-size: 12px;
	}

	.upload-card input {
		display: none;
	}

	.img-preview-wrap {
		position: relative;
		align-self: flex-start;
	}

	.img-preview {
		display: block;
		width: 100%;
		max-height: 220px;
		object-fit: contain;
		border: 1px solid var(--va-border);
		border-radius: 12px;
		background: var(--va-bg-raised);
	}

	.img-remove-btn {
		position: absolute;
		top: 7px;
		left: 7px;
		width: 22px;
		height: 22px;
		border-radius: 999px;
		border: 1px solid var(--va-border-strong);
		background: var(--va-bg-panel);
		color: var(--va-text-muted);
		display: grid;
		place-items: center;
		cursor: pointer;
		transition: background-color 0.14s ease, color 0.14s ease;
	}

	.img-remove-btn:hover {
		background: color-mix(in srgb, var(--va-danger) 16%, var(--va-bg-panel));
		color: var(--va-danger);
		border-color: var(--va-danger);
	}

	.summary-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 12px;
		border: 1px solid var(--va-border);
		border-radius: 10px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		font-size: 12px;
	}

	.full-width {
		width: 100%;
		justify-content: center;
	}
	.receipt-preview {
		width: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: zoom-in;
	}

	@media (max-width: 640px) {
		.payment-target-card {
			grid-template-columns: 44px minmax(0, 1fr);
		}

		.payment-target-card :global(.admin-btn) {
			grid-column: 1 / -1;
			justify-content: center;
		}
	}
</style>

<ImagePreviewModal open={previewImage !== null} src={previewImage?.src ?? null} alt={previewImage?.alt} onClose={() => (previewImage = null)} />
