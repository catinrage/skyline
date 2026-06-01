<script lang="ts">
	import { toast } from 'svelte-sonner';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import EmptyState from '$lib/components/admin/EmptyState.svelte';
	import InspectorPortal from '$lib/components/admin/InspectorPortal.svelte';
	import ConfigCreatePanel from '$lib/components/admin/shared/ConfigCreatePanel.svelte';
	import { formatToman } from '$lib/utils/format';
	import {
		createAdminConfigCommand,
		createManagerTemplateCommand,
		deleteManagerTemplateCommand
	} from '../../../../../routes/manage/page.remote';

	type InboundOption = {
		id: number;
		remark: string | null;
		protocol?: string | null;
		port?: number | null;
		enable?: boolean;
	};
	type Template = {
		id: number;
		name: string;
		quotaGb: number;
		durationDays: number;
		priceToman: number;
	};
	type Config = {
		id: number;
		customerLabel: string;
		xuiEmail: string;
		xuiClientUuid: string;
		xuiInboundId: number;
		quotaGbSnapshot: number;
		durationDaysSnapshot: number;
		priceTomanSnapshot: number;
		createdAt: number;
		status: string;
		configUrl: string | null;
	};
	type Props = {
		data: { inboundOptions: InboundOption[]; managerConfigTemplates: Template[]; managerConfigs: Config[] };
		manageState: any;
	};

	let { data, manageState }: Props = $props();
	let selectedId = $state<number | null>(null);
	let page = $state(1);
	const pageSize = 10;
	const totalPages = $derived(Math.max(1, Math.ceil(data.managerConfigs.length / pageSize)));
	const visible = $derived(data.managerConfigs.slice((page - 1) * pageSize, page * pageSize));
	const availableInbounds = $derived(data.inboundOptions.filter((inbound) => inbound.enable !== false));
	const createData = $derived({
		salesEnabled: true,
		stats: { gbBalance: Number.MAX_SAFE_INTEGER, totalGbSold: 0 },
		templates: data.managerConfigTemplates,
		availableInbounds
	});
	const selected = $derived(
		(selectedId === null ? null : data.managerConfigs.find((config) => config.id === selectedId)) ??
			data.managerConfigs[0] ??
			null
	);

	function formatDate(timestamp: number) {
		return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp * 1000));
	}

	async function copy(value: string) {
		await navigator.clipboard.writeText(value);
		toast.success('کپی شد.');
	}
</script>

<InspectorPortal content={managerConfigInspector} />

<ConfigCreatePanel
	mode="manager"
	data={createData}
	stateTarget={manageState}
	createCommand={createAdminConfigCommand}
	createTemplateCommand={createManagerTemplateCommand}
	deleteTemplateCommand={deleteManagerTemplateCommand}
/>

<section class="va-card manager-configs">
	<div class="section-head">
		<div>
			<div class="section-title">کانفیگ‌های مدیر</div>
			<div class="section-sub">این کانفیگ‌ها متعلق به حساب داخلی مدیر هستند و موجودی فروشندگان را مصرف نمی‌کنند.</div>
		</div>
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
			<div class="detail-row"><span>قیمت فروش</span><strong>{formatToman(selected.priceTomanSnapshot)} تومان</strong></div>
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

<style>
	.manager-configs { margin-top: 18px; overflow: hidden; padding: 0; }
	.section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px; border-bottom: 1px solid var(--va-border); }
	.section-title { color: var(--va-text); font-size: 14px; font-weight: 700; }
	.section-sub { color: var(--va-text-faint); font-size: 11px; margin-top: 4px; }
	tr { cursor: pointer; }
	.va-pagination { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-top: 1px solid var(--va-border); }
	.pagination-controls { display: flex; gap: 6px; }
	.detail-row { display: flex; justify-content: space-between; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--va-border); font-size: 12px; }
	h3 { margin: 0 0 10px; font-size: 15px; }
	.full { width: 100%; justify-content: center; }
</style>
