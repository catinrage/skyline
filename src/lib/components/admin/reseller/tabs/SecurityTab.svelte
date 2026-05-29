<script lang="ts">
	import { toast } from 'svelte-sonner';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import { changePasswordCommand, revokeOwnSessionCommand, updateProfileCommand } from '../../../../../routes/reseller/page.remote';

	type Props = {
		resellerState: any;
	};

	let { resellerState }: Props = $props();

	let currentPassword = $state('');
	let nextPassword = $state('');
	let confirmPassword = $state('');
	let email = $state('');
	const currentEmail = $derived(String(resellerState.current?.reseller?.email ?? ''));
	const sessions = $derived(resellerState.current?.sessions ?? []);

	$effect(() => {
		if (!email && currentEmail) {
			email = currentEmail;
		}
	});

	async function handleChange() {
		try {
			const result = (await changePasswordCommand({
				currentPassword,
				nextPassword,
				confirmPassword
			}).updates(resellerState)) as Record<string, unknown> | null;

			if (result?.passwordSuccess) {
				toast.success(result.passwordSuccess as string);
				currentPassword = '';
				nextPassword = '';
				confirmPassword = '';
			}
			if (result?.passwordError) toast.error(result.passwordError as string);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'تغییر گذرواژه انجام نشد.');
		}
	}

	async function handleProfileSave() {
		try {
			const result = (await updateProfileCommand({ email }).updates(resellerState)) as Record<string, unknown> | null;
			if (result?.profileSuccess) toast.success(result.profileSuccess as string);
			if (result?.profileError) toast.error(result.profileError as string);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'ذخیره اطلاعات حساب انجام نشد.');
		}
	}

	async function revokeSession(sessionId: number) {
		const result = (await revokeOwnSessionCommand({ sessionId }).updates(resellerState)) as unknown as Record<string, string> | null;
		if (result?.sessionSuccess) toast.success(result.sessionSuccess);
		if (result?.sessionError) toast.error(result.sessionError);
	}

	function formatDate(timestamp: number) {
		return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(timestamp * 1000));
	}
</script>

<div class="security-res-va">
	<div class="security-grid">
		<div class="va-card security-panel">
			<div class="panel-head">
				<div>
					<div class="panel-title">تغییر گذرواژه</div>
					<div class="panel-sub">برای امنیت بیشتر، گذرواژه را دوره‌ای تغییر دهید.</div>
				</div>
			</div>
			<div class="panel-body">
				<div class="field-block">
					<div class="va-section-label">گذرواژه فعلی</div>
					<div class="va-field-shell"><input id="current-pw" type="password" bind:value={currentPassword} autocomplete="current-password" /></div>
				</div>
				<div class="field-block">
					<div class="va-section-label">گذرواژه جدید</div>
					<div class="va-field-shell"><input id="next-pw" type="password" bind:value={nextPassword} autocomplete="new-password" /></div>
				</div>
				<div class="field-block">
					<div class="va-section-label">تکرار گذرواژه جدید</div>
					<div class="va-field-shell"><input id="confirm-pw" type="password" bind:value={confirmPassword} autocomplete="new-password" /></div>
				</div>
				<div class="help-box">
					نکات: حداقل ۱۰ کاراکتر، شامل حروف بزرگ و کوچک، عدد و یک نماد ویژه پیشنهاد می‌شود.
				</div>
			</div>
			<div class="panel-footer">
				<button type="button" class="admin-btn admin-btn-ghost" onclick={() => { currentPassword = ''; nextPassword = ''; confirmPassword = ''; }}>انصراف</button>
				<button
					type="button"
					class="admin-btn admin-btn-primary"
					disabled={changePasswordCommand.pending > 0}
					onclick={handleChange}
				>
					<AnimatedIcon name="key" size={13} />
					<span>{changePasswordCommand.pending > 0 ? 'در حال ذخیره...' : 'تغییر گذرواژه'}</span>
				</button>
			</div>
		</div>

		<div class="va-card security-panel">
				<div class="panel-head">
				<div>
					<div class="panel-title">اطلاعات حساب</div>
					<div class="panel-sub">ایمیل بازیابی و وضعیت امنیتی</div>
				</div>
			</div>
			<div class="panel-body">
				<div class="field-block">
					<div class="va-section-label">ایمیل بازیابی</div>
					<div class="va-field-shell"><input type="email" bind:value={email} autocomplete="email" dir="ltr" placeholder="name@example.com" /></div>
				</div>
				<button type="button" class="admin-btn admin-btn-primary" onclick={handleProfileSave}>
					<AnimatedIcon name="check" size={13} />
					<span>ذخیره اطلاعات حساب</span>
				</button>
			</div>
			<div class="session-list">
				{#each sessions as session (session.id)}
					<div class="session-row">
						<div class="session-icon"><AnimatedIcon name="shield" size={12} /></div>
						<div class="session-info">
							<div class="session-title">{session.userAgent || 'مرورگر ناشناس'}</div>
							<div class="panel-sub">آخرین استفاده: {formatDate(session.lastUsedAt || session.createdAt)}</div>
						</div>
						{#if session.isCurrent}<span class="current-chip">فعلی</span>{/if}
						<button type="button" class="admin-btn admin-btn-ghost" onclick={() => revokeSession(session.id)}>لغو</button>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.security-res-va {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.security-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	.security-panel {
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

	.panel-body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 18px;
	}

	.field-block {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.help-box {
		padding: 10px 12px;
		border: 1px solid var(--va-border);
		border-radius: 6px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		font-size: 11.5px;
		line-height: 1.7;
	}

	.session-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 18px;
	}

	.session-list {
		display: grid;
		border-top: 1px solid var(--va-border);
	}

	.session-info {
		min-width: 0;
		flex: 1;
	}

	.session-info .session-title {
		max-width: 250px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		direction: ltr;
	}

	.session-icon {
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		border-radius: 5px;
		background: var(--va-bg-raised);
		color: var(--va-success);
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
		.security-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
