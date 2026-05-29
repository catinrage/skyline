<script lang="ts">
	import { toast } from 'svelte-sonner';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import { updateMessageCommand } from '../../../../../routes/reseller/page.remote';

	type Props = {
		data: { reseller: { username: string; customMessage: string } };
		resellerState: any;
	};

	let { data, resellerState }: Props = $props();

	let draft = $derived(data.reseller.customMessage ?? '');

	async function handleSave() {
		try {
			const result = (await updateMessageCommand({ message: draft }).updates(
				resellerState
			)) as Record<string, unknown> | null;
			if (result?.messageSuccess) toast.success(result.messageSuccess as string);
			if (result?.messageError) toast.error(result.messageError as string);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'ذخیره پیام انجام نشد.');
		}
	}

	function clearMessage() {
		draft = '';
	}
</script>

<div class="message-va">
	<div class="message-actions">
		<button type="button" class="admin-btn admin-btn-ghost" onclick={clearMessage}>
			<AnimatedIcon name="spark-down" size={13} />
			<span>پاک کردن</span>
		</button>
		<button
			type="button"
			class="admin-btn admin-btn-primary"
			disabled={updateMessageCommand.pending > 0}
			onclick={handleSave}
		>
			<AnimatedIcon name="check" size={13} />
			<span>{updateMessageCommand.pending > 0 ? 'در حال ذخیره...' : 'ذخیره'}</span>
		</button>
	</div>

	<div class="message-grid">
		<div class="va-card message-editor">
			<div>
				<div class="va-section-label">متن پیام</div>
				<textarea
					id="reseller-message"
					bind:value={draft}
					rows="9"
					class="admin-field message-textarea"
					placeholder="مثلاً: برای تمدید یا سوال درباره کانفیگ‌ها در تلگرام پیام بدهید."
				></textarea>
				<div class="textarea-foot">
					<span>پیشنهاد: شماره تماس و ساعت پاسخگویی</span>
					<span>{draft.length.toLocaleString('fa-IR-u-nu-latn')} / ۵۰۰ کاراکتر</span>
				</div>
			</div>

			<div class="info-strip">
				<div class="va-section-label">چطور به پنل مشتری اضافه می‌شود؟</div>
				<div>
					لینک‌های پنل کاربر شما با پارامتر
					<span class="inline-code" dir="ltr">?ri={data.reseller.username}</span>
					ساخته می‌شوند. این پیام کنار پیام مدیر در همان صفحه دیده می‌شود.
				</div>
			</div>
		</div>

		<div class="preview-column">
			<div class="va-section-label">پیش‌نمایش</div>
			<div class="preview-shell">
				<div class="message-preview success">
					<div class="preview-icon">
						<AnimatedIcon name="message" size={11} />
					</div>
					<div>
						<div class="preview-kicker">پیام فروشنده · {data.reseller.username}</div>
						<div class="preview-copy">
							{draft.trim() || 'پیام اختصاصی فروشنده هنوز تنظیم نشده است.'}
						</div>
					</div>
				</div>
				<div class="preview-note">پیش‌نمایش · صفحه کاربر</div>
			</div>

			<div class="history-block">
				<div class="va-section-label">آمار پنل کاربر</div>
				<div class="history-list">
					<div class="history-row">
						<span>وضعیت پیام</span>
						<strong>{draft.trim() ? 'فعال' : 'خالی'}</strong>
					</div>
					<div class="history-row">
						<span>نمایش برای مشتریان شما</span>
						<strong>{draft.trim() ? 'فعال' : 'غیرفعال'}</strong>
					</div>
					<div class="history-row">
						<span>شناسه لینک فروشنده</span>
						<strong dir="ltr">{data.reseller.username}</strong>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

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
		min-height: 210px;
		padding: 12px 14px;
		border-radius: 6px;
		background: var(--va-bg-raised);
		color: var(--va-text);
		font-size: 13px;
		line-height: 1.8;
		resize: vertical;
	}

	.textarea-foot {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		margin-top: 6px;
		color: var(--va-text-faint);
		font: 500 10.5px var(--va-font-mono);
	}

	.info-strip {
		padding: 10px 14px;
		border: 1px solid var(--va-border);
		border-radius: 6px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		font-size: 12px;
		line-height: 1.7;
	}

	.inline-code {
		display: inline-block;
		margin: 0 4px;
		padding: 1px 6px;
		border-radius: 3px;
		background: var(--va-bg);
		color: var(--va-accent);
		font-family: var(--va-font-mono);
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
		border-inline-start: 3px solid var(--va-success);
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
		background: color-mix(in srgb, var(--va-success) 10%, transparent);
		color: var(--va-success);
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
		display: flex;
		justify-content: space-between;
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
		.message-grid {
			grid-template-columns: 1fr;
		}

		.message-actions > button {
			flex: 1;
		}
	}
</style>
