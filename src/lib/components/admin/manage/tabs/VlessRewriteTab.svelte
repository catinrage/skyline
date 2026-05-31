<script lang="ts">
	import { toast } from 'svelte-sonner';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import VaCheckbox from '$lib/components/admin/va/VaCheckbox.svelte';
	import { updateVlessRewrites } from '../../../../../routes/manage/page.remote';

	type VlessRewriteFingerprint = 'firefox' | 'chrome' | 'safari' | 'ios' | 'android';
	type Rule = {
		targetInboundId: number | null;
		enabled: boolean;
		address: string;
		port: number;
		tlsEnabled: boolean;
		sni: string;
		fingerprint: VlessRewriteFingerprint;
	};

	type Inbound = { id: number; remark: string | null; protocol: string | null; port: number | null };

	type Props = {
		data: {
			vlessRewriteRules: Rule[];
			inboundOptions: Inbound[];
		};
	};

	let { data }: Props = $props();

	let draft = $state<Rule[]>([]);
	let loadedSignature = $state('');

	const fingerprintOptions: Array<{ value: VlessRewriteFingerprint; label: string }> = [
		{ value: 'firefox', label: 'Firefox' },
		{ value: 'chrome', label: 'Chrome' },
		{ value: 'safari', label: 'Safari' },
		{ value: 'ios', label: 'iOS' },
		{ value: 'android', label: 'Android' }
	];

	function addRule() {
		draft = [
			...draft,
			{
				targetInboundId: null,
				enabled: true,
				address: '',
				port: 443,
				tlsEnabled: true,
				sni: '',
				fingerprint: 'firefox'
			}
		];
	}

	function removeRule(index: number) {
		draft = draft.filter((_, i) => i !== index);
	}

	function serialize() {
		return JSON.stringify(
			draft
				.filter((rule) => rule.address.trim().length > 0)
				.map((rule) => ({
					targetInboundId: rule.targetInboundId,
					enabled: rule.enabled,
					address: rule.address.trim(),
					port: Number(rule.port),
					tlsEnabled: rule.tlsEnabled,
					sni: rule.tlsEnabled ? rule.sni.trim() : '',
					fingerprint: rule.fingerprint
				}))
		);
	}

	async function handleSubmit(submit: () => Promise<void>) {
		await submit();
		const result = updateVlessRewrites.result;
		if (result?.rewriteSuccess) toast.success(result.rewriteSuccess);
		if (result?.rewriteError) toast.error(result.rewriteError);
	}

	$effect(() => {
		const signature = JSON.stringify(data.vlessRewriteRules);
		if (signature === loadedSignature) return;
		loadedSignature = signature;
		draft = data.vlessRewriteRules.map((rule) => ({ ...rule }));
	});
</script>

<form
	{...updateVlessRewrites.enhance(async ({ submit }) => {
		await handleSubmit(submit);
	})}
	class="rewrite-form"
>
	<input type="hidden" name="rulesJson" value={serialize()} />

	<div class="rewrite-actions">
		<button type="button" class="admin-btn admin-btn-ghost">
			<AnimatedIcon name="search" size={13} />
			<span>تست لینک</span>
		</button>
		<button type="button" class="admin-btn admin-btn-primary" onclick={addRule}>
			<AnimatedIcon name="plus-network" size={13} />
			<span>قانون جدید</span>
		</button>
	</div>

	<div class="rewrite-note">
		<AnimatedIcon name="cloud" size={14} />
		<div>
			<p class="rewrite-note-title">چه زمانی به این نیاز دارید؟</p>
			<p class="rewrite-note-desc">
				وقتی x-ui روی پورت داخلی مثل ۴۶۹۷۵ سرو می‌کند ولی CDN/Nginx جلویش روی ۴۴۳ ترافیک می‌گیرد،
				آدرس و پورت خروجی را اینجا تغییر دهید و TLS را فعال نگه دارید.
			</p>
		</div>
		<div class="rewrite-note-meta">
			<span>{draft.filter((rule) => rule.enabled).length.toLocaleString('fa-IR-u-nu-latn')} قانون فعال</span>
			<span>{draft.length.toLocaleString('fa-IR-u-nu-latn')} قانون کل</span>
		</div>
	</div>

	<div class="rules-list">
		{#each draft as rule, index (`rewrite-${index}`)}
			<div class="va-card rule-card" class:is-disabled={!rule.enabled}>
				<div class="rule-head">
					<span class="rule-index">#{String(index + 1).padStart(2, '0')}</span>
					<div class="rule-title">
						<div>
							{rule.targetInboundId === null ? 'همه ورودی‌ها' : data.inboundOptions.find((inbound) => inbound.id === rule.targetInboundId)?.remark ?? `Inbound #${rule.targetInboundId}`}
						</div>
						<p dir="ltr">
							{rule.tlsEnabled ? 'tls://' : 'tcp://'}{rule.address || '—'}:{rule.port || '—'}
							{rule.tlsEnabled && rule.sni ? ` · sni=${rule.sni}` : ''}
							{rule.tlsEnabled ? ` · fp=${rule.fingerprint}` : ''}
						</p>
					</div>
					<VaCheckbox variant="switch" bind:checked={rule.enabled} ariaLabel="فعال بودن قانون" />
					<button type="button" class="va-icon-btn danger" onclick={() => removeRule(index)} aria-label="حذف قانون">
						<AnimatedIcon name="spark-down" size={13} />
					</button>
				</div>

				<div class="rule-grid">
					<div class="field-block">
						<div class="va-section-label">اعمال روی</div>
						<div class="va-field-shell">
							<select id={`rule-inbound-${index}`} bind:value={rule.targetInboundId}>
								<option value={null}>همه ورودی‌ها</option>
								{#each data.inboundOptions as inbound (inbound.id)}
									<option value={inbound.id}>
										{inbound.remark || 'بدون نام'} - #{inbound.id} - {inbound.protocol || '?'}:{inbound.port ?? '-'}
									</option>
								{/each}
							</select>
						</div>
					</div>

					<div class="field-block">
						<div class="va-section-label">آدرس</div>
						<div class="va-field-shell">
							<input id={`rule-address-${index}`} type="text" bind:value={rule.address} placeholder="snapp.ir" dir="ltr" />
						</div>
					</div>

					<div class="field-block">
						<div class="va-section-label">پورت</div>
						<div class="va-field-shell">
							<input id={`rule-port-${index}`} type="number" min="1" max="65535" bind:value={rule.port} dir="ltr" />
						</div>
					</div>

					<div class="field-block">
						<div class="va-section-label">TLS</div>
						<div class="va-field-shell">
							<select id={`rule-tls-${index}`} bind:value={rule.tlsEnabled}>
								<option value={true}>فعال</option>
								<option value={false}>غیرفعال</option>
							</select>
						</div>
					</div>

					<div class="field-block">
						<div class="va-section-label">SNI</div>
						<div class="va-field-shell">
							<input id={`rule-sni-${index}`} type="text" bind:value={rule.sni} disabled={!rule.tlsEnabled} placeholder="sky-01.example.com" dir="ltr" />
						</div>
					</div>

					<div class="field-block">
						<div class="va-section-label">Fingerprint</div>
						<div class="va-field-shell">
							<select id={`rule-fp-${index}`} bind:value={rule.fingerprint} disabled={!rule.tlsEnabled}>
								{#each fingerprintOptions as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</div>
					</div>
				</div>
			</div>
		{/each}

		{#if draft.length === 0}
			<div class="va-card rules-empty">
				<AnimatedIcon name="cloud" size={32} active />
				<p>هیچ قانون تغییر کانفیگی تعریف نشده. برای شروع یک قانون اضافه کنید.</p>
				<button type="button" class="admin-btn admin-btn-primary" onclick={addRule}>افزودن قانون</button>
			</div>
		{/if}
	</div>

	<div class="rules-actions">
		<button type="button" class="admin-btn admin-btn-ghost" onclick={addRule}>
			<AnimatedIcon name="plus-network" size={13} />
			<span>افزودن قانون</span>
		</button>
		<button type="submit" class="admin-btn admin-btn-primary" disabled={updateVlessRewrites.pending > 0}>
			<AnimatedIcon name="check" size={13} />
			<span>{updateVlessRewrites.pending > 0 ? 'در حال ذخیره...' : 'ذخیره قوانین'}</span>
		</button>
	</div>
</form>

<style>
	.rewrite-form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.rewrite-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.rewrite-note {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		padding: 14px 16px;
		border: 1px solid var(--va-border);
		border-inline-start: 3px solid var(--va-accent);
		border-radius: 8px;
		background: var(--va-bg-panel);
		color: var(--va-text);
	}

	.rewrite-note > div:nth-child(2) {
		flex: 1;
		min-width: 0;
	}

	.rewrite-note-title {
		margin: 0;
		color: var(--va-text);
		font-size: 13px;
		font-weight: 500;
	}

	.rewrite-note-desc {
		margin: 6px 0 0;
		color: var(--va-text-muted);
		font-size: 12px;
		line-height: 1.7;
	}

	.rewrite-note-meta {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 6px;
		flex: 0 0 auto;
		color: var(--va-text-faint);
		font: 500 10.5px var(--va-font-mono);
	}

	.rewrite-note-meta span:first-child {
		color: var(--va-success);
	}

	.rules-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.rule-card {
		overflow: hidden;
		padding: 0;
		opacity: 1;
	}

	.rule-card.is-disabled {
		opacity: 0.58;
	}

	.rule-head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-bottom: 1px solid var(--va-border);
	}

	.rule-index {
		min-width: 36px;
		color: var(--va-text-faint);
		font: 500 11px var(--va-font-mono);
	}

	.rule-title {
		flex: 1;
		min-width: 0;
	}

	.rule-title div {
		color: var(--va-text);
		font-size: 13px;
		font-weight: 500;
	}

	.rule-title p {
		margin: 4px 0 0;
		color: var(--va-text-faint);
		font: 500 11px var(--va-font-mono);
		text-align: left;
	}

	.rule-grid {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 10px;
		padding: 14px 16px;
		background: var(--va-bg-raised);
	}

	.field-block {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 0;
	}

	.field-block :global(input),
	.field-block :global(select) {
		padding: 6px 10px;
		font-size: 12px;
	}

	.field-block :global(input:disabled),
	.field-block :global(select:disabled) {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.rules-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		padding: 32px 16px;
		text-align: center;
		color: var(--va-text-muted);
	}

	.rules-empty p {
		margin: 0;
		font-size: 13px;
	}

	.rules-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		flex-wrap: wrap;
	}

	.danger {
		color: var(--va-danger);
	}

	@media (max-width: 1100px) {
		.rule-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@media (max-width: 700px) {
		.rewrite-note,
		.rule-head {
			align-items: stretch;
			flex-direction: column;
		}

		.rewrite-note-meta {
			align-items: flex-start;
		}

		.rule-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
