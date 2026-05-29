<script lang="ts">
	import { toast } from 'svelte-sonner';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import { revokeAdminSessionCommand, updateManagerUsername, updatePasskey } from '../../../../../routes/manage/page.remote';

	type Props = {
		data: {
			adminUsername?: string;
			adminSessions?: Array<{ id: number; createdAt: number; lastUsedAt: number; userAgent: string; isCurrent: boolean }>;
		};
	};

	let { data }: Props = $props();
	const sessions = $derived(data.adminSessions ?? []);

	async function handleSubmit(submit: () => Promise<void>) {
		await submit();
		const result = updatePasskey.result;
		if (result?.passkeySuccess) toast.success(result.passkeySuccess);
		if (result?.passkeyError) toast.error(result.passkeyError);
	}

	async function handleUsernameSubmit(submit: () => Promise<void>) {
		await submit();
		const result = updateManagerUsername.result;
		if (result?.passkeySuccess) toast.success(result.passkeySuccess);
		if (result?.passkeyError) toast.error(result.passkeyError);
	}

	async function revokeSession(sessionId: number) {
		const result = await revokeAdminSessionCommand({ sessionId });
		if (result.sessionSuccess) toast.success(result.sessionSuccess);
		if (result.sessionError) toast.error(result.sessionError);
	}

	function formatDate(timestamp: number) {
		return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(timestamp * 1000));
	}
</script>

<div class="passkey-va">
	<div class="passkey-grid">
		<form
			{...updatePasskey.enhance(async ({ submit }) => {
				await handleSubmit(submit);
			})}
			class="va-card passkey-panel"
		>
			<div class="panel-head">
				<div>
					<div class="panel-title">تغییر گذرواژه</div>
					<div class="panel-sub">پس از تغییر، بهتر است نشست‌های دیگر را هم ببندید.</div>
				</div>
			</div>

			<div class="panel-body">
				<div class="field-block">
					<div class="va-section-label">گذرواژه فعلی</div>
					<div class="va-field-shell">
						<input
							id="currentPasskey"
							{...updatePasskey.fields.currentPasskey.as('password')}
							autocomplete="current-password"
						/>
					</div>
				</div>

				<div class="field-block">
					<div class="va-section-label">گذرواژه جدید</div>
					<div class="va-field-shell">
						<input
							id="nextPasskey"
							{...updatePasskey.fields.nextPasskey.as('password')}
							autocomplete="new-password"
						/>
					</div>
				</div>

				<div class="field-block">
					<div class="va-section-label">تکرار گذرواژه</div>
					<div class="va-field-shell">
						<input
							id="confirmPasskey"
							{...updatePasskey.fields.confirmPasskey.as('password')}
							autocomplete="new-password"
						/>
					</div>
				</div>

				<div class="strength-block">
					<div class="strength-head">
						<span>قدرت گذرواژه</span>
						<strong>با سمت سرور اعتبارسنجی می‌شود</strong>
					</div>
					<div class="strength-bars">
						<span></span>
						<span></span>
						<span></span>
						<span class="muted"></span>
					</div>
				</div>

				{#each updatePasskey.fields.currentPasskey.issues() as issue, i (i)}
					<p class="form-error">{issue.message}</p>
				{/each}
				{#each updatePasskey.fields.nextPasskey.issues() as issue, i (i)}
					<p class="form-error">{issue.message}</p>
				{/each}
				{#each updatePasskey.fields.confirmPasskey.issues() as issue, i (i)}
					<p class="form-error">{issue.message}</p>
				{/each}
			</div>

			<div class="panel-footer">
				<button type="reset" class="admin-btn admin-btn-ghost">انصراف</button>
				<button type="submit" class="admin-btn admin-btn-primary">
					<AnimatedIcon name="key" size={13} />
					<span>تغییر گذرواژه</span>
				</button>
			</div>
		</form>

		<div class="side-stack">
			<form
				{...updateManagerUsername.enhance(async ({ submit }) => {
					await handleUsernameSubmit(submit);
				})}
				class="va-card passkey-panel"
			>
				<div class="panel-head">
					<div>
						<div class="panel-title">نام کاربری مدیریت</div>
						<div class="panel-sub">ورود مدیر اکنون با نام کاربری و گذرواژه انجام می‌شود.</div>
					</div>
				</div>
				<div class="panel-body">
					<div class="field-block">
						<div class="va-section-label">نام کاربری</div>
						<div class="va-field-shell">
							<input
								{...updateManagerUsername.fields.username.as('text')}
								value={data.adminUsername ?? 'admin'}
								autocomplete="username"
								dir="ltr"
							/>
						</div>
					</div>
				</div>
				<div class="panel-footer">
					<button type="submit" class="admin-btn admin-btn-primary">
						<AnimatedIcon name="check" size={13} />
						<span>ذخیره نام کاربری</span>
					</button>
				</div>
			</form>

			<div class="va-card passkey-panel">
				<div class="panel-head">
					<div>
						<div class="panel-title">نشست‌های فعال</div>
						<div class="panel-sub">نشست فعلی مدیر در کوکی امن نگه‌داری می‌شود</div>
					</div>
				</div>
				<div class="session-list">
					{#each sessions as session (session.id)}<div class="session-row">
						<div class="small-icon success">
							<AnimatedIcon name="shield" size={12} />
						</div>
						<div>
							<div class="session-title">{session.userAgent || 'مرورگر ناشناس'}</div>
							<div class="panel-sub">آخرین استفاده: {formatDate(session.lastUsedAt || session.createdAt)}</div>
						</div>
						{#if session.isCurrent}<span class="current-chip">فعلی</span>{/if}
						<button type="button" class="admin-btn admin-btn-ghost" onclick={() => revokeSession(session.id)}>لغو</button>
					</div>{/each}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.passkey-va {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.passkey-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	.side-stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.passkey-panel {
		overflow: hidden;
		padding: 0;
	}

	.panel-head,
	.panel-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--va-border);
	}

	.panel-footer {
		justify-content: flex-end;
		border-top: 1px solid var(--va-border);
		border-bottom: 0;
	}

	.panel-body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 18px;
	}

	.panel-title,
	.session-title {
		color: var(--va-text);
		font-size: 13px;
		font-weight: 500;
	}

	.panel-sub {
		margin-top: 3px;
		color: var(--va-text-faint);
		font: 500 11px var(--va-font-mono);
	}

	.field-block {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.strength-head {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 6px;
		color: var(--va-text-faint);
		font: 500 11px var(--va-font-mono);
	}

	.strength-head strong {
		color: var(--va-success);
		font-weight: 500;
	}

	.strength-bars {
		display: flex;
		gap: 4px;
	}

	.strength-bars span {
		flex: 1;
		height: 4px;
		border-radius: 2px;
		background: var(--va-success);
	}

	.strength-bars span.muted {
		background: var(--va-border);
	}

	.form-error {
		margin: 0;
		color: var(--va-danger);
		font-size: 12px;
	}

	.webauthn-row,
	.session-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 18px;
	}

	.small-icon {
		width: 36px;
		height: 36px;
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		border: 1px solid var(--va-border);
		border-radius: 8px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
	}

	.small-icon.success {
		color: var(--va-success);
	}

	.session-list {
		display: flex;
		flex-direction: column;
	}

	.current-chip {
		margin-inline-start: auto;
		padding: 1px 6px;
		border-radius: 3px;
		background: color-mix(in srgb, var(--va-success) 10%, transparent);
		color: var(--va-success);
		font: 500 10px var(--va-font-mono);
	}

	@media (max-width: 900px) {
		.passkey-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
