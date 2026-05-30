<script lang="ts">
	import { toast } from 'svelte-sonner';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import EmptyState from '$lib/components/admin/EmptyState.svelte';
	import InspectorPortal from '$lib/components/admin/InspectorPortal.svelte';
	import Modal from '$lib/components/admin/Modal.svelte';
	import { createAdminConfigCommand } from '../../../../../routes/manage/page.remote';

	type InboundOption = { id: number; remark: string | null };
	type Config = {
		id: number;
		customerLabel: string;
		xuiEmail: string;
		xuiClientUuid: string;
		xuiInboundId: number;
		quotaGbSnapshot: number;
		durationDaysSnapshot: number;
		createdAt: number;
		status: string;
		configUrl: string | null;
	};
	type Props = { data: { inboundOptions: InboundOption[]; managerConfigs: Config[] }; manageState: any };

	let { data, manageState }: Props = $props();
	let selectedId = $state<number | null>(null);
	let modalOpen = $state(false);
	let inboundId = $state<number | null>(null);
	let quotaGb = $state(10);
	let durationDays = $state(30);
	let customerLabel = $state('');
	let internalNote = $state('');
	let page = $state(1);
	const pageSize = 10;
	const totalPages = $derived(Math.max(1, Math.ceil(data.managerConfigs.length / pageSize)));
	const visible = $derived(data.managerConfigs.slice((page - 1) * pageSize, page * pageSize));
	const selected = $derived(
		(selectedId === null ? null : data.managerConfigs.find((config) => config.id === selectedId)) ??
			data.managerConfigs[0] ??
			null
	);
	const canCreate = $derived(
		inboundId !== null && Number.isFinite(quotaGb) && quotaGb >= 0.01 &&
			Number.isInteger(durationDays) && durationDays > 0
	);

	function formatDate(timestamp: number) {
		return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp * 1000));
	}

	async function copy(value: string) {
		await navigator.clipboard.writeText(value);
		toast.success('کپی شد.');
	}

	async function handleCreate() {
		if (!canCreate || inboundId === null) return;
		const result = (await createAdminConfigCommand({
			inboundId, quotaGb, durationDays, customerLabel, internalNote
		}).updates(manageState)) as Record<string, unknown> | null;
		if (result?.adminCreateError) {
			toast.error(String(result.adminCreateError));
			return;
		}
		toast.success('کانفیگ مدیر ساخته شد.');
		customerLabel = '';
		internalNote = '';
		modalOpen = false;
	}
</script>

<InspectorPortal content={managerConfigInspector} />

<section class="va-card manager-configs">
	<div class="section-head">
		<div>
			<div class="section-title">کانفیگ‌های مدیر</div>
			<div class="section-sub">این کانفیگ‌ها متعلق به حساب داخلی مدیر هستند و موجودی فروشندگان را مصرف نمی‌کنند.</div>
		</div>
		<button type="button" class="admin-btn admin-btn-primary" onclick={() => (modalOpen = true)}>
			<AnimatedIcon name="plus-network" size={13} /><span>کانفیگ جدید</span>
		</button>
	</div>
	{#if data.managerConfigs.length === 0}
		<EmptyState title="کانفیگی ساخته نشده" description="برای ساخت کانفیگ مشتری مدیر از دکمه بالا استفاده کنید." icon="inbox" />
	{:else}
		<div class="va-table-wrap">
			<table class="va-table">
				<thead><tr><th>مشتری</th><th>سرور</th><th>حجم</th><th>مدت</th><th>تاریخ</th></tr></thead>
				<tbody>
					{#each visible as config (config.id)}
						<tr class:is-selected={selected?.id === config.id} onclick={() => (selectedId = config.id)}>
							<td>{config.customerLabel}</td>
							<td>{data.inboundOptions.find((inbound) => inbound.id === config.xuiInboundId)?.remark ?? `#${config.xuiInboundId}`}</td>
							<td class="va-mono">{config.quotaGbSnapshot} GB</td>
							<td class="va-mono">{config.durationDaysSnapshot} روز</td>
							<td>{formatDate(config.createdAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="va-pagination">
			<span>{page} / {totalPages}</span>
			<div class="pagination-controls">
				<button class="va-icon-btn" type="button" disabled={page <= 1} onclick={() => page--} aria-label="صفحه قبل"><span class="pagination-prev-icon"><AnimatedIcon name="chevron-left" size={13} /></span></button>
				<button class="va-icon-btn" type="button" disabled={page >= totalPages} onclick={() => page++} aria-label="صفحه بعد"><AnimatedIcon name="chevron-left" size={13} /></button>
			</div>
		</div>
	{/if}
</section>

{#snippet managerConfigInspector()}
<aside class="va-inspector">
	<div class="va-inspector-head"><AnimatedIcon name="plus-network" size={20} active /><div><p class="va-inspector-title">جزئیات کانفیگ مدیر</p><p class="va-inspector-sub">مالک داخلی مدیریت</p></div></div>
	<div class="va-inspector-body">
		{#if selected}
			<h3>{selected.customerLabel}</h3>
			<div class="detail-row"><span>ایمیل</span><strong dir="ltr">{selected.xuiEmail}</strong></div>
			<div class="detail-row"><span>حجم</span><strong>{selected.quotaGbSnapshot} GB</strong></div>
			<div class="detail-row"><span>مدت</span><strong>{selected.durationDaysSnapshot} روز</strong></div>
			<div class="detail-row"><span>تاریخ</span><strong>{formatDate(selected.createdAt)}</strong></div>
			{#if selected.configUrl}
				<button type="button" class="admin-btn admin-btn-primary full" onclick={() => copy(selected.configUrl!)}>کپی کانفیگ</button>
			{/if}
		{:else}
			<EmptyState title="انتخابی وجود ندارد" description="یک کانفیگ از جدول انتخاب کنید." icon="search" />
		{/if}
	</div>
</aside>
{/snippet}

<Modal open={modalOpen} title="کانفیگ جدید مدیر" eyebrow="مالک داخلی مدیر" onClose={() => (modalOpen = false)}>
	<div class="modal-form">
		<label>سرور<select class="admin-field" bind:value={inboundId}><option value={null}>انتخاب سرور</option>{#each data.inboundOptions as inbound (inbound.id)}<option value={inbound.id}>{inbound.remark || `Inbound #${inbound.id}`}</option>{/each}</select></label>
		<div class="grid"><label>حجم<input class="admin-field" type="number" min="0.01" step="0.01" bind:value={quotaGb} /></label><label>مدت<input class="admin-field" type="number" min="1" bind:value={durationDays} /></label></div>
		<label>نام مشتری<input class="admin-field" type="text" bind:value={customerLabel} /></label>
		<label>یادداشت داخلی<textarea class="admin-field" bind:value={internalNote}></textarea></label>
		<button class="admin-btn admin-btn-primary full" type="button" disabled={!canCreate || createAdminConfigCommand.pending > 0} onclick={handleCreate}>ساخت کانفیگ</button>
	</div>
</Modal>

<style>
	.manager-configs { overflow: hidden; padding: 0; }
	.section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px; border-bottom: 1px solid var(--va-border); }
	.section-title { color: var(--va-text); font-size: 14px; font-weight: 700; }
	.section-sub { color: var(--va-text-faint); font-size: 11px; margin-top: 4px; }
	tr { cursor: pointer; }
	.va-pagination { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-top: 1px solid var(--va-border); }
	.pagination-controls { display: flex; gap: 6px; }
	.detail-row { display: flex; justify-content: space-between; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--va-border); font-size: 12px; }
	h3 { margin: 0 0 10px; font-size: 15px; }
	.modal-form { display: grid; gap: 12px; }
	.modal-form label { display: grid; gap: 6px; color: var(--va-text-muted); font-size: 12px; }
	.modal-form textarea { min-height: 70px; resize: vertical; }
	.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.full { width: 100%; justify-content: center; }
</style>
