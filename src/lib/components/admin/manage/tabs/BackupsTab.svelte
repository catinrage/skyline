<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import ConfirmDialog from '$lib/components/admin/ConfirmDialog.svelte';
	import {
		createStoredBackup,
		restoreDatabaseBackup,
		restoreStoredBackup
	} from '../../../../../routes/manage/page.remote';

	type Backup = {
		fileName: string;
		sizeBytes: number;
		createdAt: number;
		source: 'manual' | 'restore' | 'safety';
	};
	type Props = { data: { backups?: Backup[] }; manageState: any };
	let { data, manageState }: Props = $props();
	let restorePhrase = $state('');
	let storedRestoreTarget = $state<Backup | null>(null);
	let pageNumber = $state(1);
	const pageSize = 10;
	const backups = $derived(data.backups ?? []);
	const totalPages = $derived(Math.max(1, Math.ceil(backups.length / pageSize)));
	const visibleBackups = $derived(backups.slice((pageNumber - 1) * pageSize, pageNumber * pageSize));

	const backupDownloadPath = $derived.by(() => {
		const hiddenMatch = page.url.pathname.match(/^\/([^/]+)\/(manager|manage)(?:\/|$)/);
		return hiddenMatch?.[1] ? `/${hiddenMatch[1]}/${hiddenMatch[2]}/backup` : '/manage/backup';
	});

	async function handleRestore(submit: () => Promise<void>) {
		await submit();
		const result = restoreDatabaseBackup.result;
		if (result?.backupRestoreSuccess) toast.success(result.backupRestoreSuccess);
		if (result?.backupRestoreError) toast.error(result.backupRestoreError);
	}

	async function handleCreateBackup() {
		const result = (await createStoredBackup().updates(manageState)) as unknown as Record<string, string> | null;
		if (result?.backupSuccess) toast.success(result.backupSuccess);
		if (result?.backupError) toast.error(result.backupError);
	}

	async function handleStoredRestore() {
		if (!storedRestoreTarget) return;
		const result = (await restoreStoredBackup({
			fileName: storedRestoreTarget.fileName,
			confirmation: restorePhrase
		} as never).updates(manageState)) as unknown as Record<string, string> | null;
		if (result?.backupSuccess) {
			toast.success(result.backupSuccess);
			storedRestoreTarget = null;
			restorePhrase = '';
		}
		if (result?.backupError) toast.error(result.backupError);
	}

	function formatBytes(bytes: number) {
		return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
	}
	function formatDate(timestamp: number) {
		return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp * 1000));
	}
	function sourceLabel(source: Backup['source']) {
		if (source === 'safety') return 'قبل از بازیابی';
		if (source === 'restore') return 'آپلود بازیابی';
		return 'دستی';
	}

	let restoreConfirmOpen = $state(false);
	let restoreConfirmResolve: ((v: boolean) => void) | null = null;

	function awaitRestoreConfirm(): Promise<boolean> {
		return new Promise((resolve) => {
			restoreConfirmOpen = true;
			restoreConfirmResolve = resolve;
		});
	}
	function resolveRestoreConfirm(confirmed: boolean) {
		restoreConfirmOpen = false;
		restoreConfirmResolve?.(confirmed);
		restoreConfirmResolve = null;
	}
</script>

<div class="backups-va">
	<div class="backup-grid">
		<div class="va-card backup-panel">
			<div class="panel-head">
				<div>
					<div class="panel-title">ساخت پشتیبان</div>
					<div class="panel-sub">نسخه ذخیره‌شده روی سرور و قابل دانلود</div>
				</div>
			</div>
			<div class="panel-body">
				<div class="download-row">
					<div class="big-icon">
						<AnimatedIcon name="database" size={22} />
					</div>
					<div>
						<div class="file-name">skyline-backup.sqlite</div>
						<div class="panel-sub">شامل حساب‌ها، فروشندگان، پلن‌ها، پرداخت‌ها و تنظیمات</div>
					</div>
				</div>
				<button type="button" class="admin-btn admin-btn-primary full-action" onclick={handleCreateBackup}>
					<AnimatedIcon name="database" size={13} />
					<span>ساخت نسخه جدید</span>
				</button>
				<div class="security-note">
					این فایل را در جای امن نگه دارید. فایل پشتیبان می‌تواند داده‌های عملیاتی و امنیتی پنل را شامل شود.
				</div>
			</div>
		</div>

		<div class="va-card backup-panel">
			<div class="panel-head">
				<div>
					<div class="panel-title">بازیابی از فایل</div>
					<div class="panel-sub">دیتابیس فعلی با فایل انتخاب‌شده جایگزین می‌شود</div>
				</div>
			</div>
			<form
				{...restoreDatabaseBackup.enhance(async ({ submit }) => {
					const confirmed = await awaitRestoreConfirm();
					if (!confirmed) return;
					await handleRestore(submit);
				})}
				class="panel-body"
			>
				<label class="drop-zone" for="backup-file">
					<span class="drop-icon"><AnimatedIcon name="cloud" size={16} /></span>
					<span>فایل SQLite را انتخاب کنید</span>
					<small>.sqlite, .sqlite3, .db — حداکثر ۱۰۰ MB</small>
				</label>
				<input
					id="backup-file"
					type="file"
					name="backupFile"
					accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3,application/octet-stream"
					class="file-input"
				/>
				<input
					class="admin-field"
					type="text"
					name="confirmation"
					placeholder="RESTORE SKYLINE"
					autocomplete="off"
					dir="ltr"
				/>
				<div class="restore-warning">
					<AnimatedIcon name="shield" size={14} />
					<span>قبل از جایگزینی، یک نسخه امن از دیتابیس فعلی در پوشه backups ذخیره می‌شود.</span>
				</div>
				<button type="submit" class="admin-btn admin-btn-danger full-action" disabled={restoreDatabaseBackup.pending > 0}>
					<AnimatedIcon name="cloud" size={13} />
					<span>{restoreDatabaseBackup.pending > 0 ? 'در حال بازیابی...' : 'بازیابی دیتابیس'}</span>
				</button>
			</form>
		</div>
	</div>

	<div class="va-card backup-history">
		<div class="panel-head">
			<div>
				<div class="panel-title">پشتیبان‌های قبلی</div>
				<div class="panel-sub">آخرین عملیات پشتیبان‌گیری و بازیابی دستی در همین سرور ذخیره می‌شود</div>
			</div>
			<button type="button" class="va-chip" onclick={handleCreateBackup}>
				<AnimatedIcon name="list" size={11} />
				ساخت نسخه
			</button>
		</div>
		{#if backups.length === 0}
			<div class="empty-history">هنوز نسخه‌ای روی سرور ذخیره نشده است.</div>
		{:else}<table class="va-table">
			<thead>
				<tr>
					<th>فایل</th>
					<th>منبع</th>
					<th class="align-left">حجم</th>
					<th class="align-left">زمان ساخت</th>
					<th class="align-left"></th>
				</tr>
			</thead>
			<tbody>
				{#each visibleBackups as backup (backup.fileName)}<tr>
					<td>
						<div class="file-cell">
							<span class="file-icon"><AnimatedIcon name="database" size={12} /></span>
							<span>{backup.fileName}</span>
						</div>
					</td>
					<td><span class="va-mono">{sourceLabel(backup.source)}</span></td>
					<td class="align-left"><span class="va-mono">{formatBytes(backup.sizeBytes)}</span></td>
					<td class="align-left"><span class="va-mono">{formatDate(backup.createdAt)}</span></td>
					<td class="align-left">
						<a href={`${backupDownloadPath}?file=${encodeURIComponent(backup.fileName)}`} class="va-icon-btn" aria-label="دانلود">
							<AnimatedIcon name="cloud" size={12} />
						</a>
						<button type="button" class="va-icon-btn" aria-label="بازیابی" onclick={() => { storedRestoreTarget = backup; restorePhrase = ''; }}>
							<AnimatedIcon name="check" size={12} />
						</button>
					</td>
				</tr>{/each}
			</tbody>
		</table>
		<div class="history-pagination">
			<span>{pageNumber} / {totalPages}</span>
			<div>
				<button type="button" class="va-icon-btn" disabled={pageNumber <= 1} onclick={() => pageNumber--}><span class="pagination-prev-icon"><AnimatedIcon name="chevron-left" size={12} /></span></button>
				<button type="button" class="va-icon-btn" disabled={pageNumber >= totalPages} onclick={() => pageNumber++}><AnimatedIcon name="chevron-left" size={12} /></button>
			</div>
		</div>{/if}
	</div>
</div>

<ConfirmDialog
	open={restoreConfirmOpen}
	title="بازیابی دیتابیس"
	description="دیتابیس فعلی با فایل انتخاب‌شده جایگزین می‌شود. این عملیات قابل بازگشت نیست."
	confirmLabel="بله، بازیابی کن"
	intent="danger"
	onConfirm={() => resolveRestoreConfirm(true)}
	onClose={() => resolveRestoreConfirm(false)}
/>

<ConfirmDialog
	open={storedRestoreTarget !== null}
	title="بازیابی نسخه ذخیره‌شده"
	description="برای تأیید، عبارت RESTORE SKYLINE را در کادر زیر وارد کنید. پیش از جایگزینی یک نسخه ایمنی ذخیره می‌شود."
	confirmLabel="بازیابی"
	intent="danger"
	confirmDisabled={restorePhrase !== 'RESTORE SKYLINE'}
	onConfirm={handleStoredRestore}
	onClose={() => { storedRestoreTarget = null; restorePhrase = ''; }}
>
	<input class="admin-field restore-phrase" bind:value={restorePhrase} placeholder="RESTORE SKYLINE" dir="ltr" autocomplete="off" />
</ConfirmDialog>

<style>
	.backups-va {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.backup-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	.backup-panel,
	.backup-history {
		overflow: hidden;
		padding: 0;
	}

	.empty-history {
		padding: 28px 18px;
		color: var(--va-text-muted);
		font-size: 13px;
	}

	.history-pagination {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 18px;
		border-top: 1px solid var(--va-border);
		color: var(--va-text-muted);
		font: 500 12px var(--va-font-mono);
	}

	.history-pagination div {
		display: flex;
		gap: 6px;
	}

	.restore-phrase {
		width: 100%;
		margin-top: 14px;
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
		margin-top: 3px;
		color: var(--va-text-faint);
		font: 500 11px var(--va-font-mono);
	}

	.panel-body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 18px;
	}

	.download-row {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	.big-icon {
		width: 56px;
		height: 56px;
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		border: 1px solid var(--va-border);
		border-radius: 8px;
		background: var(--va-bg-raised);
		color: var(--va-accent);
	}

	.file-name {
		color: var(--va-text);
		font: 500 14px var(--va-font-mono);
	}

	.full-action {
		justify-content: center;
		padding: 10px 14px;
		font-size: 13px;
	}

	.security-note,
	.restore-warning {
		color: var(--va-text-faint);
		font: 500 11px/1.7 var(--va-font-mono);
	}

	.drop-zone {
		display: grid;
		place-items: center;
		gap: 8px;
		padding: 24px 20px;
		border: 1px dashed var(--va-border-strong);
		border-radius: 8px;
		background: var(--va-bg-raised);
		color: var(--va-text);
		text-align: center;
		cursor: pointer;
	}

	.drop-zone small {
		color: var(--va-text-faint);
		font: 500 11px var(--va-font-mono);
	}

	.drop-icon {
		width: 36px;
		height: 36px;
		display: grid;
		place-items: center;
		border-radius: 999px;
		background: var(--va-bg-panel);
		color: var(--va-text-muted);
	}

	.file-input {
		color: var(--va-text-muted);
		font-size: 12px;
	}

	.restore-warning {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border: 1px solid color-mix(in srgb, var(--va-warning) 25%, transparent);
		border-radius: 6px;
		background: color-mix(in srgb, var(--va-warning) 8%, transparent);
		color: var(--va-warning);
	}

	.align-left {
		text-align: left !important;
	}

	.file-cell {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.file-icon {
		width: 26px;
		height: 26px;
		display: grid;
		place-items: center;
		border-radius: 5px;
		background: var(--va-bg-raised);
		color: var(--va-success);
	}

	.fresh-chip {
		padding: 1px 6px;
		border-radius: 3px;
		background: color-mix(in srgb, var(--va-success) 10%, transparent);
		color: var(--va-success);
		font: 500 10px var(--va-font-mono);
	}

	@media (max-width: 900px) {
		.backup-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
