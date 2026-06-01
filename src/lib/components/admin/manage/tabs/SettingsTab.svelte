<script lang="ts">
	import { toast } from 'svelte-sonner';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import {
		testRuntimeOptions,
		updatePaymentCard,
		updateRuntimeOptions,
		updateSmtp
	} from '../../../../../routes/manage/page.remote';

	type RuntimeSettings = {
		xuiPanelUrl: string;
		xuiApiToken: string;
		xuiPublicHost: string;
		xrayBinaryPath: string;
		logLevel: 'debug' | 'info' | 'warning' | 'error';
		logFile: string;
	};

	type RuntimeHealth = {
		ok: boolean;
		checkedAt: string;
		xui: {
			envConfigured: boolean;
			panelUrlValid: boolean;
			tokenConfigured: boolean;
			reachable: boolean;
			tokenValid: boolean | null;
			apiOk: boolean;
			httpStatus: number | null;
			panelScheme: string | null;
			panelHostKind: string;
			panelPortConfigured: boolean;
			errorName: string | null;
			errorCauseCode: string | null;
			message: string;
		};
		xray: {
			ok: boolean;
			path: string;
			message: string;
			errorName: string | null;
		};
	} | null;

	type SmtpSettings = {
		host: string;
		port: number;
		secure: boolean;
		username: string;
		password: string;
		fromAddress: string;
		fromName: string;
	};
	type PaymentCard = { cardNumber: string; cardOwnerName: string };

	type Props = {
		data: {
			runtimeSettings: RuntimeSettings;
			runtimeHealth: RuntimeHealth;
			paymentCard: PaymentCard;
			smtpSettings: SmtpSettings;
		};
	};

	let { data }: Props = $props();

	function currentRuntimeValues() {
		return {
			xuiPanelUrl: data.runtimeSettings.xuiPanelUrl ?? '',
			xuiApiToken: data.runtimeSettings.xuiApiToken ?? '',
			xuiPublicHost: data.runtimeSettings.xuiPublicHost ?? '',
			xrayBinaryPath: data.runtimeSettings.xrayBinaryPath ?? '/usr/local/x-ui/bin/xray-linux-amd64',
			logLevel: data.runtimeSettings.logLevel ?? 'warning',
			logFile: data.runtimeSettings.logFile ?? ''
		};
	}

	function currentSmtpValues() {
		return {
			host: data.smtpSettings.host ?? '',
			port: data.smtpSettings.port ?? 587,
			secure: data.smtpSettings.secure ? 'true' : 'false',
			username: data.smtpSettings.username ?? '',
			password: data.smtpSettings.password ?? '',
			fromAddress: data.smtpSettings.fromAddress ?? '',
			fromName: data.smtpSettings.fromName ?? 'Skyline'
		};
	}
	function currentPaymentCardValues() {
		return {
			cardNumber: data.paymentCard.cardNumber ?? '',
			cardOwnerName: data.paymentCard.cardOwnerName ?? ''
		};
	}

	let values = $state(currentRuntimeValues());
	let smtpValues = $state(currentSmtpValues());
	let cardValues = $state(currentPaymentCardValues());
	let testForm = $state<HTMLFormElement | null>(null);

	const health = $derived(data.runtimeHealth);
	const healthRows = $derived.by(() => {
		if (!health) return [];

		return [
			{
				label: 'ساختار تنظیمات',
				ok: health.xui.envConfigured && health.xui.panelUrlValid && health.xui.tokenConfigured,
				message: health.xui.panelUrlValid
					? 'آدرس پنل و توکن قابل استفاده هستند.'
					: 'آدرس پنل باید به مسیر /panel ختم شود.'
			},
			{
				label: 'دسترسی به x-ui',
				ok: health.xui.reachable,
				message: health.xui.reachable
					? `پاسخ HTTP ${health.xui.httpStatus ?? '-'} دریافت شد.`
					: health.xui.message
			},
			{
				label: 'اعتبار توکن API',
				ok: health.xui.tokenValid === true,
				message:
					health.xui.tokenValid === true
						? 'توکن API توسط x-ui پذیرفته شد.'
						: health.xui.tokenValid === false
							? 'x-ui توکن را رد کرد.'
							: 'تا وقتی x-ui در دسترس نباشد، توکن قابل تایید نیست.'
			},
			{
				label: 'پاسخ API',
				ok: health.xui.apiOk,
				message: health.xui.message
			},
			{
				label: 'مسیر xray',
				ok: health.xray.ok,
				message: health.xray.message
			}
		];
	});

	function testSettings() {
		testForm?.requestSubmit();
	}

	function syncFromServer() {
		values = currentRuntimeValues();
	}

	function syncSmtpFromServer() {
		smtpValues = currentSmtpValues();
	}

	function syncPaymentCardFromServer() {
		cardValues = currentPaymentCardValues();
	}
</script>

<div class="settings-va">
	<div class="settings-actions">
		<button type="button" class="admin-btn admin-btn-secondary" onclick={testSettings} disabled={testRuntimeOptions.pending > 0}>
			<AnimatedIcon name="sparkle" size={13} />
			<span>{testRuntimeOptions.pending > 0 ? 'در حال تست...' : 'تست اتصال'}</span>
		</button>
		<button type="submit" form="runtime-settings-form" class="admin-btn admin-btn-primary" disabled={updateRuntimeOptions.pending > 0}>
			<AnimatedIcon name="check" size={13} />
			<span>{updateRuntimeOptions.pending > 0 ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}</span>
		</button>
	</div>

	<div class="settings-grid">
		<form
			id="runtime-settings-form"
			{...updateRuntimeOptions.enhance(async ({ submit }) => {
				await submit();
				const result = updateRuntimeOptions.result;
				if (result?.runtimeSettingsSuccess) toast.success(result.runtimeSettingsSuccess);
				if (result?.runtimeSettingsError) toast.error(result.runtimeSettingsError);
			})}
			class="va-card settings-panel"
		>
			<div class="panel-head">
				<div>
					<div class="panel-title">اتصال x-ui و xray</div>
					<div class="panel-sub">این مقادیر از این پس در دیتابیس Skyline ذخیره می‌شوند، نه فایل env.</div>
				</div>
				<button type="button" class="va-chip" onclick={syncFromServer}>
					<AnimatedIcon name="sparkle" size={11} />
					بازگردانی
				</button>
			</div>

			<div class="panel-body">
				<div class="field-block">
					<label class="va-section-label" for="xui-panel-url">آدرس پنل x-ui</label>
					<div class="va-field-shell">
						<input
							id="xui-panel-url"
							name="xuiPanelUrl"
							type="url"
							dir="ltr"
							bind:value={values.xuiPanelUrl}
							placeholder="http://127.0.0.1:9885/base/panel"
							autocomplete="off"
						/>
					</div>
					<div class="field-hint">باید به مسیر <span dir="ltr">/panel</span> ختم شود.</div>
				</div>

				<div class="field-block">
					<label class="va-section-label" for="xui-api-token">توکن API x-ui</label>
					<div class="va-field-shell">
						<input
							id="xui-api-token"
							name="xuiApiToken"
							type="password"
							dir="ltr"
							bind:value={values.xuiApiToken}
							placeholder="Bearer token"
							autocomplete="off"
						/>
					</div>
				</div>

				<div class="field-grid">
					<div class="field-block">
						<label class="va-section-label" for="xui-public-host">هاست عمومی کانفیگ</label>
						<div class="va-field-shell">
							<input
								id="xui-public-host"
								name="xuiPublicHost"
								type="text"
								dir="ltr"
								bind:value={values.xuiPublicHost}
								placeholder="sky-01.example.com"
								autocomplete="off"
							/>
						</div>
					</div>

					<div class="field-block">
						<label class="va-section-label" for="xray-binary-path">مسیر باینری xray</label>
						<div class="va-field-shell">
							<input
								id="xray-binary-path"
								name="xrayBinaryPath"
								type="text"
								dir="ltr"
								bind:value={values.xrayBinaryPath}
								placeholder="/usr/local/x-ui/bin/xray-linux-amd64"
								autocomplete="off"
							/>
						</div>
					</div>
				</div>

				<div class="field-grid">
					<div class="field-block">
						<label class="va-section-label" for="log-level">سطح لاگ</label>
						<div class="va-field-shell">
							<select id="log-level" name="logLevel" bind:value={values.logLevel}>
								<option value="debug">debug</option>
								<option value="info">info</option>
								<option value="warning">warning</option>
								<option value="error">error</option>
							</select>
						</div>
					</div>

					<div class="field-block">
						<label class="va-section-label" for="log-file">فایل لاگ</label>
						<div class="va-field-shell">
							<input
								id="log-file"
								name="logFile"
								type="text"
								dir="ltr"
								bind:value={values.logFile}
								placeholder="خالی = خروجی استاندارد"
								autocomplete="off"
							/>
						</div>
					</div>
				</div>
			</div>
		</form>

		<div class="va-card health-panel">
			<div class="panel-head">
				<div>
					<div class="panel-title">وضعیت سلامت اتصال</div>
					<div class="panel-sub">
						{#if health}
							آخرین تست: {new Date(health.checkedAt).toLocaleString('fa-IR')}
						{:else}
							برای بررسی تنظیمات، تست اتصال را اجرا کنید.
						{/if}
					</div>
				</div>
				<span class:ok-chip={health?.ok} class:bad-chip={health && !health.ok} class="health-chip">
					{health?.ok ? 'سالم' : health ? 'نیازمند بررسی' : 'تست نشده'}
				</span>
			</div>

			<div class="health-list">
				{#if healthRows.length}
					{#each healthRows as row}
						<div class="health-row" class:is-ok={row.ok}>
							<span class="status-dot"></span>
							<div>
								<div class="health-title">{row.label}</div>
								<div class="health-message">{row.message}</div>
							</div>
						</div>
					{/each}

					<div class="health-meta">
						<span>Scheme: {health?.xui.panelScheme ?? '-'}</span>
						<span>Host: {health?.xui.panelHostKind ?? '-'}</span>
						<span>Port: {health?.xui.panelPortConfigured ? 'set' : 'default'}</span>
						{#if health?.xui.errorCauseCode}
							<span>Error: {health.xui.errorCauseCode}</span>
						{/if}
					</div>
				{:else}
					<div class="empty-health">
						<AnimatedIcon name="database" size={28} />
						<span>هنوز تستی اجرا نشده است.</span>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<form
		{...updateSmtp.enhance(async ({ submit }) => {
			await submit();
			const result = updateSmtp.result;
			if (result?.smtpSuccess) toast.success(result.smtpSuccess);
			if (result?.smtpError) toast.error(result.smtpError);
		})}
		class="va-card smtp-panel"
	>
		<div class="panel-head">
			<div>
				<div class="panel-title">ارسال ایمیل بازیابی رمز عبور</div>
				<div class="panel-sub">SMTP برای ارسال لینک یک‌بارمصرف بازیابی حساب فروشنده.</div>
			</div>
			<button type="button" class="va-chip" onclick={syncSmtpFromServer}>
				<AnimatedIcon name="sparkle" size={11} />
				بازگردانی
			</button>
		</div>

		<div class="panel-body">
			<div class="field-grid">
				<div class="field-block">
					<label class="va-section-label" for="smtp-host">هاست SMTP</label>
					<div class="va-field-shell">
						<input id="smtp-host" name="host" type="text" dir="ltr" bind:value={smtpValues.host} placeholder="smtp.example.com" autocomplete="off" />
					</div>
				</div>
				<div class="field-block">
					<label class="va-section-label" for="smtp-port">پورت و امنیت اتصال</label>
					<div class="inline-fields">
						<div class="va-field-shell">
							<input id="smtp-port" name="port" type="number" min="1" max="65535" dir="ltr" bind:value={smtpValues.port} />
						</div>
						<div class="va-field-shell">
							<select name="secure" bind:value={smtpValues.secure} aria-label="امنیت اتصال SMTP">
								<option value="false">STARTTLS / Plain</option>
								<option value="true">TLS مستقیم</option>
							</select>
						</div>
					</div>
				</div>
			</div>

			<div class="field-grid">
				<div class="field-block">
					<label class="va-section-label" for="smtp-username">نام کاربری</label>
					<div class="va-field-shell">
						<input id="smtp-username" name="username" type="text" dir="ltr" bind:value={smtpValues.username} autocomplete="off" />
					</div>
				</div>
				<div class="field-block">
					<label class="va-section-label" for="smtp-password">گذرواژه SMTP</label>
					<div class="va-field-shell">
						<input id="smtp-password" name="password" type="password" dir="ltr" bind:value={smtpValues.password} autocomplete="new-password" />
					</div>
				</div>
			</div>

			<div class="field-grid">
				<div class="field-block">
					<label class="va-section-label" for="smtp-from-address">ایمیل فرستنده</label>
					<div class="va-field-shell">
						<input id="smtp-from-address" name="fromAddress" type="email" dir="ltr" bind:value={smtpValues.fromAddress} placeholder="no-reply@example.com" autocomplete="off" />
					</div>
				</div>
				<div class="field-block">
					<label class="va-section-label" for="smtp-from-name">نام فرستنده</label>
					<div class="va-field-shell">
						<input id="smtp-from-name" name="fromName" type="text" bind:value={smtpValues.fromName} placeholder="Skyline" autocomplete="off" />
					</div>
				</div>
			</div>
			<div class="smtp-footer">
				<span class="field-hint">برای سرویس‌های پورت 465 گزینه TLS مستقیم و برای پورت 587 معمولاً STARTTLS را انتخاب کنید.</span>
				<button type="submit" class="admin-btn admin-btn-primary" disabled={updateSmtp.pending > 0}>
					{updateSmtp.pending > 0 ? 'در حال ذخیره...' : 'ذخیره ایمیل'}
				</button>
			</div>
		</div>
	</form>

	<form
		{...updatePaymentCard.enhance(async ({ submit }) => {
			await submit();
			const result = updatePaymentCard.result;
			if (result?.paymentCardSuccess) toast.success(result.paymentCardSuccess);
			if (result?.paymentCardError) toast.error(result.paymentCardError);
		})}
		class="va-card payment-card-panel"
	>
		<div class="panel-head">
			<div>
				<div class="panel-title">کارت پرداخت فروشندگان</div>
				<div class="panel-sub">در پنجره انتخاب بسته شارژ فروشنده نمایش داده می‌شود.</div>
			</div>
			<button type="button" class="va-chip" onclick={syncPaymentCardFromServer}>
				<AnimatedIcon name="sparkle" size={11} />
				بازگردانی
			</button>
		</div>
		<div class="panel-body payment-card-body">
			<div class="payment-preview">
				<div>
					<span>شماره کارت</span>
					<strong dir="ltr">{cardValues.cardNumber || '---- ---- ---- ----'}</strong>
				</div>
				<div>
					<span>به نام</span>
					<strong>{cardValues.cardOwnerName || 'ثبت نشده'}</strong>
				</div>
			</div>
			<div class="field-grid">
				<div class="field-block">
					<label class="va-section-label" for="payment-card-number">شماره کارت</label>
					<div class="va-field-shell">
						<input id="payment-card-number" name="cardNumber" type="text" dir="ltr" bind:value={cardValues.cardNumber} placeholder="6037 9918 0000 0000" autocomplete="off" />
					</div>
				</div>
				<div class="field-block">
					<label class="va-section-label" for="payment-card-owner">نام صاحب کارت</label>
					<div class="va-field-shell">
						<input id="payment-card-owner" name="cardOwnerName" type="text" bind:value={cardValues.cardOwnerName} placeholder="نام صاحب حساب" autocomplete="off" />
					</div>
				</div>
			</div>
			<div class="smtp-footer">
				<span class="field-hint">اگر خالی باشد، فروشنده فقط بسته را می‌بیند و اطلاعات کارت نمایش داده نمی‌شود.</span>
				<button type="submit" class="admin-btn admin-btn-primary" disabled={updatePaymentCard.pending > 0}>
					{updatePaymentCard.pending > 0 ? 'در حال ذخیره...' : 'ذخیره کارت'}
				</button>
			</div>
		</div>
	</form>

	<form
		bind:this={testForm}
		{...testRuntimeOptions.enhance(async ({ submit }) => {
			await submit();
			const result = testRuntimeOptions.result;
			if (result?.runtimeTestSuccess) toast.success(result.runtimeTestSuccess);
			if (result?.runtimeTestError) toast.error(result.runtimeTestError);
		})}
		style="display:none"
		aria-hidden="true"
	>
		<input type="hidden" name="xuiPanelUrl" value={values.xuiPanelUrl} />
		<input type="hidden" name="xuiApiToken" value={values.xuiApiToken} />
		<input type="hidden" name="xuiPublicHost" value={values.xuiPublicHost} />
		<input type="hidden" name="xrayBinaryPath" value={values.xrayBinaryPath} />
		<input type="hidden" name="logLevel" value={values.logLevel} />
		<input type="hidden" name="logFile" value={values.logFile} />
	</form>
</div>

<style>
	.settings-va {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.settings-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		flex-wrap: wrap;
	}

	.settings-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
		gap: 16px;
		align-items: start;
	}

	.settings-panel,
	.health-panel,
	.smtp-panel,
	.payment-card-panel {
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
		font-weight: 600;
	}

	.panel-sub,
	.field-hint,
	.health-message,
	.health-meta {
		color: var(--va-text-faint);
		font: 500 11px/1.7 var(--va-font-mono);
	}

	.panel-body {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 18px;
	}

	.field-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}

	.inline-fields {
		display: grid;
		grid-template-columns: 108px 1fr;
		gap: 8px;
	}

	.field-block {
		display: flex;
		flex-direction: column;
		gap: 7px;
	}

	.va-field-shell {
		min-height: 42px;
		display: flex;
		align-items: center;
		border: 1px solid var(--va-border);
		border-radius: 10px;
		background: var(--va-bg-raised);
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease,
			background 0.2s ease;
	}

	.va-field-shell:focus-within {
		border-color: color-mix(in srgb, var(--va-accent) 72%, transparent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--va-accent) 16%, transparent);
		background: var(--va-bg);
	}

	.va-field-shell input,
	.va-field-shell select {
		width: 100%;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--va-text);
		padding: 10px 12px;
		font: 500 12px var(--va-font-mono);
	}

	.va-field-shell select {
		color-scheme: dark;
	}

	:global([data-theme='light']) .va-field-shell select {
		color-scheme: light;
	}

	.health-chip,
	.ok-chip,
	.bad-chip {
		border-radius: 999px;
		padding: 6px 10px;
		font: 700 11px var(--va-font-mono);
		border: 1px solid var(--va-border);
		color: var(--va-text-muted);
		background: var(--va-bg-raised);
	}

	.ok-chip {
		color: var(--va-success);
		border-color: color-mix(in srgb, var(--va-success) 28%, transparent);
		background: color-mix(in srgb, var(--va-success) 10%, transparent);
	}

	.bad-chip {
		color: var(--va-danger);
		border-color: color-mix(in srgb, var(--va-danger) 28%, transparent);
		background: color-mix(in srgb, var(--va-danger) 10%, transparent);
	}

	.health-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
	}

	.health-row {
		display: grid;
		grid-template-columns: 10px 1fr;
		gap: 10px;
		padding: 12px;
		border: 1px solid var(--va-border);
		border-radius: 12px;
		background: var(--va-bg-raised);
	}

	.status-dot {
		width: 8px;
		height: 8px;
		margin-top: 6px;
		border-radius: 999px;
		background: var(--va-danger);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--va-danger) 12%, transparent);
	}

	.health-row.is-ok .status-dot {
		background: var(--va-success);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--va-success) 12%, transparent);
	}

	.health-title {
		color: var(--va-text);
		font-size: 12px;
		font-weight: 700;
	}

	.health-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 8px 2px 0;
	}

	.health-meta span {
		padding: 4px 8px;
		border-radius: 999px;
		background: var(--va-bg-raised);
		border: 1px solid var(--va-border);
	}

	.payment-card-body {
		gap: 14px;
	}

	.payment-preview {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(180px, 0.9fr);
		gap: 1px;
		overflow: hidden;
		border: 1px solid color-mix(in srgb, var(--va-accent) 24%, var(--va-border));
		border-radius: 14px;
		background: var(--va-border);
	}

	.payment-preview div {
		display: grid;
		gap: 6px;
		padding: 16px;
		background:
			linear-gradient(135deg, color-mix(in srgb, var(--va-accent) 13%, transparent), transparent 58%),
			var(--va-bg-raised);
	}

	.payment-preview span {
		color: var(--va-text-faint);
		font-size: 11px;
	}

	.payment-preview strong {
		color: var(--va-text);
		font: 800 18px var(--va-font-mono);
		letter-spacing: 0;
	}

	.smtp-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.empty-health {
		min-height: 180px;
		display: grid;
		place-items: center;
		gap: 10px;
		color: var(--va-text-muted);
		font-size: 12px;
	}

	@media (max-width: 980px) {
		.settings-grid,
		.field-grid,
		.inline-fields {
			grid-template-columns: 1fr;
		}

		.smtp-footer {
			align-items: stretch;
			flex-direction: column;
		}

		.payment-preview {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 640px) {
		.settings-actions {
			display: grid;
			grid-template-columns: 1fr 1fr;
		}

		.settings-actions :global(.admin-btn) {
			justify-content: center;
		}

		.panel-head,
		.panel-body {
			padding-inline: 14px;
		}
	}
</style>
