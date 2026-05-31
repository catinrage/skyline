<script lang="ts">
	import { toast } from 'svelte-sonner';
	import VaStatRow from '$lib/components/admin/va/VaStatRow.svelte';
	import { toggleFeature, updateFeatureOptions } from '../../../../../routes/manage/page.remote';

	type FeatureGroup = 'operation' | 'user_panel' | 'sales';

	type FeatureFlag = {
		key: string;
		label: string;
		description: string;
		enabled: boolean;
		group?: FeatureGroup;
	};

	type Props = {
		data: {
			featureFlags: FeatureFlag[];
			featureSettings: {
				configIssueReportCooldownMinutes: number;
				latencyTestTargetUrl: string;
				speedTestTargetUrl: string;
			};
		};
	};

	let { data }: Props = $props();
	let expandedSettings = $state<Record<string, boolean>>({});

	const features = $derived(data.featureFlags);
	const activeFeatures = $derived(features.filter((feature) => feature.enabled).length);
	const operationFeatures = $derived(features.filter((feature) => feature.group === 'operation'));
	const statItems = $derived([
		{ label: 'کل ویژگی‌ها', value: features.length.toLocaleString('fa-IR-u-nu-latn'), unit: 'قابلیت', delta: 'بدون وابستگی والد', deltaTone: 'muted' as const },
		{ label: 'فعال', value: activeFeatures.toLocaleString('fa-IR-u-nu-latn'), unit: 'قابلیت', delta: 'قابل استفاده', deltaTone: 'success' as const },
		{ label: 'عملیاتی', value: operationFeatures.length.toLocaleString('fa-IR-u-nu-latn'), unit: 'قابلیت', delta: 'تست و گزارش', deltaTone: 'muted' as const },
		{ label: 'فروش فروشندگان', value: features.find((feature) => feature.key === 'reseller_sales')?.enabled ? 'فعال' : 'غیرفعال', unit: '', delta: 'وضعیت فروش', deltaTone: features.find((feature) => feature.key === 'reseller_sales')?.enabled ? ('success' as const) : ('danger' as const) }
	]);

	function hasSettings(featureKey: string) {
		return featureKey === 'config_issue_report' || featureKey === 'proxy_ping' || featureKey === 'speed_test_widget';
	}

	function groupLabel(group: FeatureGroup | undefined) {
		if (group === 'operation') return 'عملیاتی';
		if (group === 'sales') return 'فروش';
		return 'پنل کاربر';
	}

	function toggleSettings(featureKey: string) {
		expandedSettings = {
			...expandedSettings,
			[featureKey]: !expandedSettings[featureKey]
		};
	}

	async function handleSubmit(form: ReturnType<typeof toggleFeature.for>, submit: () => Promise<void>) {
		await submit();
		const result = form.result;
		if (result?.featureSuccess) toast.success(result.featureSuccess);
		if (result?.featureError) toast.error(result.featureError);
	}

	async function handleSettingsSubmit(
		form: ReturnType<typeof updateFeatureOptions.for>,
		submit: () => Promise<void>
	) {
		await submit();
		const result = form.result;
		if (result?.featureSettingsSuccess) toast.success(result.featureSettingsSuccess);
		if (result?.featureSettingsError) toast.error(result.featureSettingsError);
	}
</script>

<div class="features-va">
	<VaStatRow items={statItems} />

	<div class="features-list">
		{#each features as feature (feature.key)}
			{@const featureForm = toggleFeature.for(feature.key)}
			{@const settingsForm = updateFeatureOptions.for(feature.key)}
			<div class="va-card feature-card">
				<div class="feature-row">
					<form
						{...featureForm.enhance(async ({ submit }) => {
							await handleSubmit(featureForm, submit);
						})}
						class="feature-toggle-form"
					>
						<div class="feature-copy">
							<div class="feature-title-line">
								<span>{feature.label}</span>
								<code>{feature.key}</code>
								<small>{groupLabel(feature.group)}</small>
							</div>
							<p>{feature.description}</p>
						</div>

						<input type="hidden" name="key" value={feature.key} />
						<input type="hidden" name="enabled" value={feature.enabled ? 'false' : 'true'} />

						<button
							type="submit"
							class="feature-switch"
							class:is-on={feature.enabled}
							aria-label={feature.enabled ? 'غیرفعال کردن' : 'فعال کردن'}
						>
							<span></span>
						</button>
					</form>

					{#if hasSettings(feature.key)}
						<button
							type="button"
							class="settings-toggle"
							class:is-open={expandedSettings[feature.key]}
							onclick={() => toggleSettings(feature.key)}
							aria-expanded={expandedSettings[feature.key] ? 'true' : 'false'}
						>
							<span class="mdi mdi-tune-variant"></span>
							تنظیمات
						</button>
					{/if}
				</div>

				{#if hasSettings(feature.key) && expandedSettings[feature.key]}
					<form
						{...settingsForm.enhance(async ({ submit }) => {
							await handleSettingsSubmit(settingsForm, submit);
						})}
						class="feature-settings-row"
					>
						{#if feature.key === 'config_issue_report'}
							<div class="settings-field">
								<label for="config-report-cooldown">فاصله مجاز بین هر گزارش</label>
								<div class="compact-input">
									<input
										id="config-report-cooldown"
										name="configIssueReportCooldownMinutes"
										type="number"
										min="1"
										max="1440"
										value={data.featureSettings.configIssueReportCooldownMinutes}
									/>
									<span>دقیقه</span>
								</div>
							</div>
							<input type="hidden" name="latencyTestTargetUrl" value={data.featureSettings.latencyTestTargetUrl} />
							<input type="hidden" name="speedTestTargetUrl" value={data.featureSettings.speedTestTargetUrl} />
						{:else if feature.key === 'proxy_ping'}
							<input
								type="hidden"
								name="configIssueReportCooldownMinutes"
								value={data.featureSettings.configIssueReportCooldownMinutes}
							/>
							<div class="settings-field wide">
								<label for="latency-test-target">آدرس مقصد تست تاخیر</label>
								<input
									id="latency-test-target"
									name="latencyTestTargetUrl"
									type="url"
									dir="ltr"
									value={data.featureSettings.latencyTestTargetUrl}
									placeholder="https://www.gstatic.com/generate_204"
								/>
							</div>
							<input type="hidden" name="speedTestTargetUrl" value={data.featureSettings.speedTestTargetUrl} />
						{:else if feature.key === 'speed_test_widget'}
							<input
								type="hidden"
								name="configIssueReportCooldownMinutes"
								value={data.featureSettings.configIssueReportCooldownMinutes}
							/>
							<input type="hidden" name="latencyTestTargetUrl" value={data.featureSettings.latencyTestTargetUrl} />
							<div class="settings-field wide">
								<label for="speed-test-target">آدرس فایل تست سرعت</label>
								<input
									id="speed-test-target"
									name="speedTestTargetUrl"
									type="url"
									dir="ltr"
									value={data.featureSettings.speedTestTargetUrl}
									placeholder="http://ipv4.download.thinkbroadband.com/20MB.zip"
								/>
							</div>
						{/if}

						<button type="submit" class="settings-save" disabled={settingsForm.pending > 0}>
							{settingsForm.pending > 0 ? 'در حال ذخیره...' : 'ذخیره'}
						</button>
					</form>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.features-va {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.features-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.feature-card {
		overflow: hidden;
		padding: 0;
	}

	.feature-row,
	.feature-toggle-form {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	.feature-row {
		padding: 14px 18px;
	}

	.feature-toggle-form {
		min-width: 0;
		flex: 1;
	}

	.feature-copy {
		min-width: 0;
		flex: 1;
	}

	.feature-title-line {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
	}

	.feature-title-line span {
		color: var(--va-text);
		font-size: 13.5px;
		font-weight: 500;
	}

	.feature-title-line code,
	.feature-title-line small {
		padding: 1px 6px;
		border-radius: 3px;
		background: var(--va-bg-raised);
		color: var(--va-text-faint);
		font: 500 10px var(--va-font-mono);
	}

	.feature-title-line small {
		color: var(--va-accent);
		font-family: var(--va-font);
	}

	.feature-copy p {
		margin: 6px 0 0;
		color: var(--va-text-muted);
		font-size: 12px;
		line-height: 1.6;
	}

	.feature-switch {
		position: relative;
		width: 32px;
		height: 18px;
		flex: 0 0 auto;
		border: 1px solid var(--va-border);
		border-radius: 999px;
		background: var(--va-bg-raised);
		cursor: pointer;
		transition:
			background-color 0.2s ease,
			border-color 0.2s ease,
			transform 0.2s ease;
	}

	.feature-switch:hover {
		transform: translateY(-1px);
	}

	.feature-switch.is-on {
		border-color: var(--va-accent);
		background: var(--va-accent);
	}

	.feature-switch span {
		position: absolute;
		inset-block-start: 2px;
		inset-inline-end: 16px;
		width: 14px;
		height: 14px;
		border-radius: 999px;
		background: var(--va-bg-panel);
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.22);
		transition: inset-inline-end 0.2s ease;
	}

	.feature-switch.is-on span {
		inset-inline-end: 2px;
	}

	.settings-toggle {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 32px;
		padding: 0 10px;
		border: 1px solid var(--va-border);
		border-radius: 7px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		cursor: pointer;
		font-size: 11.5px;
		font-weight: 700;
		transition:
			background-color 0.2s ease,
			border-color 0.2s ease,
			color 0.2s ease;
	}

	.settings-toggle:hover,
	.settings-toggle.is-open {
		border-color: color-mix(in srgb, var(--va-accent) 40%, var(--va-border));
		background: color-mix(in srgb, var(--va-accent) 10%, var(--va-bg-raised));
		color: var(--va-text);
	}

	.feature-settings-row {
		display: flex;
		align-items: end;
		gap: 8px;
		padding: 10px 14px 12px;
		border-top: 1px dashed var(--va-border);
		background: color-mix(in srgb, var(--va-bg) 65%, transparent);
	}

	.settings-field {
		min-width: 150px;
	}

	.settings-field.wide {
		flex: 1;
	}

	.settings-field label {
		display: block;
		margin-bottom: 4px;
		color: var(--va-text-faint);
		font-size: 10px;
		font-weight: 600;
	}

	.settings-field input,
	.compact-input {
		width: 100%;
		min-height: 30px;
		border: 1px solid var(--va-border);
		border-radius: 6px;
		background: var(--va-bg-panel);
		color: var(--va-text);
	}

	.settings-field input {
		padding: 0 8px;
		font-size: 11px;
		outline: none;
	}

	.settings-field input:focus,
	.compact-input:focus-within {
		border-color: color-mix(in srgb, var(--va-accent) 55%, var(--va-border));
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--va-accent) 12%, transparent);
	}

	.compact-input {
		display: flex;
		align-items: center;
		overflow: hidden;
	}

	.compact-input input {
		min-height: 28px;
		border: 0;
		border-radius: 0;
		background: transparent;
		text-align: center;
	}

	.compact-input span {
		padding-inline: 8px;
		color: var(--va-text-muted);
		font-size: 10px;
		border-inline-start: 1px solid var(--va-border);
	}

	.settings-save {
		min-height: 30px;
		padding: 0 10px;
		border: 1px solid var(--va-border);
		border-radius: 6px;
		background: var(--va-bg-raised);
		color: var(--va-text);
		cursor: pointer;
		font-size: 11px;
		font-weight: 700;
		transition:
			background-color 0.2s ease,
			border-color 0.2s ease,
			transform 0.2s ease;
	}

	.settings-save:hover {
		border-color: color-mix(in srgb, var(--va-accent) 45%, var(--va-border));
		background: color-mix(in srgb, var(--va-accent) 10%, var(--va-bg-raised));
		transform: translateY(-1px);
	}

	@media (max-width: 640px) {
		.feature-row,
		.feature-toggle-form,
		.feature-settings-row {
			align-items: stretch;
			flex-direction: column;
		}

		.settings-toggle,
		.settings-save {
			justify-content: center;
		}
	}
</style>
