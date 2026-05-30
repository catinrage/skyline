<script lang="ts">
	import { toast } from 'svelte-sonner';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import { updateMessage } from '../../../../../routes/manage/page.remote';

	type Props = {
		data: { userPanelMessage: string; resellerPanelMessage?: string };
	};

	let { data }: Props = $props();
	let userPreviewMessage = $state(data.userPanelMessage ?? '');
	let resellerPreviewMessage = $state(data.resellerPanelMessage ?? '');

	async function handleSubmit(submit: () => Promise<void>) {
		await submit();
		const result = updateMessage.result;
		if (result?.messageSuccess) toast.success(result.messageSuccess);
		if (result?.settingsError) toast.error(result.settingsError);
	}

	function clearMessage() {
		userPreviewMessage = '';
		resellerPreviewMessage = '';
		updateMessage.fields.userMessage.set('');
		updateMessage.fields.resellerMessage.set('');
	}
</script>

<form
	{...updateMessage.enhance(async ({ submit }) => {
		await handleSubmit(submit);
	})}
	class="message-va"
>
	<div class="message-actions">
		<button type="button" class="admin-btn admin-btn-ghost" onclick={clearMessage}>
			<AnimatedIcon name="spark-down" size={13} />
			<span>پاک کردن پیام</span>
		</button>
		<button type="submit" class="admin-btn admin-btn-primary">
			<AnimatedIcon name="check" size={13} />
			<span>ذخیره پیام</span>
		</button>
	</div>

	<div class="message-grid">
		<div class="va-card message-editor">
			<div>
				<div class="va-section-label">متن پیام</div>
				<textarea
					id="manage-user-message"
					{...updateMessage.fields.userMessage.as('text')}
					bind:value={userPreviewMessage}
					rows="6"
					class="admin-field message-textarea"
					placeholder="مثلاً: کاربر گرامی، سرور فرانسه به‌روزرسانی شد."
				></textarea>
			</div>
			<div>
				<div class="va-section-label">پیام مخصوص فروشندگان</div>
				<textarea
					id="manage-reseller-message"
					{...updateMessage.fields.resellerMessage.as('text')}
					bind:value={resellerPreviewMessage}
					rows="6"
					class="admin-field message-textarea"
					placeholder="مثلاً: فروشندگان گرامی، تسویه امشب تا ساعت ۲۳ انجام شود."
				></textarea>
			</div>

			<div class="message-options">
				<div>
					<div class="va-section-label">تن</div>
					<div class="tone-row">
						<button type="button" class="va-chip is-active"><span class="dot accent"></span>اطلاع</button>
						<button type="button" class="va-chip"><span class="dot warning"></span>هشدار</button>
						<button type="button" class="va-chip"><span class="dot danger"></span>اضطراری</button>
					</div>
				</div>
				<div>
					<div class="va-section-label">پایان نمایش</div>
					<button type="button" class="admin-btn admin-btn-ghost option-btn">
						<span>همیشه فعال</span>
						<AnimatedIcon name="chevron-left" size={11} />
					</button>
				</div>
				<div>
					<div class="va-section-label">پیوست</div>
					<button type="button" class="admin-btn admin-btn-ghost option-btn">
						<span>بدون لینک</span>
						<AnimatedIcon name="plus-network" size={11} />
					</button>
				</div>
			</div>

			<div class="info-strip">
				<AnimatedIcon name="shield" size={14} />
				<div>
					پیام کاربران در صفحه کاربر نمایش داده می‌شود و پیام فروشندگان فقط داخل پنل فروشنده دیده می‌شود.
				</div>
			</div>
		</div>

		<div class="preview-column">
			<div class="va-section-label">پیش‌نمایش در پنل کاربر</div>
			<div class="preview-shell">
				<div class="message-preview accent">
					<div class="preview-icon">
						<AnimatedIcon name="message" size={11} />
					</div>
					<div>
						<div class="preview-kicker">پیام مدیر</div>
						<div class="preview-copy">
							{userPreviewMessage.trim() || 'پیام مدیر هنوز تنظیم نشده است.'}
						</div>
					</div>
				</div>
				<div class="message-preview success">
					<div class="preview-icon">
						<AnimatedIcon name="message" size={11} />
					</div>
					<div>
						<div class="preview-kicker">پیام مدیر برای فروشنده</div>
						<div class="preview-copy">
							{resellerPreviewMessage.trim() || 'پیام فروشندگان هنوز تنظیم نشده است.'}
						</div>
					</div>
				</div>
				<div class="preview-note">پیش‌نمایش · پنل کاربر</div>
			</div>

			<div class="history-block">
				<div class="va-section-label">وضعیت انتشار</div>
				<div class="history-list">
					<div class="history-row">
						<span class="dot accent"></span>
						<span>پیام کاربران</span>
						<strong>{userPreviewMessage.trim() ? 'فعال' : 'خالی'}</strong>
					</div>
					<div class="history-row">
						<span class="dot success"></span>
						<span>پیام فروشندگان</span>
						<strong>{resellerPreviewMessage.trim() ? 'فعال' : 'خالی'}</strong>
					</div>
					<div class="history-row">
						<span class="dot warning"></span>
						<span>طول کل پیام‌ها</span>
						<strong>{(userPreviewMessage.length + resellerPreviewMessage.length).toLocaleString('fa-IR-u-nu-latn')}</strong>
					</div>
				</div>
			</div>
		</div>
	</div>
</form>

<style>
	.message-va {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.message-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.message-grid {
		display: grid;
		grid-template-columns: 1.1fr 0.9fr;
		gap: 16px;
	}

	.message-editor {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 18px 20px;
	}

	.message-textarea {
		width: 100%;
		min-height: 190px;
		padding: 12px 14px;
		border-radius: 6px;
		background: var(--va-bg-raised);
		color: var(--va-text);
		font-size: 13px;
		line-height: 1.8;
		resize: vertical;
	}

	.message-options {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}

	.tone-row {
		display: flex;
		gap: 4px;
	}

	.tone-row .va-chip {
		flex: 1;
		justify-content: center;
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: var(--va-text-faint);
	}

	.dot.accent {
		background: var(--va-accent);
	}

	.dot.warning {
		background: var(--va-warning);
	}

	.dot.danger {
		background: var(--va-danger);
	}

	.dot.success {
		background: var(--va-success);
	}

	.option-btn {
		width: 100%;
		justify-content: space-between;
	}

	.info-strip {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		border: 1px solid var(--va-border);
		border-radius: 6px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		font-size: 11.5px;
		line-height: 1.7;
	}

	.preview-column {
		min-width: 0;
	}

	.preview-shell {
		padding: 18px;
		border: 1px solid var(--va-border);
		border-radius: 8px;
		background: var(--va-bg-raised);
	}

	.message-preview {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 14px 16px;
		border: 1px solid var(--va-border);
		border-inline-start: 3px solid var(--va-accent);
		border-radius: 8px;
		background: var(--va-bg-panel);
	}

	.preview-icon {
		width: 22px;
		height: 22px;
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		border-radius: 5px;
		background: var(--va-accent-soft);
		color: var(--va-accent);
	}

	.preview-kicker {
		color: var(--va-text-faint);
		font: 500 11.5px var(--va-font-mono);
		letter-spacing: 0.4px;
		text-transform: uppercase;
	}

	.preview-copy {
		margin-top: 6px;
		color: var(--va-text);
		font-size: 13px;
		line-height: 1.7;
		white-space: pre-line;
	}

	.preview-note {
		margin-top: 10px;
		text-align: center;
		color: var(--va-text-faint);
		font: 500 10.5px var(--va-font-mono);
	}

	.history-block {
		margin-top: 18px;
	}

	.history-list {
		overflow: hidden;
		border: 1px solid var(--va-border);
		border-radius: 6px;
		background: var(--va-bg-panel);
	}

	.history-row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--va-border);
		color: var(--va-text-muted);
		font-size: 12px;
	}

	.history-row:last-child {
		border-bottom: 0;
	}

	.history-row strong {
		color: var(--va-text);
		font: 500 11px var(--va-font-mono);
	}

	@media (max-width: 980px) {
		.message-grid,
		.message-options {
			grid-template-columns: 1fr;
		}

		.message-actions {
			justify-content: stretch;
		}

		.message-actions > button {
			flex: 1;
		}
	}
</style>
