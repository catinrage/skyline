<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { formatToman } from '$lib/utils/format';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import EmptyState from '$lib/components/admin/EmptyState.svelte';
	import InspectorPortal from '$lib/components/admin/InspectorPortal.svelte';
	import Modal from '$lib/components/admin/Modal.svelte';
	import VaStatRow from '$lib/components/admin/va/VaStatRow.svelte';
	import {
		createCreditPackage,
		setCreditPackageAccessCommand,
		setCreditPackageVisibilityCommand,
		toggleCreditPackage,
		updateCreditPackage
	} from '../../../../../routes/manage/page.remote';

	type CreditPackage = {
		id: number;
		quotaGb: number;
		priceToman: number;
		isActive: boolean;
		isPublic: boolean;
		groupAccessIds: number[];
		resellerAccessIds: number[];
		createdAt: number;
		updatedAt: number;
	};

	type Props = {
		data: {
			resellerCreditPackages: CreditPackage[];
			resellerGroups: Array<{ id: number; name: string; color: string }>;
			resellerAccounts: Array<{
				id: number;
				username: string;
				parentResellerId: number | null;
				isSystemManager: boolean;
			}>;
		};
	};

	let { data }: Props = $props();

	// ── Credit packages state ────────────────────────────────────────────────────
	let selectedId = $state<number | null>(null);
	let createOpen = $state(false);
	let page = $state(1);
	const pageSize = 10;

	const pages = $derived(Math.max(1, Math.ceil(data.resellerCreditPackages.length / pageSize)));
	const packages = $derived(data.resellerCreditPackages.slice((page - 1) * pageSize, page * pageSize));
	const selected = $derived(
		selectedId !== null
			? data.resellerCreditPackages.find((item) => item.id === selectedId) ?? null
			: data.resellerCreditPackages[0] ?? null
	);
	const directResellers = $derived(
		data.resellerAccounts.filter((item) => item.parentResellerId === null && !item.isSystemManager)
	);
	const activeCount = $derived(data.resellerCreditPackages.filter((item) => item.isActive).length);
	const privateCount = $derived(data.resellerCreditPackages.filter((item) => !item.isPublic).length);
	const statItems = $derived([
		{
			label: 'بسته‌های فعال',
			value: activeCount.toLocaleString('fa-IR-u-nu-latn'),
			delta: `${data.resellerCreditPackages.length.toLocaleString('fa-IR-u-nu-latn')} بسته تعریف‌شده`,
			deltaTone: 'success' as const
		},
		{
			label: 'بسته‌های خصوصی',
			value: privateCount.toLocaleString('fa-IR-u-nu-latn'),
			delta: 'پیشنهادهای هدفمند',
			deltaTone: privateCount ? ('warning' as const) : ('muted' as const)
		},
		{
			label: 'بیشترین حجم',
			value: Math.max(...data.resellerCreditPackages.map((item) => item.quotaGb), 0).toLocaleString('fa-IR-u-nu-latn'),
			unit: 'GB',
			delta: 'کاتالوگ فروش',
			deltaTone: 'muted' as const
		}
	]);


	// ── Helpers ──────────────────────────────────────────────────────────────────
	function formatDate(timestamp: number) {
		return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(
			new Date(timestamp * 1000)
		);
	}

	function currencyValue(value: number) {
		return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
	}

	function formatCurrencyInput(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const digits = input.value
			.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
			.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
			.replace(/[^\d]/g, '');
		input.value = digits ? new Intl.NumberFormat('en-US').format(Number(digits)) : '';
	}

	// ── Credit package handlers ──────────────────────────────────────────────────
	async function create(submit: () => Promise<void>) {
		await submit();
		if (createCreditPackage.result?.creditPackageSuccess) {
			toast.success(createCreditPackage.result.creditPackageSuccess);
			createOpen = false;
		}
		if (createCreditPackage.result?.creditPackageError) toast.error(createCreditPackage.result.creditPackageError);
	}

	let visibilityPending = $state(false);
	let accessPendingKey = $state<string | null>(null);

	async function setVisibility(item: CreditPackage) {
		visibilityPending = true;
		try {
			const result = await setCreditPackageVisibilityCommand({ id: item.id, isPublic: !item.isPublic });
			if (result?.creditPackageSuccess) toast.success(result.creditPackageSuccess);
			if (result?.creditPackageError) toast.error(result.creditPackageError);
		} finally {
			visibilityPending = false;
		}
	}

	async function setAccess(item: CreditPackage, type: 'group' | 'reseller', id: number, enabled: boolean) {
		const key = `${type}-${id}`;
		accessPendingKey = key;
		try {
			const result = await setCreditPackageAccessCommand({
				packageId: item.id,
				targetType: type,
				targetId: id,
				enabled
			});
			if (result?.creditPackageSuccess) toast.success(result.creditPackageSuccess);
			if (result?.creditPackageError) toast.error(result.creditPackageError);
		} finally {
			accessPendingKey = null;
		}
	}


</script>

<InspectorPortal content={packageInspector} />
<VaStatRow items={statItems} />

<!-- ── Credit packages ─────────────────────────────────────────────────────── -->
<section class="va-card packages-panel">
	<div class="panel-head">
		<div>
			<div class="panel-title">بسته‌های خرید گیگابایت</div>
			<div class="panel-sub">بسته‌های عمومی و پیشنهادهای خصوصی برای فروشندگان مستقیم.</div>
		</div>
		<button type="button" class="admin-btn admin-btn-primary" onclick={() => (createOpen = true)}>
			<AnimatedIcon name="plus-network" size={13} /><span>بسته جدید</span>
		</button>
	</div>

	{#if data.resellerCreditPackages.length === 0}
		<EmptyState title="بسته‌ای تعریف نشده" description="اولین بسته شارژ را بسازید." icon="inbox" />
	{:else}
		<div class="va-table-wrap">
			<table class="va-table">
				<thead><tr><th>حجم</th><th>قیمت</th><th>نمایش</th><th>وضعیت</th><th>آخرین تغییر</th></tr></thead>
				<tbody>
					{#each packages as item (item.id)}
						<tr class:is-selected={selected?.id === item.id} onclick={() => (selectedId = item.id)}>
							<td class="va-mono">{item.quotaGb.toLocaleString('fa-IR-u-nu-latn')} GB</td>
							<td class="va-mono">{formatToman(item.priceToman)} تومان</td>
							<td><span class="badge" class:private={!item.isPublic}>{item.isPublic ? 'عمومی' : 'خصوصی'}</span></td>
							<td>{item.isActive ? 'فعال' : 'غیرفعال'}</td>
							<td>{formatDate(item.updatedAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="va-pagination">
			<span>{page} / {pages}</span>
			<div>
				<button type="button" class="va-icon-btn" disabled={page <= 1} onclick={() => page--}><span class="pagination-prev-icon"><AnimatedIcon name="chevron-left" size={13} /></span></button>
				<button type="button" class="va-icon-btn" disabled={page >= pages} onclick={() => page++}><AnimatedIcon name="chevron-left" size={13} /></button>
			</div>
		</div>
	{/if}
</section>

<!-- ── Package inspector (side panel) ─────────────────────────────────────── -->
{#snippet packageInspector()}
	<aside class="va-inspector">
		<div class="va-inspector-head">
			<AnimatedIcon name="ticket" size={20} active />
			<div>
				<p class="va-inspector-title">تنظیم فروش GB</p>
				<p class="va-inspector-sub">ویرایش بسته و مخاطبان بسته خصوصی</p>
			</div>
		</div>
		<div class="va-inspector-body">
			{#if selected}
				{@const editForm = updateCreditPackage.for(selected.id)}
				<form {...editForm.enhance(async ({ submit }) => {
					await submit();
					if (editForm.result?.creditPackageUpdateSuccess) toast.success(editForm.result.creditPackageUpdateSuccess);
					if (editForm.result?.creditPackageUpdateError) toast.error(editForm.result.creditPackageUpdateError);
				})} class="panel-form">
					<input type="hidden" name="id" value={selected.id} />
					<div class="va-section-label">ویرایش بسته</div>
					<div class="field-grid">
						<div class="va-field-shell"><input type="number" name="quotaGb" min="1" value={selected.quotaGb} /><span class="va-field-suffix">GB</span></div>
						<div class="va-field-shell"><input type="text" inputmode="numeric" name="priceToman" value={currencyValue(selected.priceToman)} oninput={formatCurrencyInput} /><span class="va-field-suffix">تومان</span></div>
					</div>
					<button type="submit" class="admin-btn admin-btn-ghost full" disabled={editForm.pending > 0}>
						{editForm.pending > 0 ? 'در حال ذخیره...' : 'ذخیره بسته'}
					</button>
				</form>

				{@const activeForm = toggleCreditPackage.for(selected.id)}
				<form {...activeForm.enhance(async ({ submit }) => {
					await submit();
					if (activeForm.result?.creditPackageToggleSuccess) toast.success(activeForm.result.creditPackageToggleSuccess);
					if (activeForm.result?.creditPackageToggleError) toast.error(activeForm.result.creditPackageToggleError);
				})} class="action-form">
					<input type="hidden" name="id" value={selected.id} />
					<input type="hidden" name="enabled" value={selected.isActive ? 'false' : 'true'} />
					<button type="submit" class="admin-btn admin-btn-ghost full" disabled={activeForm.pending > 0}>
						<AnimatedIcon name={selected.isActive ? 'toggle' : 'check'} size={13} />
						<span>{activeForm.pending > 0 ? 'در حال اجرا...' : selected.isActive ? 'غیرفعال کردن بسته' : 'فعال کردن بسته'}</span>
					</button>
				</form>

				<div class="access-panel">
					<div class="va-section-label">دسترسی خرید</div>
					<button type="button" class="admin-btn admin-btn-ghost full" onclick={() => setVisibility(selected)} disabled={visibilityPending}>
						{#if visibilityPending}<span class="btn-spinner" aria-hidden="true"></span>{/if}
						<AnimatedIcon name="toggle" size={13} />
						<span>{visibilityPending ? 'در حال تغییر...' : selected.isPublic ? 'تبدیل به خصوصی' : 'تبدیل به عمومی'}</span>
					</button>
					{#if !selected.isPublic}
						<p>بسته خصوصی بدون مخاطب به شکل پیش‌نویس پنهان باقی می‌ماند.</p>
						<div class="va-section-label">گروه‌ها</div>
						{#each data.resellerGroups as group (group.id)}
							{@const granted = selected.groupAccessIds.includes(group.id)}
							{@const isPending = accessPendingKey === `group-${group.id}`}
							<button type="button" class="grant" class:is-granted={granted} onclick={() => setAccess(selected, 'group', group.id, !granted)} disabled={isPending || accessPendingKey !== null}>
								<span>{group.name}</span>
								<strong>{isPending ? '...' : granted ? 'حذف' : 'افزودن'}</strong>
							</button>
						{:else}
							<p>گروهی تعریف نشده است.</p>
						{/each}
						<div class="va-section-label">فروشندگان مستقیم</div>
						{#each directResellers as reseller (reseller.id)}
							{@const granted = selected.resellerAccessIds.includes(reseller.id)}
							{@const isPending = accessPendingKey === `reseller-${reseller.id}`}
							<button type="button" class="grant" class:is-granted={granted} onclick={() => setAccess(selected, 'reseller', reseller.id, !granted)} disabled={isPending || accessPendingKey !== null}>
								<span>{reseller.username}</span>
								<strong>{isPending ? '...' : granted ? 'حذف' : 'افزودن'}</strong>
							</button>
						{:else}
							<p>فروشنده مستقیمی ثبت نشده است.</p>
						{/each}
					{/if}
				</div>
			{:else}
				<EmptyState title="بسته‌ای انتخاب نشده" description="یک بسته را از جدول انتخاب کنید." icon="inbox" />
			{/if}
		</div>
	</aside>
{/snippet}

<!-- ── Create credit package modal ────────────────────────────────────────── -->
<Modal open={createOpen} title="بسته شارژ جدید" eyebrow="خرید گیگابایت" onClose={() => (createOpen = false)}>
	<form {...createCreditPackage.enhance(async ({ submit }) => create(submit))} class="panel-form">
		<div class="field-grid">
			<div class="va-field-shell"><input type="number" name="quotaGb" min="1" placeholder="مثلاً 25" /><span class="va-field-suffix">GB</span></div>
			<div class="va-field-shell"><input type="text" inputmode="numeric" name="priceToman" placeholder="3,750,000" oninput={formatCurrencyInput} /><span class="va-field-suffix">تومان</span></div>
		</div>
		<label class="select-field"><span>نوع نمایش</span><select class="admin-field" name="isPublic"><option value="true">عمومی</option><option value="false">خصوصی</option></select></label>
		<button type="submit" class="admin-btn admin-btn-primary full" disabled={createCreditPackage.pending > 0}>
			<AnimatedIcon name="check" size={13} />
			<span>{createCreditPackage.pending > 0 ? 'در حال ساخت...' : 'ساخت بسته'}</span>
		</button>
	</form>
</Modal>

<style>
	.packages-panel { overflow: hidden; padding: 0; }
	.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px; border-bottom: 1px solid var(--va-border); }
	.panel-title { color: var(--va-text); font-size: 14px; font-weight: 800; }
	.panel-sub, .access-panel p, .hint { margin: 4px 0 0; color: var(--va-text-faint); font-size: 11px; line-height: 1.7; }
	tr { cursor: pointer; }
	.badge { display: inline-flex; border-radius: 5px; padding: 3px 8px; background: color-mix(in srgb, var(--va-success) 12%, transparent); color: var(--va-success); font-size: 11px; font-weight: 700; }
	.badge.private { background: color-mix(in srgb, var(--va-warning) 14%, transparent); color: var(--va-warning); }
	.badge.inactive { background: color-mix(in srgb, var(--va-text-faint) 12%, transparent); color: var(--va-text-faint); }
	.va-pagination { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-top: 1px solid var(--va-border); }
	.va-pagination div { display: flex; gap: 6px; }
	.panel-form, .access-panel { display: grid; gap: 10px; }
	.panel-form { padding: 12px; border: 1px solid var(--va-border); border-radius: 8px; background: var(--va-bg-raised); }
	.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
	.full { width: 100%; justify-content: center; }
	.action-form, .inline-form { margin-top: 10px; }
	.access-panel { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--va-border); }
	.grant { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 8px 10px; border: 1px solid var(--va-border); border-radius: 7px; background: var(--va-bg-raised); color: var(--va-text); font: 500 12px var(--va-font-fa); cursor: pointer; }
	.grant:disabled { opacity: 0.5; cursor: not-allowed; }
	.grant.is-granted { border-color: color-mix(in srgb, var(--va-accent) 44%, var(--va-border)); background: var(--va-accent-soft); }
	.grant strong { color: var(--va-accent); font-size: 11px; }
	.grant.is-granted strong { color: var(--va-danger); }
	.select-field { display: grid; gap: 5px; color: var(--va-text-muted); font-size: 11px; }
	.btn-spinner {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 2px solid currentColor;
		border-top-color: transparent;
		animation: spin 0.6s linear infinite;
		flex-shrink: 0;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
	@media (max-width: 620px) { .field-grid { grid-template-columns: 1fr; } }
</style>
