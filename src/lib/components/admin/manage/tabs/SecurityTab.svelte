<script lang="ts">
	import { toast } from 'svelte-sonner';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import { updatePanelPaths } from '../../../../../routes/manage/page.remote';

	type Props = {
		data: {
			panelPathSettings: {
				managerBasePath: string;
				resellerBasePath: string;
			};
		};
	};

	let { data }: Props = $props();

	const managerPathPreview = $derived(buildHiddenPanelPath(data.panelPathSettings.managerBasePath, 'manager'));
	const resellerPathPreview = $derived(buildHiddenPanelPath(data.panelPathSettings.resellerBasePath, 'reseller'));
	const hasHiddenPaths = $derived(Boolean(data.panelPathSettings.managerBasePath && data.panelPathSettings.resellerBasePath));

	function buildHiddenPanelPath(basePath: string, panel: 'manager' | 'reseller') {
		const normalized = basePath.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
		return normalized ? `/${normalized}/${panel}` : `/${panel === 'manager' ? 'manage' : 'reseller'}`;
	}

	async function handleSubmit(submit: () => Promise<void>) {
		await submit();
		const result = updatePanelPaths.result;
		if (result?.panelPathSuccess) toast.success(result.panelPathSuccess);
		if (result?.panelPathError) toast.error(result.panelPathError);
	}
</script>

<form
	{...updatePanelPaths.enhance(async ({ submit }) => {
		await handleSubmit(submit);
	})}
	class="security-va"
>
	<div class="security-actions">
		<button type="submit" class="admin-btn admin-btn-primary" disabled={updatePanelPaths.pending > 0}>
			<AnimatedIcon name="check" size={13} />
			<span>{updatePanelPaths.pending > 0 ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}</span>
		</button>
	</div>

	<div class="security-grid">
		<div class="va-card security-panel">
			<div class="panel-head">
				<div>
					<div class="panel-title">مسیر مخفی پنل‌ها</div>
					<div class="panel-sub">مسیرهای عمومی بعد از تنظیم base path باید ۴۰۴ شوند.</div>
				</div>
			</div>
			<div class="panel-body">
				{#if !hasHiddenPaths}
					<div class="security-warning">
						<AnimatedIcon name="shield" size={14} />
						<span>برای کاهش اسکن خودکار و تلاش ورود، برای هر دو پنل مسیر مخفی تنظیم کنید.</span>
					</div>
				{/if}

				<div class="field-block">
					<div class="va-section-label">پایه مسیر مدیریت</div>
					<div class="va-field-shell path-field">
						<span class="path-prefix">/</span>
						<input
							id="manager-base-path"
							type="text"
							name="managerBasePath"
							value={data.panelPathSettings.managerBasePath ?? ''}
							placeholder="secret-mgmt"
							dir="ltr"
							autocomplete="off"
						/>
						<span class="va-field-suffix" dir="ltr">/manager</span>
					</div>
					<div class="path-preview" dir="ltr">→ {managerPathPreview}</div>
				</div>

				<div class="field-block">
					<div class="va-section-label">پایه مسیر فروشنده</div>
					<div class="va-field-shell path-field">
						<span class="path-prefix">/</span>
						<input
							id="reseller-base-path"
							type="text"
							name="resellerBasePath"
							value={data.panelPathSettings.resellerBasePath ?? ''}
							placeholder="secret-sale"
							dir="ltr"
							autocomplete="off"
						/>
						<span class="va-field-suffix" dir="ltr">/reseller</span>
					</div>
					<div class="path-preview" dir="ltr">→ {resellerPathPreview}</div>
				</div>

				<div class="help-box">
					مجاز: ۳ تا ۶۴ کاراکتر، حروف انگلیسی کوچک، عدد، خط تیره و آندرلاین. مسیر خالی یعنی مسیر عمومی قبلی فعال بماند.
				</div>
			</div>
		</div>

	</div>

	<div class="va-card login-log">
		<div class="panel-head">
			<div>
				<div class="panel-title">تلاش‌های اخیر ورود</div>
				<div class="panel-sub">نمای امنیتی برای بررسی رویدادهای ورود</div>
			</div>
			<div class="chip-group">
				<span class="va-chip is-active">همه</span>
				<span class="va-chip">موفق</span>
				<span class="va-chip">ناموفق</span>
			</div>
		</div>
		<div class="log-empty">
			<AnimatedIcon name="shield" size={22} />
			<span>لاگ ورود تجمیعی هنوز به دیتابیس وصل نیست؛ رویدادهای امنیتی در لاگ سرور ثبت می‌شوند.</span>
		</div>
	</div>
</form>

<style>
	.security-va {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.security-actions {
		display: flex;
		justify-content: flex-end;
	}

	.security-grid {
		display: grid;
		grid-template-columns: 1.4fr 1fr;
		gap: 16px;
	}

	.security-panel,
	.login-log {
		overflow: hidden;
		padding: 0;
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--va-border);
	}

	.panel-title {
		color: var(--va-text);
		font-size: 13px;
		font-weight: 500;
	}

	.panel-sub {
		margin-top: 4px;
		color: var(--va-text-faint);
		font: 500 11px var(--va-font-mono);
	}

	.panel-body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 18px;
	}

	.security-warning,
	.help-box {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border: 1px solid color-mix(in srgb, var(--va-warning) 28%, transparent);
		border-radius: 6px;
		background: color-mix(in srgb, var(--va-warning) 8%, transparent);
		color: var(--va-warning);
		font-size: 11.5px;
		line-height: 1.7;
	}

	.help-box {
		display: block;
		border-color: var(--va-border);
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
	}

	.field-block {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.path-field {
		direction: ltr;
		text-align: left;
	}

	.path-prefix {
		align-self: center;
		padding-inline-start: 10px;
		color: var(--va-text-faint);
		font: 500 12px var(--va-font-mono);
	}

	.path-preview {
		color: var(--va-text-faint);
		font: 500 11px var(--va-font-mono);
		text-align: left;
	}

	.toggle-list {
		padding: 4px 18px 8px;
	}

	.toggle-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 0;
		border-bottom: 1px dashed var(--va-border);
	}

	.toggle-row:last-child {
		border-bottom: 0;
	}

	.toggle-row > div {
		flex: 1;
		min-width: 0;
	}

	.toggle-row div div {
		color: var(--va-text);
		font-size: 12.5px;
	}

	.toggle-row span:not(.mini-switch) {
		display: block;
		margin-top: 3px;
		color: var(--va-text-faint);
		font: 500 10.5px var(--va-font-mono);
	}

	.mini-switch {
		position: relative;
		width: 30px;
		height: 16px;
		border-radius: 999px;
		background: var(--va-border);
	}

	.mini-switch.is-on {
		background: var(--va-accent);
	}

	.mini-switch i {
		position: absolute;
		top: 2px;
		inset-inline-end: 16px;
		width: 12px;
		height: 12px;
		border-radius: 999px;
		background: var(--va-text);
	}

	.mini-switch.is-on i {
		inset-inline-end: 2px;
	}

	.chip-group {
		display: flex;
		gap: 6px;
	}

	.log-empty {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 18px;
		color: var(--va-text-muted);
		font-size: 12.5px;
	}

	@media (max-width: 900px) {
		.security-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
