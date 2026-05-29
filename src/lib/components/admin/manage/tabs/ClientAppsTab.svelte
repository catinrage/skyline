<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import VaStatusDot from '$lib/components/admin/va/VaStatusDot.svelte';
	import { updateClientApps } from '../../../../../routes/manage/page.remote';

	type ClientAppOs = 'android' | 'ios' | 'windows' | 'linux';
	type SourceType = 'url' | 'upload';

	type DraftApp = {
		name: string;
		downloadUrl: string;
		os: ClientAppOs;
		sourceType: SourceType;
		/** Stored filename on disk — only set for uploaded files */
		uploadedFileName?: string;
		/** Transient: true while file is being uploaded */
		uploading?: boolean;
	};

	const osOptions: Array<{ value: ClientAppOs; label: string }> = [
		{ value: 'android', label: 'Android' },
		{ value: 'ios', label: 'iOS' },
		{ value: 'windows', label: 'Windows' },
		{ value: 'linux', label: 'Linux' }
	];

	type Props = {
		data: {
			clientAppLinks: Array<{ name: string; downloadUrl: string; os: ClientAppOs; uploadedFileName?: string }>;
			featureFlags: Array<{ key: string; enabled: boolean }>;
		};
	};

	let { data }: Props = $props();

	let draft = $state<DraftApp[]>([]);
	let loadedSignature = $state('');

	/** Derive the upload API path from the current URL — handles both default and hidden manager paths. */
	const uploadEndpoint = $derived.by(() => {
		const hiddenMatch = page.url.pathname.match(/^\/([^/]+)\/manage(?:\/|$)/);
		return hiddenMatch?.[1] ? `/${hiddenMatch[1]}/manage/client-apps` : '/manage/client-apps';
	});

	const clientAppsEnabled = $derived(
		data.featureFlags.find((f) => f.key === 'client_apps_links')?.enabled ?? false
	);

	function addRow() {
		draft = [...draft, { name: '', downloadUrl: '', os: 'android', sourceType: 'url' }];
	}

	function removeRow(index: number) {
		draft = draft.filter((_, i) => i !== index);
	}

	function toggleSourceType(index: number) {
		const app = draft[index];
		if (!app) return;
		if (app.sourceType === 'url') {
			draft[index] = { ...app, sourceType: 'upload', downloadUrl: '', uploadedFileName: undefined };
		} else {
			draft[index] = { ...app, sourceType: 'url', downloadUrl: '', uploadedFileName: undefined };
		}
	}

	async function handleFileSelect(index: number, files: FileList | null) {
		if (!files || files.length === 0) return;
		const file = files[0];
		const app = draft[index];
		if (!app) return;

		draft[index] = { ...app, uploading: true };

		try {
			const fd = new FormData();
			fd.append('file', file);

			const res = await fetch(uploadEndpoint, { method: 'POST', body: fd });
			const data = await res.json();

			if (!res.ok) {
				toast.error(data?.error ?? 'آپلود فایل ناموفق بود.');
				draft[index] = { ...draft[index], uploading: false };
				return;
			}

			draft[index] = {
				...draft[index],
				uploading: false,
				uploadedFileName: data.fileName,
				// Build an absolute URL so the zod url() validator on the server accepts it
				downloadUrl: window.location.origin + data.relativeUrl
			};
		} catch {
			toast.error('خطا در ارتباط با سرور.');
			draft[index] = { ...draft[index], uploading: false };
		}
	}

	function serialize() {
		return JSON.stringify(
			draft
				.filter((app) => app.name.trim() || app.downloadUrl.trim())
				.map((app) => ({
					name: app.name.trim(),
					downloadUrl: app.downloadUrl.trim(),
					os: app.os,
					...(app.uploadedFileName ? { uploadedFileName: app.uploadedFileName } : {})
				}))
		);
	}

	function osTone(os: ClientAppOs) {
		if (os === 'android') return 'success';
		if (os === 'ios') return 'warning';
		if (os === 'linux') return 'danger';
		return 'accent';
	}

	function osLabel(os: ClientAppOs) {
		return osOptions.find((option) => option.value === os)?.label ?? 'Android';
	}

	function isRowReady(app: DraftApp) {
		return !!(app.name.trim() && app.downloadUrl.trim());
	}

	async function handleSubmit(submit: () => Promise<void>) {
		await submit();
		const result = updateClientApps.result;
		if (result?.clientAppsSuccess) toast.success(result.clientAppsSuccess);
		if (result?.clientAppsError) toast.error(result.clientAppsError);
	}

	$effect(() => {
		const signature = JSON.stringify(data.clientAppLinks);
		if (signature === loadedSignature) return;
		loadedSignature = signature;
		draft = data.clientAppLinks.length
			? data.clientAppLinks.map((item) => ({
					...item,
					os: item.os ?? 'android',
					sourceType: item.uploadedFileName ? ('upload' as SourceType) : ('url' as SourceType)
				}))
			: [{ name: '', downloadUrl: '', os: 'android', sourceType: 'url' as SourceType }];
	});
</script>

<form
	{...updateClientApps.enhance(async ({ submit }) => {
		await handleSubmit(submit);
	})}
	class="apps-va"
>
	<div class="apps-topbar">
		<div class="status-banner" class:is-on={clientAppsEnabled}>
			<span class="status-dot-wrap">
				<span class="status-pulse" class:pulse-on={clientAppsEnabled}></span>
			</span>
			<div class="status-text">
				<span>قابلیت «نمایش اپ‌های کلاینت» در حال حاضر <b>{clientAppsEnabled ? 'فعال است' : 'غیرفعال است'}</b>.</span>
				<span class="status-hint">وضعیت آن را از تب «قابلیت‌ها» تغییر دهید.</span>
			</div>
		</div>
		<div class="topbar-actions">
			<button type="button" class="admin-btn admin-btn-primary" onclick={addRow}>
				<AnimatedIcon name="plus-network" size={13} />
				<span>افزودن اپ</span>
			</button>
		</div>
	</div>

	<input type="hidden" name="clientApps" value={serialize()} />

	<div class="va-card apps-card">
		<div class="apps-head">
			<div class="head-meta">
				<span class="panel-title">لیست اپ‌ها</span>
				<span class="count-badge">{draft.length.toLocaleString('fa-IR-u-nu-latn')}</span>
			</div>
			<div class="head-sub">ردیف‌ها به همین ترتیب در صفحه کاربر نمایش داده می‌شوند</div>
		</div>

		<div class="col-headers">
			<div class="ch ch-name">نام برنامه</div>
			<div class="ch ch-os">سیستم‌عامل</div>
			<div class="ch ch-url">منبع دانلود</div>
			<div class="ch ch-status">وضعیت</div>
			<div class="ch ch-act"></div>
		</div>

		<div class="apps-list">
			{#each draft as app, index (`app-${index}`)}
				<div class="app-row">
					<!-- Name -->
					<div class="cell cell-name">
						<label class="sr-only" for={`app-name-${index}`}>نام برنامه</label>
						<input
							id={`app-name-${index}`}
							type="text"
							bind:value={app.name}
							placeholder="نام برنامه"
							class="cell-input"
						/>
					</div>

					<!-- OS -->
					<div class="cell cell-os">
						<span class="os-dot os-dot-{osTone(app.os)}"></span>
						<label class="sr-only" for={`app-os-${index}`}>سیستم‌عامل</label>
						<select id={`app-os-${index}`} bind:value={app.os} class="cell-select">
							{#each osOptions as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</div>

					<!-- Source (URL or Upload) -->
					<div class="cell cell-url">
						<!-- Mode toggle pill -->
						<div class="source-toggle">
							<button
								type="button"
								class="src-btn"
								class:src-active={app.sourceType === 'url'}
								onclick={() => { if (app.sourceType !== 'url') toggleSourceType(index); }}
								title="لینک خارجی"
							>
								<AnimatedIcon name="list" size={11} />
								لینک
							</button>
							<button
								type="button"
								class="src-btn"
								class:src-active={app.sourceType === 'upload'}
								onclick={() => { if (app.sourceType !== 'upload') toggleSourceType(index); }}
								title="آپلود فایل"
							>
								<AnimatedIcon name="cloud" size={11} />
								آپلود
							</button>
						</div>

						{#if app.sourceType === 'url'}
							<!-- External URL input -->
							<input
								id={`app-link-${index}`}
								type="url"
								bind:value={app.downloadUrl}
								placeholder="https://example.com/client.apk"
								dir="ltr"
								class="cell-input url-input"
							/>
						{:else if app.uploading}
							<!-- Uploading state -->
							<div class="upload-state uploading">
								<span class="upload-spinner"></span>
								<span>در حال آپلود…</span>
							</div>
						{:else if app.uploadedFileName}
							<!-- File already uploaded -->
							<div class="upload-state uploaded">
								<AnimatedIcon name="database" size={12} />
								<span class="uploaded-name" title={app.uploadedFileName}>
									{app.uploadedFileName.slice(17)}
								</span>
								<label class="reupload-btn" for={`app-file-${index}`} title="تغییر فایل">
									<AnimatedIcon name="cloud" size={11} />
								</label>
							</div>
						{:else}
							<!-- No file yet: show drop zone -->
							<label class="upload-dropzone" for={`app-file-${index}`}>
								<AnimatedIcon name="cloud" size={13} />
								<span>انتخاب فایل</span>
								<small>.apk, .ipa, .exe, .dmg — حداکثر ۲۰۰ MB</small>
							</label>
						{/if}

						<!-- Hidden file input (used for both initial upload and re-upload) -->
						{#if app.sourceType === 'upload'}
							<input
								id={`app-file-${index}`}
								type="file"
								accept=".apk,.ipa,.exe,.dmg,.pkg,.deb,.rpm,.AppImage,application/octet-stream"
								class="sr-only"
								onchange={(e) => handleFileSelect(index, (e.currentTarget as HTMLInputElement).files)}
							/>
						{/if}
					</div>

					<!-- Status -->
					<div class="cell cell-status">
						<VaStatusDot
							tone={isRowReady(app) ? 'success' : 'muted'}
							label={isRowReady(app) ? 'آماده' : 'ناقص'}
						/>
					</div>

					<!-- Delete -->
					<div class="cell cell-act">
						<button
							type="button"
							class="va-icon-btn remove-btn"
							onclick={() => removeRow(index)}
							aria-label="حذف ردیف"
						>
							<AnimatedIcon name="spark-down" size={13} />
						</button>
					</div>
				</div>
			{/each}

			{#if draft.length === 0}
				<div class="empty-state">
					<AnimatedIcon name="plus-network" size={20} />
					<span>هنوز اپی اضافه نشده</span>
					<button type="button" class="admin-btn admin-btn-ghost" onclick={addRow}>افزودن اولین اپ</button>
				</div>
			{/if}
		</div>

		<div class="apps-footer">
			<div class="footer-hint">
				<AnimatedIcon name="plus-network" size={12} />
				<span>برای هر اپ می‌توانید لینک خارجی وارد کنید یا فایل را مستقیم آپلود کنید.</span>
			</div>
			<div class="footer-actions">
				<button type="button" class="va-chip" onclick={addRow}>
					<AnimatedIcon name="plus-network" size={11} />
					افزودن ردیف
				</button>
				<button type="submit" class="admin-btn admin-btn-primary">
					<AnimatedIcon name="check" size={13} />
					<span>ذخیره لیست</span>
				</button>
			</div>
		</div>
	</div>
</form>

<style>
	.apps-va {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	/* ── Top bar ───────────────────────────────────── */
	.apps-topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.topbar-actions {
		display: flex;
		gap: 8px;
		flex-shrink: 0;
	}

	/* ── Status banner ─────────────────────────────── */
	.status-banner {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 14px;
		border: 1px solid var(--va-border);
		border-radius: 8px;
		background: var(--va-bg-panel);
		font-size: 12.5px;
		color: var(--va-text-muted);
		flex: 1;
		min-width: 0;
	}

	.status-dot-wrap {
		position: relative;
		width: 10px;
		height: 10px;
		flex-shrink: 0;
	}

	.status-pulse {
		display: block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--va-text-faint);
		position: absolute;
		inset: 1px;
	}

	.pulse-on {
		background: var(--va-success);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--va-success) 20%, transparent);
	}

	.status-text {
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
	}

	.status-text b {
		color: var(--va-text);
		font-weight: 600;
	}

	.status-hint {
		color: var(--va-text-faint);
		font-size: 11px;
	}

	/* ── Card shell ────────────────────────────────── */
	.apps-card {
		overflow: hidden;
		padding: 0;
	}

	/* ── Card head ─────────────────────────────────── */
	.apps-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 11px 18px;
		border-bottom: 1px solid var(--va-border);
	}

	.head-meta {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.panel-title {
		color: var(--va-text);
		font-size: 13px;
		font-weight: 500;
	}

	.count-badge {
		padding: 1px 7px;
		border-radius: 10px;
		background: var(--va-bg-raised);
		border: 1px solid var(--va-border);
		color: var(--va-text-muted);
		font: 600 11px var(--va-font-mono);
	}

	.head-sub {
		color: var(--va-text-faint);
		font: 500 11px var(--va-font-mono);
	}

	/* ── Column headers ────────────────────────────── */
	.col-headers {
		display: grid;
		grid-template-columns: minmax(130px, 1fr) 140px minmax(260px, 2fr) 84px 44px;
		background: var(--va-bg-raised);
		border-bottom: 1px solid var(--va-border);
	}

	.ch {
		padding: 7px 14px;
		color: var(--va-text-faint);
		font: 600 10px var(--va-font-mono);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		border-inline-end: 1px solid var(--va-border);
	}

	.ch:last-child,
	.ch-act {
		border-inline-end: 0;
	}

	/* ── App rows ──────────────────────────────────── */
	.app-row {
		display: grid;
		grid-template-columns: minmax(130px, 1fr) 140px minmax(260px, 2fr) 84px 44px;
		align-items: stretch;
		border-bottom: 1px solid var(--va-border);
		transition: background 0.12s;
	}

	.app-row:last-child {
		border-bottom: 0;
	}

	.app-row:hover {
		background: color-mix(in srgb, var(--va-bg-raised) 60%, transparent);
	}

	/* ── Generic cell ──────────────────────────────── */
	.cell {
		display: flex;
		align-items: center;
		padding: 0 14px;
		min-width: 0;
		border-inline-end: 1px solid var(--va-border);
	}

	.cell:last-child {
		border-inline-end: 0;
	}


	/* ── Name ──────────────────────────────────────── */
	.cell-input {
		width: 100%;
		border: 0;
		background: transparent;
		color: var(--va-text);
		font: 500 13px var(--va-font);
		padding: 11px 0;
	}

	.cell-input::placeholder {
		color: var(--va-text-faint);
		font-weight: 400;
	}

	/* ── OS ────────────────────────────────────────── */
	.cell-os {
		gap: 8px;
	}

	.os-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
		background: var(--va-text-faint);
	}

	.os-dot-success { background: var(--va-success); }
	.os-dot-warning { background: var(--va-warning); }
	.os-dot-danger  { background: var(--va-danger); }
	.os-dot-accent  { background: var(--va-accent); }

	.cell-select {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		color: var(--va-text);
		font: 500 12px var(--va-font);
		cursor: pointer;
		padding: 11px 0;
	}

	/* ── Source cell ───────────────────────────────── */
	.cell-url {
		gap: 8px;
		padding-block: 8px;
		flex-wrap: nowrap;
	}

	/* Mode toggle pill */
	.source-toggle {
		display: flex;
		flex-shrink: 0;
		border: 1px solid var(--va-border);
		border-radius: 5px;
		overflow: hidden;
		background: var(--va-bg-raised);
	}

	.src-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 8px;
		border: 0;
		background: transparent;
		color: var(--va-text-faint);
		font: 500 10.5px var(--va-font-mono);
		cursor: pointer;
		transition: background 0.12s, color 0.12s;
		white-space: nowrap;
	}

	.src-btn:first-child {
		border-inline-end: 1px solid var(--va-border);
	}

	.src-btn:hover {
		color: var(--va-text);
	}

	.src-active {
		background: var(--va-bg-panel);
		color: var(--va-text);
	}

	/* URL input */
	.url-input {
		font-family: var(--va-font-mono);
		font-size: 11.5px;
		color: var(--va-text-muted);
		direction: ltr;
	}

	/* Upload states */
	.upload-state {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 0;
		font-size: 12px;
	}

	.uploading {
		color: var(--va-text-faint);
	}

	.upload-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid var(--va-border-strong);
		border-top-color: var(--va-accent);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.uploaded {
		color: var(--va-success);
		flex: 1;
		min-width: 0;
	}

	.uploaded-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font: 500 11.5px var(--va-font-mono);
		color: var(--va-text);
		direction: ltr;
	}

	.reupload-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 4px;
		color: var(--va-text-faint);
		cursor: pointer;
		flex-shrink: 0;
		transition: color 0.12s, background 0.12s;
	}

	.reupload-btn:hover {
		color: var(--va-text);
		background: var(--va-bg-raised);
	}

	/* Drop zone (no file chosen yet) */
	.upload-dropzone {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		padding: 6px 10px;
		border: 1px dashed var(--va-border-strong);
		border-radius: 5px;
		color: var(--va-text-faint);
		cursor: pointer;
		font-size: 12px;
		transition: border-color 0.12s, color 0.12s, background 0.12s;
	}

	.upload-dropzone:hover {
		border-color: var(--va-accent);
		color: var(--va-text);
		background: color-mix(in srgb, var(--va-accent) 5%, transparent);
	}

	.upload-dropzone small {
		color: var(--va-text-faint);
		font: 500 10px var(--va-font-mono);
	}

	/* ── Status cell ───────────────────────────────── */
	.cell-status {
		justify-content: center;
	}

	/* ── Action cell ───────────────────────────────── */
	.cell-act {
		justify-content: center;
		padding: 0;
		border-inline-end: 0;
	}

	.remove-btn {
		color: var(--va-text-faint);
		transition: color 0.15s;
	}

	.remove-btn:hover {
		color: var(--va-danger);
	}

	/* ── Empty state ───────────────────────────────── */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 48px 24px;
		color: var(--va-text-faint);
		font-size: 13px;
	}

	/* ── Footer ────────────────────────────────────── */
	.apps-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 18px;
		border-top: 1px solid var(--va-border);
		background: var(--va-bg-raised);
	}

	.footer-hint {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--va-text-faint);
		font-size: 11.5px;
	}

	.footer-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	/* ── Accessibility ─────────────────────────────── */
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	/* ── Responsive ────────────────────────────────── */
	@media (max-width: 900px) {
		.apps-topbar {
			flex-direction: column;
			align-items: stretch;
		}

		.topbar-actions {
			justify-content: flex-end;
		}

		.col-headers {
			display: none;
		}

		.app-row {
			grid-template-columns: 1fr 44px;
			grid-template-rows: auto auto auto;
		}

		.cell-name   { grid-column: 1; grid-row: 1; }
		.cell-os     { grid-column: 1; grid-row: 2; border-top: 1px solid var(--va-border); }
		.cell-url    { grid-column: 1; grid-row: 3; border-top: 1px solid var(--va-border); }
		.cell-status { display: none; }
		.cell-act    { grid-column: 2; grid-row: 1 / 4; border-inline-start: 1px solid var(--va-border); border-inline-end: 0; }

		.apps-footer {
			flex-direction: column;
			align-items: stretch;
			gap: 8px;
		}

		.footer-actions {
			justify-content: flex-end;
		}
	}
</style>
