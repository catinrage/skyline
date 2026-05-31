<script lang="ts">
	import { toast } from 'svelte-sonner';
	import {
		checkTelegramBotCommand,
		connectTelegramBotCommand,
		disconnectTelegramBotCommand,
		pauseTelegramBotCommand,
		reviewTelegramOrderCommand
	} from '../../../../../routes/reseller/page.remote';

	type TelegramBot = {
		id: number;
		username: string;
		displayName: string;
		status: 'active' | 'paused' | 'disabled' | 'error';
		lastError: string;
		webhookUrl: string;
	};

	type TelegramOrder = {
		id: number;
		telegramUserId: number;
		telegramUsername: string;
		customerName: string;
		quotaGb: number;
		durationDays: number;
		priceToman: number;
		receiptText: string;
		receiptFileId: string;
		status: string;
		configUrl: string | null;
		deliveryError: string;
		createdAt: number;
	};

	type Props = {
		data: {
			telegramBotFeatureEnabled: boolean;
			telegramBotAllowed: boolean;
			telegramBot: TelegramBot | null;
			telegramOrders: TelegramOrder[];
		};
		resellerState: ReturnType<typeof import('../../../../../routes/reseller/page.remote').getResellerState>;
	};

	let { data, resellerState }: Props = $props();
	let token = $state('');

	function statusLabel(status: string) {
		if (status === 'pending_review') return 'در انتظار بررسی';
		if (status === 'awaiting_receipt') return 'منتظر رسید';
		if (status === 'approved') return 'تایید شده';
		if (status === 'delivery_failed') return 'ارسال ناموفق';
		if (status === 'rejected') return 'رد شده';
		return status;
	}

	async function connect() {
		const result = await connectTelegramBotCommand({ token }).updates(resellerState);
		if (result?.telegramBotSuccess) {
			token = '';
			toast.success(result.telegramBotSuccess);
		}
		if (result?.telegramBotError) toast.error(result.telegramBotError);
	}

	async function pause(paused: boolean) {
		const result = await pauseTelegramBotCommand({ paused }).updates(resellerState);
		if (result?.telegramBotSuccess) toast.success(result.telegramBotSuccess);
		if (result?.telegramBotError) toast.error(result.telegramBotError);
	}

	async function disconnect() {
		const result = await disconnectTelegramBotCommand().updates(resellerState);
		if (result?.telegramBotSuccess) toast.success(result.telegramBotSuccess);
		if (result?.telegramBotError) toast.error(result.telegramBotError);
	}

	async function checkWebhook() {
		const result = await checkTelegramBotCommand().updates(resellerState);
		if (result?.telegramBotSuccess) {
			if (result.telegramBotSuccess.includes('خطا')) toast.warning(result.telegramBotSuccess);
			else toast.success(result.telegramBotSuccess);
		}
		if (result?.telegramBotError) toast.error(result.telegramBotError);
	}

	async function review(orderId: number, action: 'approve' | 'reject' | 'retry') {
		const result = await reviewTelegramOrderCommand({ orderId, action, note: '' }).updates(resellerState);
		if (result?.telegramOrderSuccess) toast.success(result.telegramOrderSuccess);
		if (result?.telegramOrderError) toast.error(result.telegramOrderError);
	}
</script>

<div class="telegram-tab">
	{#if !data.telegramBotFeatureEnabled}
		<div class="va-card empty">قابلیت بات تلگرام توسط مدیر غیرفعال است.</div>
	{:else if !data.telegramBotAllowed}
		<div class="va-card empty">برای اتصال بات تلگرام باید مدیر، مجوز این فروشنده را فعال کند.</div>
	{:else}
		<section class="va-card bot-card">
			<div class="bot-heading">
				<div>
					<div class="va-section-label">اتصال بات فروش</div>
					<h3>{data.telegramBot ? data.telegramBot.displayName || data.telegramBot.username : 'باتی متصل نیست'}</h3>
				</div>
				{#if data.telegramBot}
					<span class="status {data.telegramBot.status}">{data.telegramBot.status}</span>
				{/if}
			</div>

			{#if data.telegramBot}
				<div class="bot-meta">
					<div><span>نام کاربری</span><strong dir="ltr">@{data.telegramBot.username || data.telegramBot.id}</strong></div>
					<div><span>وبهوک</span><strong dir="ltr">{data.telegramBot.webhookUrl}</strong></div>
				</div>
				{#if data.telegramBot.lastError}
					<p class="error-box">{data.telegramBot.lastError}</p>
				{/if}
			{:else}
				<p class="muted">توکن BotFather را وارد کنید؛ Skyline شناسه بات را می‌خواند و وبهوک را خودکار ثبت می‌کند.</p>
			{/if}

			<div class="connect-row">
				<input bind:value={token} type="password" dir="ltr" placeholder="123456:ABC..." autocomplete="off" />
				<div class="bot-actions">
					<button type="button" class="admin-btn admin-btn-primary" onclick={connect}>اتصال / جایگزینی</button>
					{#if data.telegramBot}
						<button type="button" class="admin-btn admin-btn-ghost" onclick={checkWebhook}>بررسی وبهوک</button>
						<button type="button" class="admin-btn admin-btn-ghost" onclick={() => pause(data.telegramBot?.status === 'active')}>
							{data.telegramBot.status === 'active' ? 'توقف' : 'فعال‌سازی'}
						</button>
						<button type="button" class="admin-btn admin-btn-danger" onclick={disconnect}>قطع کامل</button>
					{/if}
				</div>
			</div>
		</section>

		<section class="orders">
			<div class="va-section-label">سفارش‌های تلگرام</div>
			{#if data.telegramOrders.length === 0}
				<div class="va-card empty">هنوز سفارشی از بات ثبت نشده است.</div>
			{:else}
				{#each data.telegramOrders as order (order.id)}
					<article class="va-card order-card">
						<div class="order-main">
							<strong>#{order.id} · {order.customerName}</strong>
							<span>{order.quotaGb}GB · {order.durationDays} روز · {order.priceToman.toLocaleString('fa-IR-u-nu-latn')} تومان</span>
							<small>@{order.telegramUsername || order.telegramUserId} · {statusLabel(order.status)}</small>
							{#if order.receiptText || order.receiptFileId}
								<p>{order.receiptText || `file_id: ${order.receiptFileId}`}</p>
							{/if}
							{#if order.deliveryError}
								<p class="error">{order.deliveryError}</p>
							{/if}
						</div>
						<div class="order-actions">
							{#if order.status === 'pending_review'}
								<button type="button" class="admin-btn admin-btn-primary" onclick={() => review(order.id, 'approve')}>تایید و ساخت</button>
								<button type="button" class="admin-btn admin-btn-ghost" onclick={() => review(order.id, 'reject')}>رد</button>
							{/if}
							{#if order.status === 'delivery_failed' || order.status === 'approved'}
								<button type="button" class="admin-btn admin-btn-ghost" onclick={() => review(order.id, 'retry')}>ارسال دوباره</button>
							{/if}
						</div>
					</article>
				{/each}
			{/if}
		</section>
	{/if}
</div>

<style>
	.telegram-tab,
	.orders {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.bot-card {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 18px;
	}

	.order-card {
		display: flex;
		justify-content: space-between;
		gap: 18px;
	}

	.bot-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 14px;
	}

	.bot-card h3 {
		margin: 6px 0;
		font-size: 1.2rem;
	}

	.bot-meta {
		display: grid;
		grid-template-columns: minmax(180px, 0.6fr) minmax(260px, 1.4fr);
		gap: 10px;
	}

	.bot-meta div {
		min-width: 0;
		border: 1px solid var(--va-border);
		border-radius: 8px;
		background: var(--va-bg-raised);
		padding: 10px 12px;
	}

	.bot-meta span,
	.muted {
		color: var(--va-text-muted);
	}

	.bot-meta span {
		display: block;
		margin-bottom: 6px;
		font-size: 11px;
	}

	.bot-meta strong {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--va-text);
	}

	.connect-row {
		display: grid;
		grid-template-columns: minmax(240px, 420px) 1fr;
		gap: 10px;
		align-items: center;
	}

	.bot-actions,
	.order-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.connect-row input {
		width: 100%;
		border: 1px solid var(--va-border);
		border-radius: 8px;
		padding: 10px 12px;
		background: var(--va-surface);
		color: var(--va-text);
	}

	.status {
		display: inline-flex;
		border-radius: 999px;
		padding: 4px 10px;
		background: rgba(148, 163, 184, 0.14);
		color: var(--va-muted);
		direction: ltr;
	}

	.status.active {
		background: rgba(34, 197, 94, 0.14);
		color: #16a34a;
	}

	.status.error,
	.error {
		color: #dc2626;
	}

	.error-box {
		margin: 0;
		border: 1px solid rgba(220, 38, 38, 0.28);
		border-radius: 8px;
		background: rgba(220, 38, 38, 0.08);
		padding: 10px 12px;
		color: #f87171;
	}

	.order-main {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.order-main small,
	.empty {
		color: var(--va-muted);
	}

	@media (max-width: 760px) {
		.bot-heading,
		.order-card {
			flex-direction: column;
		}

		.bot-meta,
		.connect-row {
			grid-template-columns: 1fr;
		}
	}
</style>
