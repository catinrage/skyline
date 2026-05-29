<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { formatToman } from '$lib/utils/format';
	import EmptyState from '$lib/components/admin/EmptyState.svelte';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import VaStatRow from '$lib/components/admin/va/VaStatRow.svelte';
	import ConfirmDialog from '$lib/components/admin/ConfirmDialog.svelte';
	import InspectorPortal from '$lib/components/admin/InspectorPortal.svelte';
	import ImagePreviewModal from '$lib/components/admin/ImagePreviewModal.svelte';
	import { reviewCreditRequest } from '../../../../../routes/manage/page.remote';

	type CreditRequest = {
		id: number;
		resellerId: number;
		resellerUsername: string;
		packageId: number;
		quotaGbSnapshot: number;
		priceTomanSnapshot: number;
		receiptText: string;
		receiptFileName: string | null;
		receiptMimeType: string | null;
		receiptDataBase64: string | null;
		status: 'pending' | 'approved' | 'rejected';
		managerNote: string;
		createdAt: number;
		reviewedAt: number | null;
	};

	type Props = {
		data: {
			resellerCreditRequests: CreditRequest[];
		};
	};

	let { data }: Props = $props();

	let selectedId = $state<number | null>(null);
	let requestFilter = $state<'pending' | 'all'>('pending');
	let reviewConfirmOpen = $state(false);
	let reviewConfirmStatus = $state<'approved' | 'rejected'>('approved');
	let reviewConfirmResolve: ((confirmed: boolean) => void) | null = null;
	let pendingReviewStatus = $state<'approved' | 'rejected' | null>(null);
	let previewImage = $state<{ src: string; alt: string } | null>(null);
	let requestPage = $state(1);
	const pageSize = 10;

	const pendingRequests = $derived(data.resellerCreditRequests.filter((r) => r.status === 'pending'));
	const filteredRequests = $derived(
		requestFilter === 'pending' ? pendingRequests : data.resellerCreditRequests
	);
	const totalPages = $derived(Math.max(1, Math.ceil(filteredRequests.length / pageSize)));
	const visibleRequests = $derived(filteredRequests.slice((requestPage - 1) * pageSize, requestPage * pageSize));
	const selected = $derived(
		selectedId !== null
			? data.resellerCreditRequests.find((r) => r.id === selectedId) ?? null
			: null
	);

	const statItems = $derived([
		{
			label: 'در انتظار بررسی',
			value: pendingRequests.length.toLocaleString('fa-IR-u-nu-latn'),
			delta: 'رسیدهای تأییدنشده',
			deltaTone: pendingRequests.length > 0 ? ('warning' as const) : ('success' as const)
		},
		{
			label: 'کل درخواست‌ها',
			value: data.resellerCreditRequests.length.toLocaleString('fa-IR-u-nu-latn'),
			delta: 'مجموع درخواست‌های ثبت‌شده',
			deltaTone: 'muted' as const
		},
		{
			label: 'تأییدشده',
			value: data.resellerCreditRequests
				.filter((r) => r.status === 'approved')
				.length.toLocaleString('fa-IR-u-nu-latn'),
			delta: 'با موفقیت شارژ شده',
			deltaTone: 'success' as const
		}
	]);

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

	async function handleReview(
		form: ReturnType<typeof reviewCreditRequest.for>,
		submit: () => Promise<void>
	) {
		await submit();
		const result = form.result;
		if (result?.creditRequestReviewSuccess) toast.success(result.creditRequestReviewSuccess);
		if (result?.creditRequestReviewError) toast.error(result.creditRequestReviewError);
	}

	function formatDate(timestamp: number) {
		return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(
			new Date(timestamp * 1000)
		);
	}
</script>

<InspectorPortal content={creditRequestsInspector} />

<VaStatRow items={statItems} />

<section class="va-card">
	<div class="section-head">
		<div>
			<div class="section-title">درخواست‌های شارژ فروشندگان</div>
			<div class="section-sub">روی هر ردیف کلیک کنید تا رسید و گزینه‌های بررسی نمایش داده شود.</div>
		</div>
		<div class="filter-actions">
			<button
				type="button"
				class="va-chip"
				class:is-active={requestFilter === 'pending'}
				onclick={() => { requestFilter = 'pending'; requestPage = 1; }}
			>
				در انتظار
				{#if pendingRequests.length > 0}
					<span class="va-chip-count">{pendingRequests.length}</span>
				{/if}
			</button>
			<button
				type="button"
				class="va-chip"
				class:is-active={requestFilter === 'all'}
				onclick={() => { requestFilter = 'all'; requestPage = 1; }}
			>
				همه
			</button>
		</div>
	</div>

	{#if visibleRequests.length === 0}
		<EmptyState
			title="درخواستی وجود ندارد"
			description="بعد از ارسال رسید توسط فروشنده، اینجا نمایش داده می‌شود."
			icon="inbox"
		/>
	{:else}
		<div class="va-table-wrap">
			<table class="va-table">
				<thead>
					<tr>
						<th>فروشنده</th>
						<th>حجم</th>
						<th>قیمت</th>
						<th>وضعیت</th>
						<th>تاریخ</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleRequests as request (request.id)}
						<tr
							class:is-selected={selected?.id === request.id}
							onclick={() => (selectedId = request.id)}
							style="cursor: pointer"
						>
							<td class="reseller-cell">{request.resellerUsername || `#${request.resellerId}`}</td>
							<td class="va-mono">{request.quotaGbSnapshot.toLocaleString('fa-IR-u-nu-latn')} GB</td>
							<td class="va-mono">{formatToman(request.priceTomanSnapshot)}</td>
							<td>
								<span class="status-pill {request.status}">
									{request.status === 'pending'
										? 'در انتظار'
										: request.status === 'approved'
											? 'تأیید شده'
											: 'رد شده'}
								</span>
							</td>
							<td class="date-cell">{formatDate(request.createdAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="request-pagination">
			<span>{requestPage} / {totalPages}</span>
			<div>
				<button type="button" class="va-icon-btn" disabled={requestPage <= 1} onclick={() => requestPage--}><span class="pagination-prev-icon"><AnimatedIcon name="chevron-left" size={12} /></span></button>
				<button type="button" class="va-icon-btn" disabled={requestPage >= totalPages} onclick={() => requestPage++}><AnimatedIcon name="chevron-left" size={12} /></button>
			</div>
		</div>
	{/if}
</section>

{#snippet creditRequestsInspector()}
<aside class="va-inspector">
	<div class="va-inspector-head">
		<AnimatedIcon name="spark-up" size={20} active />
		<div>
			<p class="va-inspector-title">جزئیات درخواست</p>
			<p class="va-inspector-sub">رسید را بررسی کنید؛ تأیید = افزایش GB فروشنده</p>
		</div>
	</div>

	<div class="va-inspector-body">
		{#if selected}
			<div class="detail-header">
				<div class="detail-who">
					<strong>{selected.resellerUsername || `#${selected.resellerId}`}</strong>
					<span class="va-mono">{selected.quotaGbSnapshot} GB · {formatToman(selected.priceTomanSnapshot)} تومان</span>
				</div>
				<span class="status-pill {selected.status}">
					{selected.status === 'pending' ? 'در انتظار' : selected.status === 'approved' ? 'تأیید شده' : 'رد شده'}
				</span>
			</div>

			<div class="detail-meta">
				<span class="detail-label">تاریخ درخواست</span>
				<span>{formatDate(selected.createdAt)}</span>
			</div>
			{#if selected.reviewedAt}
				<div class="detail-meta">
					<span class="detail-label">تاریخ بررسی</span>
					<span>{formatDate(selected.reviewedAt)}</span>
				</div>
			{/if}

			{#if selected.receiptText}
				<div>
					<div class="va-section-label">متن رسید</div>
					<p class="receipt-text">{selected.receiptText}</p>
				</div>
			{/if}

			{#if selected.receiptDataBase64 && selected.receiptMimeType}
				<div>
					<div class="va-section-label">تصویر رسید</div>
					<button type="button" class="receipt-preview" onclick={() => (previewImage = { src: `data:${selected.receiptMimeType};base64,${selected.receiptDataBase64}`, alt: selected.receiptFileName ?? 'رسید پرداخت' })}>
						<img src={`data:${selected.receiptMimeType};base64,${selected.receiptDataBase64}`} alt={selected.receiptFileName ?? 'رسید پرداخت'} class="receipt-img" />
					</button>
				</div>
			{/if}

			{#if selected.status === 'pending'}
				{@const reviewForm = reviewCreditRequest.for(selected.id)}
				<form
					{...reviewForm.enhance(async ({ submit }) => {
						const status = pendingReviewStatus ?? 'approved';
						pendingReviewStatus = null;
						const confirmed = await awaitReviewConfirm(status);
						if (!confirmed) return;
						await handleReview(reviewForm, submit);
					})}
					class="review-form"
				>
					<input type="hidden" name="id" value={selected.id} />
					<div class="va-section-label">بررسی درخواست</div>
					<input
						class="admin-field"
						type="text"
						name="managerNote"
						placeholder="یادداشت مدیر، اختیاری"
					/>
					<div class="review-actions">
						<button
							type="submit"
							name="status"
							value="approved"
							class="admin-btn admin-btn-primary"
							onclick={() => (pendingReviewStatus = 'approved')}
						>
							<AnimatedIcon name="check" size={13} />
							<span>تأیید</span>
						</button>
						<button
							type="submit"
							name="status"
							value="rejected"
							class="admin-btn admin-btn-ghost"
							onclick={() => (pendingReviewStatus = 'rejected')}
						>رد</button>
					</div>
				</form>
			{:else if selected.managerNote}
				<div>
					<div class="va-section-label">یادداشت مدیر</div>
					<div class="manager-note-view">{selected.managerNote}</div>
				</div>
			{/if}
		{:else}
			<EmptyState
				title="درخواستی انتخاب نشده"
				description="روی یک ردیف از جدول کلیک کنید تا رسید و گزینه‌های بررسی نمایش داده شود."
				icon="inbox"
			/>
		{/if}
	</div>
</aside>
{/snippet}

<ConfirmDialog
	open={reviewConfirmOpen}
	title={reviewConfirmStatus === 'approved' ? 'تأیید درخواست شارژ' : 'رد درخواست شارژ'}
	description={reviewConfirmStatus === 'approved'
		? 'با تأیید، حجم خریداری‌شده به حساب فروشنده اضافه می‌شود.'
		: 'آیا از رد این درخواست مطمئن هستید؟'}
	confirmLabel={reviewConfirmStatus === 'approved' ? 'بله، تأیید کن' : 'بله، رد کن'}
	intent={reviewConfirmStatus === 'approved' ? 'info' : 'danger'}
	onConfirm={() => resolveReviewConfirm(true)}
	onClose={() => resolveReviewConfirm(false)}
/>

<ImagePreviewModal open={previewImage !== null} src={previewImage?.src ?? null} alt={previewImage?.alt} onClose={() => (previewImage = null)} />

<style>
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

	.section-sub {
		margin-top: 3px;
		color: var(--va-text-faint);
		font-size: 11px;
	}

	.filter-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.reseller-cell {
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

	.status-pill.approved {
		background: color-mix(in srgb, var(--va-success) 14%, transparent);
		color: var(--va-success);
	}

	.status-pill.rejected {
		background: color-mix(in srgb, var(--va-danger) 14%, transparent);
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

	.request-pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-top: 1px solid var(--va-border);
		color: var(--va-text-muted);
		font: 500 12px var(--va-font-mono);
	}

	.request-pagination div {
		display: flex;
		gap: 6px;
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
</style>
