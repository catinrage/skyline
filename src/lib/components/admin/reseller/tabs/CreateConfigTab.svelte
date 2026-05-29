<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import Modal from '$lib/components/admin/Modal.svelte';
	import VaStatRow from '$lib/components/admin/va/VaStatRow.svelte';
	import { formatToman } from '$lib/utils/format';
	import {
		createCustomConfigCommand,
		createTemplateCommand,
		deleteTemplateCommand
	} from '../../../../../routes/reseller/page.remote';

	type Template = {
		id: number;
		name: string;
		quotaGb: number;
		durationDays: number;
		priceToman: number;
	};
	type InboundOption = { id: number; remark: string | null; protocol: string | null; port: number | null };

	type Props = {
		data: {
			salesEnabled: boolean;
			stats: { gbBalance: number; totalGbSold: number };
			templates: Template[];
			availableInbounds: InboundOption[];
		};
		resellerState: any;
	};

	let { data, resellerState }: Props = $props();

	let quotaGb = $state(2);
	let durationDays = $state(30);
	let priceToman = $state(0);
	let inboundId = $state<number | null>(null);
	let selectedTemplateId = $state<number | null>(null);
	let customerLabel = $state('');
	let internalNote = $state('');
	let templateName = $state('');
	let templateQuotaGb = $state(10);
	let templateDurationDays = $state(30);
	let templatePriceToman = $state(0);
	let templateModalOpen = $state(false);

	$effect(() => {
		if (!data.availableInbounds.some((inbound) => inbound.id === inboundId)) {
			inboundId = data.availableInbounds[0]?.id ?? null;
		}
	});

	const canCreate = $derived(
		data.salesEnabled &&
			inboundId !== null &&
			Number.isInteger(quotaGb) &&
			quotaGb > 1 &&
			quotaGb <= 50 &&
			Number.isInteger(durationDays) &&
			durationDays >= 1 &&
			durationDays <= 365 &&
			Number.isInteger(priceToman) &&
			priceToman >= 0 &&
			data.stats.gbBalance >= quotaGb
	);
	const statItems = $derived([
		{
			label: 'موجودی GB',
			value: data.stats.gbBalance.toLocaleString('fa-IR-u-nu-latn'),
			unit: 'GB',
			delta: 'اعتبار قابل مصرف برای فروش',
			deltaTone: data.stats.gbBalance > 0 ? ('success' as const) : ('warning' as const)
		},
		{
			label: 'مصرف این سفارش',
			value: Number.isFinite(quotaGb) ? quotaGb.toLocaleString('fa-IR-u-nu-latn') : '۰',
			unit: 'GB',
			delta: 'از موجودی کم می‌شود',
			deltaTone: 'muted' as const
		},
		{
			label: 'باقی‌مانده بعد ساخت',
			value: Math.max(0, data.stats.gbBalance - (Number.isFinite(quotaGb) ? quotaGb : 0)).toLocaleString('fa-IR-u-nu-latn'),
			unit: 'GB',
			delta: 'محاسبه لحظه‌ای',
			deltaTone: data.stats.gbBalance >= quotaGb ? ('success' as const) : ('danger' as const)
		},
		{
			label: 'مدت کانفیگ',
			value: durationDays.toLocaleString('fa-IR-u-nu-latn'),
			unit: 'روز',
			delta: data.availableInbounds.find((inbound) => inbound.id === inboundId)?.remark ?? 'سرور انتخابی',
			deltaTone: 'muted' as const
		}
	]);

	const selectedTemplate = $derived(
		selectedTemplateId ? data.templates.find((item) => item.id === selectedTemplateId) ?? null : null
	);

	function basePath() {
		const m = page.url.pathname.match(/^\/([^/]+)\/reseller(?:\/|$)/);
		return m ? `/${m[1]}/reseller` : '/reseller';
	}

	function validateQuota() {
		if (!inboundId) {
			toast.error('یک سرور مجاز برای ساخت کانفیگ انتخاب کنید.');
			return false;
		}
		if (!Number.isInteger(quotaGb) || quotaGb <= 1 || quotaGb > 50) {
			toast.error('حجم باید عدد صحیح بین ۲ تا ۵۰ گیگابایت باشد.');
			return false;
		}

		if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
			toast.error('مدت باید عدد صحیح بین ۱ تا ۳۶۵ روز باشد.');
			return false;
		}

		if (!Number.isInteger(priceToman) || priceToman < 0) {
			toast.error('قیمت فروش نمی‌تواند منفی باشد.');
			return false;
		}

		if (data.stats.gbBalance < quotaGb) {
			toast.error('موجودی گیگابایت شما برای این سفارش کافی نیست.');
			return false;
		}

		return true;
	}

	function selectTemplate(template: Template) {
		selectedTemplateId = template.id;
		quotaGb = template.quotaGb;
		durationDays = template.durationDays;
		priceToman = template.priceToman;
	}

	function selectCustom() {
		selectedTemplateId = null;
	}

	async function handleCreate() {
		if (!validateQuota()) return;

		try {
			const result = (await createCustomConfigCommand({
				inboundId: inboundId!,
				quotaGb,
				durationDays,
				priceToman,
				templateId: selectedTemplateId,
				customerLabel,
				internalNote
			}).updates(resellerState)) as Record<string, unknown> | null;

			if (result?.createSuccess) {
				toast.success('کانفیگ ساخته شد و از موجودی GB شما کسر شد.');
				customerLabel = '';
				internalNote = '';
				void goto(`${basePath()}/configs`);
			}
			if (result?.createError) toast.error(result.createError as string);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'ساخت کانفیگ انجام نشد.');
		}
	}

	async function handleCreateTemplate() {
		try {
			const result = (await createTemplateCommand({
				name: templateName,
				quotaGb: templateQuotaGb,
				durationDays: templateDurationDays,
				priceToman: templatePriceToman
			}).updates(resellerState)) as Record<string, unknown> | null;

			if (result?.templateSuccess) {
				toast.success(result.templateSuccess as string);
				templateName = '';
				templateModalOpen = false;
			}
			if (result?.templateError) toast.error(result.templateError as string);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'ذخیره قالب انجام نشد.');
		}
	}

	async function handleDeleteTemplate(id: number) {
		try {
			const result = (await deleteTemplateCommand({ id }).updates(resellerState)) as Record<string, unknown> | null;
			if (result?.templateSuccess) {
				toast.success(result.templateSuccess as string);
				if (selectedTemplateId === id) selectCustom();
			}
			if (result?.templateError) toast.error(result.templateError as string);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'حذف قالب انجام نشد.');
		}
	}
</script>

<div class="create-config">
	<VaStatRow items={statItems} />

	{#if !data.salesEnabled || data.availableInbounds.length === 0}
		<div class="va-card disabled-card">
			<AnimatedIcon name="shield" size={18} />
			<div>
				<strong>{data.salesEnabled ? 'سرور مجازی برای ساخت در دسترس نیست' : 'فروش کانفیگ متوقف است'}</strong>
				<span>{data.salesEnabled ? 'برای دسترسی به سرور ساخت با مدیر تماس بگیرید.' : 'مدیر فروش کانفیگ را موقتاً متوقف کرده است.'}</span>
			</div>
		</div>
	{:else}
		<div class="create-grid">
			<section class="va-card order-card">
				<div class="section-head">
					<div>
						<div class="va-section-label">مشخصات کانفیگ</div>
						<h3>سفارش جدید مشتری</h3>
					</div>
					<button type="button" class="admin-btn admin-btn-ghost" onclick={() => (templateModalOpen = true)}>
						<AnimatedIcon name="plus-network" size={13} />
						<span>قالب‌ها</span>
					</button>
				</div>

				<div class="template-strip">
					<button type="button" class:is-active={selectedTemplateId === null} onclick={selectCustom}>
						<AnimatedIcon name="plus-network" size={13} />
						<span>دلخواه</span>
					</button>
					{#each data.templates as template (template.id)}
						<button type="button" class:is-active={selectedTemplateId === template.id} onclick={() => selectTemplate(template)}>
							<strong>{template.name}</strong>
							<span>{template.quotaGb}GB · {template.durationDays}D</span>
						</button>
					{/each}
				</div>

				<label class="field destination-field">
					<span>مقصد ساخت <small>الزامی</small></span>
					<select bind:value={inboundId} aria-label="مقصد ساخت">
						{#each data.availableInbounds as inbound (inbound.id)}
							<option value={inbound.id}>{inbound.remark || `Inbound #${inbound.id}`}{inbound.port ? ` - ${inbound.port}` : ''}</option>
						{/each}
					</select>
				</label>

				<div class="quota-picker">
					{#each [2, 5, 10, 20, 30, 50] as amount}
						<button type="button" class:is-active={selectedTemplateId === null && quotaGb === amount} onclick={() => { selectCustom(); quotaGb = amount; }}>
							{amount} GB
						</button>
					{/each}
				</div>

				<div class="custom-grid">
					<label class="field">
						<span>حجم دقیق</span>
						<div class="input-unit">
							<input type="number" min="2" max="50" step="1" bind:value={quotaGb} oninput={selectCustom} />
							<strong>GB</strong>
						</div>
					</label>
					<label class="field">
						<span>مدت</span>
						<div class="input-unit">
							<input type="number" min="1" max="365" step="1" bind:value={durationDays} oninput={selectCustom} />
							<strong>روز</strong>
						</div>
					</label>
					<label class="field">
						<span>قیمت فروش</span>
						<div class="input-unit">
							<input type="number" min="0" step="1000" bind:value={priceToman} oninput={selectCustom} />
							<strong>تومان</strong>
						</div>
					</label>
				</div>
				<p class="hint">
					موجودی شما {data.stats.gbBalance.toLocaleString('fa-IR-u-nu-latn')} گیگ است؛ قیمت فروش فقط برای یادآوری شما ذخیره می‌شود.
				</p>

				<div class="form-divider"></div>
				<div class="va-section-label">اطلاعات مشتری</div>
				<div class="customer-grid">
				<label>
					<span>نام مشتری <small>اختیاری</small></span>
					<input type="text" bind:value={customerLabel} placeholder="مثلاً علی رضایی" />
				</label>
				<label>
					<span>یادداشت داخلی</span>
					<textarea bind:value={internalNote} placeholder="این یادداشت فقط در پنل شما نمایش داده می‌شود..."></textarea>
				</label>
				</div>
			</section>

			<aside class="va-card summary-card">
				<div class="summary-icon">
					<AnimatedIcon name="plus-network" size={22} active />
				</div>
				<h3>تایید ساخت کانفیگ</h3>
				<div class="summary-list">
					<div><span>حجم</span><strong>{quotaGb || 0} GB</strong></div>
					<div><span>مدت</span><strong>{durationDays || 0} روز</strong></div>
					<div><span>قیمت فروش</span><strong>{formatToman(priceToman || 0)} تومان</strong></div>
					<div><span>قالب</span><strong>{selectedTemplate?.name ?? 'دلخواه'}</strong></div>
					<div><span>سرور</span><strong>{data.availableInbounds.find((inbound) => inbound.id === inboundId)?.remark ?? 'انتخاب نشده'}</strong></div>
					<div><span>مشتری</span><strong>{customerLabel.trim() || 'نام خودکار'}</strong></div>
					<div><span>موجودی بعد ساخت</span><strong>{Math.max(0, data.stats.gbBalance - (quotaGb || 0))} GB</strong></div>
				</div>
				<button
					type="button"
					class="admin-btn admin-btn-primary full-width"
					disabled={!canCreate || createCustomConfigCommand.pending > 0}
					onclick={handleCreate}
				>
					<AnimatedIcon name="check" size={13} />
					<span>{createCustomConfigCommand.pending > 0 ? 'در حال ساخت...' : 'ساخت کانفیگ'}</span>
				</button>
			</aside>
		</div>
	{/if}
</div>

<Modal open={templateModalOpen} title="قالب‌های سریع" eyebrow="ساخت کانفیگ" onClose={() => (templateModalOpen = false)}>
	<div class="template-modal-form">
		<label class="field">
			<span>نام قالب</span>
			<input type="text" bind:value={templateName} placeholder="مثلاً ماهانه ۱۰ گیگ" />
		</label>
		<div class="template-values">
			<label class="field"><span>حجم GB</span><input type="number" min="2" max="50" step="1" bind:value={templateQuotaGb} /></label>
			<label class="field"><span>روز</span><input type="number" min="1" max="365" step="1" bind:value={templateDurationDays} /></label>
			<label class="field"><span>قیمت</span><input type="number" min="0" step="1000" bind:value={templatePriceToman} /></label>
		</div>
		<button type="button" class="admin-btn admin-btn-primary full-width" disabled={createTemplateCommand.pending > 0} onclick={handleCreateTemplate}>
			<AnimatedIcon name="check" size={13} />
			<span>{createTemplateCommand.pending > 0 ? 'در حال ذخیره...' : 'ذخیره قالب'}</span>
		</button>
	</div>
	{#if data.templates.length}
		<div class="template-list">
			{#each data.templates as template (template.id)}
				<div class="template-row">
					<div>
						<strong>{template.name}</strong>
						<span>{template.quotaGb}GB · {template.durationDays} روز · {formatToman(template.priceToman)} تومان</span>
					</div>
					<button type="button" class="va-icon-btn" aria-label="حذف قالب" onclick={() => handleDeleteTemplate(template.id)}>
						<span class="mdi mdi-trash-can-outline"></span>
					</button>
				</div>
			{/each}
		</div>
	{/if}
</Modal>

<style>
	.create-config {
		display: grid;
		gap: 18px;
	}

	.create-grid {
		display: grid;
		grid-template-columns: minmax(440px, 1fr) minmax(280px, 360px);
		gap: 16px;
		align-items: start;
	}

	.order-card,
	.summary-card,
	.disabled-card {
		padding: 18px;
	}

	.disabled-card {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.disabled-card div {
		display: grid;
		gap: 4px;
	}

	.disabled-card span,
	.hint {
		color: var(--va-text-faint);
		font-size: 12px;
		line-height: 1.8;
	}

	.section-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 16px;
	}

	.section-head h3,
	.summary-card h3 {
		margin: 4px 0 0;
		color: var(--va-text);
		font-size: 18px;
	}

	.destination-field {
		margin-bottom: 14px;
	}

	.quota-picker {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin-bottom: 12px;
	}

	.template-strip {
		display: flex;
		gap: 10px;
		overflow-x: auto;
		padding-bottom: 8px;
		margin-bottom: 12px;
		scrollbar-width: thin;
	}

	.template-strip button {
		min-width: 128px;
		display: grid;
		gap: 4px;
		justify-items: start;
		border: 1px solid var(--va-border);
		border-radius: 16px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		padding: 12px;
		cursor: pointer;
		text-align: start;
		transition:
			border-color 160ms ease,
			background 160ms ease,
			color 160ms ease,
			transform 160ms ease;
	}

	.template-strip button:hover,
	.template-strip button.is-active {
		transform: translateY(-1px);
		border-color: var(--va-accent);
		background: var(--va-accent-soft);
		color: var(--va-accent);
	}

	.template-strip strong {
		font-size: 12px;
	}

	.template-strip span {
		font-size: 11px;
	}

	.quota-picker button {
		border: 1px solid var(--va-border);
		border-radius: 12px;
		background: var(--va-bg-raised);
		color: var(--va-text);
		cursor: pointer;
		font: 800 13px var(--va-font-mono);
		padding: 12px;
		transition: border-color 0.16s ease, background-color 0.16s ease, transform 0.16s ease;
	}

	.quota-picker button:hover,
	.quota-picker button.is-active {
		border-color: var(--va-accent);
		background: var(--va-accent-soft);
		transform: translateY(-1px);
	}

	.field,
	.customer-grid label {
		display: grid;
		gap: 8px;
		color: var(--va-text-muted);
		font-size: 12px;
		font-weight: 700;
	}

	.custom-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}

	.field input,
	.field select,
	.customer-grid input,
	.customer-grid textarea {
		width: 100%;
		min-width: 0;
		border: 1px solid var(--va-border);
		border-radius: 7px;
		background: var(--va-bg-panel);
		color: var(--va-text);
		font: 600 13px var(--va-font-fa);
		padding: 10px 12px;
	}

	.input-unit {
		position: relative;
	}

	.input-unit input {
		padding-inline-end: 46px;
	}

	.input-unit strong {
		position: absolute;
		inset-inline-end: 10px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--va-text-faint);
		font-size: 11px;
	}

	.form-divider {
		height: 1px;
		margin: 18px 0;
		background: var(--va-border);
	}

	.customer-grid {
		display: grid;
		grid-template-columns: minmax(180px, 0.7fr) minmax(230px, 1fr);
		gap: 14px;
		margin-top: 12px;
	}

	.customer-grid textarea {
		min-height: 84px;
		resize: vertical;
	}

	.customer-grid small {
		color: var(--va-text-faint);
	}

	.summary-card {
		display: grid;
		gap: 16px;
		position: sticky;
		top: 10px;
	}

	.summary-icon {
		width: 48px;
		height: 48px;
		display: grid;
		place-items: center;
		border-radius: 16px;
		background: var(--va-accent-soft);
		color: var(--va-accent);
	}

	.summary-list {
		display: grid;
		gap: 1px;
		overflow: hidden;
		border: 1px solid var(--va-border);
		border-radius: 14px;
		background: var(--va-border);
	}

	.summary-list div {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		background: var(--va-bg-raised);
		padding: 12px;
	}

	.summary-list span {
		color: var(--va-text-faint);
	}

	.full-width {
		width: 100%;
		justify-content: center;
	}

	.template-modal-form {
		display: grid;
		gap: 12px;
	}

	.template-values {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}

	.template-list {
		display: grid;
		gap: 8px;
		margin-top: 12px;
	}

	.template-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		border: 1px solid var(--va-border);
		border-radius: 14px;
		background: var(--va-bg-raised);
		padding: 10px 12px;
	}

	.template-row div {
		display: grid;
		gap: 3px;
	}

	.template-row strong {
		color: var(--va-text);
		font-size: 12px;
	}

	.template-row span {
		color: var(--va-text-faint);
		font-size: 11px;
	}

	@media (max-width: 920px) {
		.create-grid {
			grid-template-columns: 1fr;
		}

		.summary-card {
			position: static;
		}
	}

	@media (max-width: 640px) {
		.section-head,
		.customer-grid {
			grid-template-columns: 1fr;
		}

		.section-head {
			display: grid;
		}

		.custom-grid,
		.template-values {
			grid-template-columns: 1fr;
		}
	}
</style>
