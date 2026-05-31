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
		updateCreditPackage,
		createPlan,
		updatePlan,
		togglePlan,
		togglePlanPublic,
		grantPlanAccess,
		revokePlanAccess
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

	type Plan = {
		id: number;
		quotaGb: number;
		durationDays: number;
		priceToman: number;
		inboundId: number;
		inboundRemarkSnapshot: string | null;
		isActive: boolean;
		isPublic: boolean;
		createdAt: number;
		updatedAt: number;
	};

	type PlanAccessEntry = {
		planId: number;
		resellerId: number | null;
		groupId: number | null;
	};

	type Props = {
		data: {
			resellerCreditPackages: CreditPackage[];
			resellerPlans: Plan[];
			planAccessEntries: PlanAccessEntry[];
			resellerGroups: Array<{ id: number; name: string; color: string }>;
			resellerAccounts: Array<{
				id: number;
				username: string;
				parentResellerId: number | null;
				isSystemManager: boolean;
			}>;
			inboundOptions: Array<{ id: number; remark: string | null }>;
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

	// ── VPN plans state ──────────────────────────────────────────────────────────
	let selectedPlanId = $state<number | null>(null);
	let planDetailOpen = $state(false);
	let createPlanOpen = $state(false);
	let planPage = $state(1);

	const planPageSize = 10;
	const planPages = $derived(Math.max(1, Math.ceil(data.resellerPlans.length / planPageSize)));
	const visiblePlans = $derived(data.resellerPlans.slice((planPage - 1) * planPageSize, planPage * planPageSize));
	const selectedPlan = $derived(
		selectedPlanId !== null ? data.resellerPlans.find((p) => p.id === selectedPlanId) ?? null : null
	);
	const planAccessForSelected = $derived(
		selectedPlanId !== null
			? data.planAccessEntries.filter((e) => e.planId === selectedPlanId)
			: []
	);
	const privatePlanCount = $derived(data.resellerPlans.filter((p) => !p.isPublic).length);

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

	function inboundLabel(inboundId: number, snapshot: string | null) {
		const opt = data.inboundOptions.find((o) => o.id === inboundId);
		return opt?.remark ?? snapshot ?? String(inboundId);
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

	async function setVisibility(item: CreditPackage) {
		const result = await setCreditPackageVisibilityCommand({ id: item.id, isPublic: !item.isPublic });
		if (result?.creditPackageSuccess) toast.success(result.creditPackageSuccess);
		if (result?.creditPackageError) toast.error(result.creditPackageError);
	}

	async function setAccess(item: CreditPackage, type: 'group' | 'reseller', id: number, enabled: boolean) {
		const result = await setCreditPackageAccessCommand({
			packageId: item.id,
			targetType: type,
			targetId: id,
			enabled
		});
		if (result?.creditPackageSuccess) toast.success(result.creditPackageSuccess);
		if (result?.creditPackageError) toast.error(result.creditPackageError);
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

<!-- ── VPN plans ───────────────────────────────────────────────────────────── -->
<section class="va-card plans-panel">
	<div class="panel-head">
		<div>
			<div class="panel-title">پلن‌های VPN فروشندگان</div>
			<div class="panel-sub">پلن‌های آماده برای ساخت کانفیگ توسط فروشندگان — عمومی یا با دسترسی خصوصی.</div>
		</div>
		<div class="plan-head-badges">
			{#if privatePlanCount > 0}
				<span class="badge private">{privatePlanCount.toLocaleString('fa-IR-u-nu-latn')} خصوصی</span>
			{/if}
			<button type="button" class="admin-btn admin-btn-primary" onclick={() => (createPlanOpen = true)}>
				<AnimatedIcon name="plus-network" size={13} /><span>پلن جدید</span>
			</button>
		</div>
	</div>

	{#if data.resellerPlans.length === 0}
		<EmptyState title="پلنی تعریف نشده" description="اولین پلن VPN فروشندگان را بسازید." icon="inbox" />
	{:else}
		<div class="va-table-wrap">
			<table class="va-table">
				<thead><tr><th>حجم</th><th>مدت</th><th>قیمت</th><th>سرور</th><th>دسترسی</th><th>وضعیت</th><th>عملیات</th></tr></thead>
				<tbody>
					{#each visiblePlans as plan (plan.id)}
						<tr>
							<td class="va-mono">{plan.quotaGb.toLocaleString('fa-IR-u-nu-latn')} GB</td>
							<td class="va-mono">{plan.durationDays.toLocaleString('fa-IR-u-nu-latn')} روز</td>
							<td class="va-mono">{formatToman(plan.priceToman)} تومان</td>
							<td class="plan-remark">{inboundLabel(plan.inboundId, plan.inboundRemarkSnapshot)}</td>
							<td><span class="badge" class:private={!plan.isPublic}>{plan.isPublic ? 'عمومی' : 'خصوصی'}</span></td>
							<td><span class="badge" class:inactive={!plan.isActive}>{plan.isActive ? 'فعال' : 'غیرفعال'}</span></td>
							<td>
								<button
									type="button"
									class="admin-btn admin-btn-ghost plan-detail-btn"
									onclick={() => { selectedPlanId = plan.id; planDetailOpen = true; }}
								>
									<AnimatedIcon name="chevron-left" size={11} />
									<span>جزئیات</span>
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="va-pagination">
			<span>{planPage} / {planPages}</span>
			<div>
				<button type="button" class="va-icon-btn" disabled={planPage <= 1} onclick={() => planPage--}><span class="pagination-prev-icon"><AnimatedIcon name="chevron-left" size={13} /></span></button>
				<button type="button" class="va-icon-btn" disabled={planPage >= planPages} onclick={() => planPage++}><AnimatedIcon name="chevron-left" size={13} /></button>
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
					<button type="button" class="admin-btn admin-btn-ghost full" onclick={() => setVisibility(selected)}>
						<AnimatedIcon name="toggle" size={13} />
						<span>{selected.isPublic ? 'تبدیل به خصوصی' : 'تبدیل به عمومی'}</span>
					</button>
					{#if !selected.isPublic}
						<p>بسته خصوصی بدون مخاطب به شکل پیش‌نویس پنهان باقی می‌ماند.</p>
						<div class="va-section-label">گروه‌ها</div>
						{#each data.resellerGroups as group (group.id)}
							{@const granted = selected.groupAccessIds.includes(group.id)}
							<button type="button" class="grant" class:is-granted={granted} onclick={() => setAccess(selected, 'group', group.id, !granted)}>
								<span>{group.name}</span><strong>{granted ? 'حذف' : 'افزودن'}</strong>
							</button>
						{:else}
							<p>گروهی تعریف نشده است.</p>
						{/each}
						<div class="va-section-label">فروشندگان مستقیم</div>
						{#each directResellers as reseller (reseller.id)}
							{@const granted = selected.resellerAccessIds.includes(reseller.id)}
							<button type="button" class="grant" class:is-granted={granted} onclick={() => setAccess(selected, 'reseller', reseller.id, !granted)}>
								<span>{reseller.username}</span><strong>{granted ? 'حذف' : 'افزودن'}</strong>
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

<!-- ── Create VPN plan modal ──────────────────────────────────────────────── -->
<Modal open={createPlanOpen} title="پلن VPN جدید" eyebrow="پلن‌های فروشندگان" onClose={() => (createPlanOpen = false)}>
	<form {...createPlan.enhance(async ({ submit }) => {
		await submit();
		if (createPlan.result?.planSuccess) { toast.success(createPlan.result.planSuccess); createPlanOpen = false; }
		if (createPlan.result?.planError) toast.error(createPlan.result.planError);
	})} class="panel-form">
		<div class="field-grid">
			<div class="va-field-shell"><input type="number" name="quotaGb" min="1" placeholder="مثلاً 50" /><span class="va-field-suffix">GB</span></div>
			<div class="va-field-shell"><input type="number" name="durationDays" min="1" placeholder="مثلاً 30" /><span class="va-field-suffix">روز</span></div>
		</div>
		<div class="va-field-shell"><input type="text" inputmode="numeric" name="priceToman" placeholder="5,000,000" oninput={formatCurrencyInput} /><span class="va-field-suffix">تومان</span></div>
		<label class="select-field">
			<span>سرور (inbound)</span>
			<select class="admin-field" name="inboundId">
				{#each data.inboundOptions as opt (opt.id)}
					<option value={opt.id}>{opt.remark ?? `inbound #${opt.id}`}</option>
				{/each}
			</select>
		</label>
		<button type="submit" class="admin-btn admin-btn-primary full" disabled={createPlan.pending > 0}>
			<AnimatedIcon name="check" size={13} />
			<span>{createPlan.pending > 0 ? 'در حال ساخت...' : 'ساخت پلن'}</span>
		</button>
	</form>
</Modal>

<!-- ── VPN plan detail modal ──────────────────────────────────────────────── -->
{#if selectedPlan}
	{@const plan = selectedPlan}
	<Modal open={planDetailOpen} title={`پلن ${plan.quotaGb} GB / ${plan.durationDays} روز`} eyebrow="جزئیات پلن VPN" onClose={() => (planDetailOpen = false)}>
		{@const editPlanForm = updatePlan.for(plan.id)}
		{@const togglePlanForm = togglePlan.for(plan.id)}
		{@const pubForm = togglePlanPublic.for(plan.id)}
		<div class="plan-detail">

			<!-- edit form -->
			<form {...editPlanForm.enhance(async ({ submit }) => {
				await submit();
				if (editPlanForm.result?.planUpdateSuccess) toast.success(editPlanForm.result.planUpdateSuccess);
				if (editPlanForm.result?.planUpdateError) toast.error(editPlanForm.result.planUpdateError);
			})} class="panel-form">
				<input type="hidden" name="id" value={plan.id} />
				<div class="va-section-label">ویرایش پلن</div>
				<div class="field-grid">
					<div class="va-field-shell"><input type="number" name="quotaGb" min="1" value={plan.quotaGb} /><span class="va-field-suffix">GB</span></div>
					<div class="va-field-shell"><input type="number" name="durationDays" min="1" value={plan.durationDays} /><span class="va-field-suffix">روز</span></div>
				</div>
				<div class="va-field-shell"><input type="text" inputmode="numeric" name="priceToman" value={currencyValue(plan.priceToman)} oninput={formatCurrencyInput} /><span class="va-field-suffix">تومان</span></div>
				<label class="select-field">
					<span>سرور</span>
					<select class="admin-field" name="inboundId">
						{#each data.inboundOptions as opt (opt.id)}
							<option value={opt.id} selected={opt.id === plan.inboundId}>{opt.remark ?? `inbound #${opt.id}`}</option>
						{/each}
					</select>
				</label>
				<button type="submit" class="admin-btn admin-btn-ghost full" disabled={editPlanForm.pending > 0}>
					{editPlanForm.pending > 0 ? 'در حال ذخیره...' : 'ذخیره پلن'}
				</button>
			</form>

			<!-- active toggle -->
			<form {...togglePlanForm.enhance(async ({ submit }) => {
				await submit();
				if (togglePlanForm.result?.planToggleSuccess) toast.success(togglePlanForm.result.planToggleSuccess);
				if (togglePlanForm.result?.planToggleError) toast.error(togglePlanForm.result.planToggleError);
			})} class="action-form">
				<input type="hidden" name="id" value={plan.id} />
				<input type="hidden" name="enabled" value={plan.isActive ? 'false' : 'true'} />
				<button type="submit" class="admin-btn admin-btn-ghost full">
					<AnimatedIcon name={plan.isActive ? 'toggle' : 'check'} size={13} />
					<span>{plan.isActive ? 'غیرفعال کردن پلن' : 'فعال کردن پلن'}</span>
				</button>
			</form>

			<!-- public/private toggle -->
			<div class="access-panel">
				<div class="va-section-label">دسترسی پلن</div>
				<form {...pubForm.enhance(async ({ submit }) => {
					await submit();
					if (pubForm.result?.planSuccess) toast.success(pubForm.result.planSuccess);
					if (pubForm.result?.planError) toast.error(pubForm.result.planError);
				})} class="inline-form">
					<input type="hidden" name="id" value={plan.id} />
					<input type="hidden" name="isPublic" value={plan.isPublic ? 'false' : 'true'} />
					<button type="submit" class="admin-btn admin-btn-ghost full">
						<AnimatedIcon name="toggle" size={13} />
						<span>{plan.isPublic ? 'تبدیل به خصوصی' : 'تبدیل به عمومی'}</span>
					</button>
				</form>

				{#if !plan.isPublic}
					<p class="hint">پلن خصوصی فقط برای فروشندگان یا گروه‌های مشخص نمایش داده می‌شود.</p>

					<!-- current access list -->
					{#if planAccessForSelected.length > 0}
						<div class="va-section-label">دسترسی فعلی</div>
						{#each planAccessForSelected as entry, i}
							{@const label = entry.resellerId
								? (data.resellerAccounts.find((r) => r.id === entry.resellerId)?.username ?? `#${entry.resellerId}`)
								: (data.resellerGroups.find((g) => g.id === entry.groupId)?.name ?? `گروه #${entry.groupId}`)}
							{@const kind = entry.resellerId ? 'فروشنده' : 'گروه'}
							{@const revokeForm = revokePlanAccess.for(i + 1)}
							<form {...revokeForm.enhance(async ({ submit }) => {
								await submit();
								if (revokeForm.result?.planSuccess) toast.success(revokeForm.result.planSuccess);
								if (revokeForm.result?.planError) toast.error(revokeForm.result.planError);
							})} class="revoke-row">
								<input type="hidden" name="planId" value={plan.id} />
								{#if entry.resellerId}<input type="hidden" name="resellerId" value={entry.resellerId} />{/if}
								{#if entry.groupId}<input type="hidden" name="groupId" value={entry.groupId} />{/if}
								<div class="revoke-label">
									<span class="kind-tag">{kind}</span>
									<span>{label}</span>
								</div>
								<button type="submit" class="admin-btn danger-sm">لغو</button>
							</form>
						{/each}
					{/if}

					<!-- grant access -->
					{@const grantGroupForm = grantPlanAccess.for(plan.id)}
					{@const grantResellerForm = grantPlanAccess.for(plan.id + 1000000)}
					<div class="va-section-label">افزودن دسترسی</div>
					{#each data.resellerGroups as group (group.id)}
						{@const already = planAccessForSelected.some((e) => e.groupId === group.id)}
						{#if !already}
							<form {...grantGroupForm.enhance(async ({ submit }) => {
								await submit();
								if (grantGroupForm.result?.planSuccess) toast.success(grantGroupForm.result.planSuccess);
								if (grantGroupForm.result?.planError) toast.error(grantGroupForm.result.planError);
							})} class="grant-form">
								<input type="hidden" name="planId" value={plan.id} />
								<input type="hidden" name="groupId" value={group.id} />
								<button type="submit" class="grant">
									<span>{group.name} <em class="kind-tag">گروه</em></span>
									<strong>افزودن</strong>
								</button>
							</form>
						{/if}
					{/each}
					{#each directResellers as reseller (reseller.id)}
						{@const already = planAccessForSelected.some((e) => e.resellerId === reseller.id)}
						{#if !already}
							<form {...grantResellerForm.enhance(async ({ submit }) => {
								await submit();
								if (grantResellerForm.result?.planSuccess) toast.success(grantResellerForm.result.planSuccess);
								if (grantResellerForm.result?.planError) toast.error(grantResellerForm.result.planError);
							})} class="grant-form">
								<input type="hidden" name="planId" value={plan.id} />
								<input type="hidden" name="resellerId" value={reseller.id} />
								<button type="submit" class="grant">
									<span>{reseller.username} <em class="kind-tag">فروشنده</em></span>
									<strong>افزودن</strong>
								</button>
							</form>
						{/if}
					{/each}
					{#if data.resellerGroups.length === 0 && directResellers.length === 0}
						<p class="hint">هیچ گروه یا فروشنده مستقیمی تعریف نشده است.</p>
					{/if}
				{/if}
			</div>
		</div>
	</Modal>
{/if}

<style>
	.packages-panel, .plans-panel { overflow: hidden; padding: 0; }
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
	.grant.is-granted { border-color: color-mix(in srgb, var(--va-accent) 44%, var(--va-border)); background: var(--va-accent-soft); }
	.grant strong { color: var(--va-accent); font-size: 11px; }
	.grant.is-granted strong { color: var(--va-danger); }
	.select-field { display: grid; gap: 5px; color: var(--va-text-muted); font-size: 11px; }
	/* VPN plans */
	.plan-head-badges { display: flex; align-items: center; gap: 8px; }
	.plan-remark { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--va-text-muted); font-size: 11px; }
	.plan-detail-btn { padding: 4px 8px; font-size: 11px; }
	/* Plan detail modal */
	.plan-detail { display: grid; gap: 0; }
	.revoke-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--va-border); }
	.revoke-label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--va-text); }
	.kind-tag { display: inline-block; border-radius: 4px; padding: 1px 5px; background: color-mix(in srgb, var(--va-accent) 14%, transparent); color: var(--va-accent); font-size: 10px; font-style: normal; }
	.grant-form { margin: 0; }
	.grant-form .grant { border-radius: 6px; }
	.danger-sm { padding: 3px 8px; border: 1px solid color-mix(in srgb, var(--va-danger) 30%, var(--va-border)); border-radius: 5px; background: transparent; color: var(--va-danger); font-size: 11px; cursor: pointer; }
	@media (max-width: 620px) { .field-grid { grid-template-columns: 1fr; } }
</style>
