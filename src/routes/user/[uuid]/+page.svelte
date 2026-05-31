<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import Brand from '$lib/components/admin/Brand.svelte';
	import Modal from '$lib/components/admin/Modal.svelte';
	import ImagePreviewModal from '$lib/components/admin/ImagePreviewModal.svelte';
	import { applyStoredTheme, readStoredTheme, type ThemeMode } from '$lib/theme';
	import { formatExpiry, formatRelativeExpiry, formatTraffic } from '$lib/utils/format';
	import type { ClientStatus } from '$lib/types/vpn';
	import { createClientTicketCommand, measurePing, replyClientTicketAsClientCommand, sendConfigIssueReport } from './page.remote';
	import type { UserPanelData } from './user-panel.server';

	type PageData = {
		initialUserPanel: UserPanelData;
	};

	let { data }: { data: PageData } = $props();

	const panelData = $derived(data.initialUserPanel);
	let copyState = $state<'idle' | 'success' | 'error'>('idle');
	let refreshPulse = $state(false);
	let theme = $state<ThemeMode>('dark');
	let appsExpanded = $state(false);
	let ticketSubject = $state('');
	let ticketMessage = $state('');
	let replyMessage = $state('');
	let ticketModalOpen = $state(false);
	let previewImage = $state<{ src: string; alt: string } | null>(null);
	let speedTesting = $state(false);
	let liveSpeedMbps = $state<number | null>(null);
	let streamedSpeedMbps = $state<number | null>(null);
	let lastSuccessfulPingMs = $state<number | null>(null);

	const statusCopy: Record<
		ClientStatus,
		{ label: string; tone: 'success' | 'warning' | 'danger' | 'muted'; description: string }
	> = {
		active: { label: 'فعال', tone: 'success', description: 'کانفیگ فعال و قابل استفاده است.' },
		disabled: { label: 'غیرفعال', tone: 'warning', description: 'کانفیگ از سمت پنل غیرفعال شده است.' },
		depleted: { label: 'اتمام حجم', tone: 'danger', description: 'حجم کانفیگ به پایان رسیده است.' },
		expired: { label: 'منقضی', tone: 'danger', description: 'زمان اعتبار کانفیگ تمام شده است.' }
	};

	const usagePercent = $derived(
		panelData.client.usageRatio === null ? 0 : Math.round(Math.min(100, Math.max(0, panelData.client.usageRatio * 100)))
	);
	const quotaText = $derived(panelData.client.totalBytes === null ? 'نامحدود' : formatTraffic(panelData.client.totalBytes, { maximumFractionDigits: 0 }));
	const remainingText = $derived(panelData.client.remainingBytes === null ? 'نامحدود' : formatTraffic(panelData.client.remainingBytes));
	const pingWidgetEnabled = $derived(panelData.features.proxyPing);
	const speedWidgetEnabled = $derived(panelData.features.speedTestWidget);
	const pingAllowed = $derived(canUseOperationalActions(panelData.client.status));
	const ticketAllowed = $derived(panelData.features.configIssueReport && panelData.client.status === 'active');
	const visibleClientApps = $derived(panelData.clientAppLinks.filter((item) => item.name && item.downloadUrl));
	const lastPingMs = $derived(lastSuccessfulPingMs);
	const lastSpeedMbps = $derived(streamedSpeedMbps);
	const latencyButtonLabel = $derived(
		measurePing.pending > 0 ? 'در حال تست...' : lastPingMs === null ? 'تست تاخیر' : `${lastPingMs}ms`
	);

	async function refreshPanel() {
		refreshPulse = true;
		try {
			await invalidateAll();
		} finally {
			window.setTimeout(() => {
				refreshPulse = false;
			}, 700);
		}
	}

	function canUseOperationalActions(status: ClientStatus) {
		return status !== 'depleted' && status !== 'expired' && status !== 'disabled';
	}

	function getDisabledReason(status: ClientStatus) {
		if (status === 'depleted') return 'به دلیل تمام‌شدن حجم، این عملیات در دسترس نیست.';
		if (status === 'expired') return 'به دلیل منقضی‌شدن کانفیگ، این عملیات در دسترس نیست.';
		if (status === 'disabled') return 'به دلیل غیرفعال‌بودن کانفیگ، این عملیات در دسترس نیست.';
		return '';
	}

	function getExpiryPrimary(client: UserPanelData['client']) {
		if (client.expiresAt) return formatRelativeExpiry(client.expiresAt);
		if (client.activationExpiryDays) return `${client.activationExpiryDays} روز پس از اولین استفاده`;
		return 'بدون انقضا';
	}

	function getExpirySecondary(client: UserPanelData['client']) {
		if (client.expiresAt) return formatExpiry(client.expiresAt);
		if (client.activationExpiryDays) return 'انقضا از اولین اتصال محاسبه می‌شود.';
		return 'زمان پایان مشخص نشده است.';
	}

	function getMetaDescription(state: UserPanelData) {
		const traffic =
			state.client.totalBytes === null
				? `مصرف ${formatTraffic(state.client.usedBytes)} با ترافیک نامحدود`
				: `${formatTraffic(state.client.remainingBytes)} باقی مانده`;
		return `${state.client.email} · ${traffic} · ${getExpiryPrimary(state.client)}`;
	}

	function getAppOs(os: UserPanelData['clientAppLinks'][number]['os']) {
		if (os === 'ios') return 'iOS';
		if (os === 'windows') return 'Windows';
		if (os === 'linux') return 'Linux';
		return 'Android';
	}

	type SpeedStreamEvent =
		| { type: 'progress'; downloadMbps: number; downloadedBytes: number; durationSeconds: number }
		| {
				type: 'complete';
				downloadMbps: number;
				downloadedBytes: number;
				durationSeconds: number;
				speedSuccess: string;
			}
		| { type: 'error'; speedError: string };

	function blendColor(start: [number, number, number], end: [number, number, number], ratio: number) {
		const boundedRatio = Math.min(1, Math.max(0, ratio));
		const channel = (index: number) => Math.round(start[index] + (end[index] - start[index]) * boundedRatio);
		return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
	}

	function getLatencyColor(latencyMs: number) {
		if (latencyMs <= 400) return 'rgb(45 255 155)';
		if (latencyMs <= 800) {
			return blendColor([45, 255, 155], [255, 224, 84], (latencyMs - 400) / 400);
		}
		return blendColor([255, 224, 84], [255, 75, 88], (latencyMs - 800) / 400);
	}

	function handleSpeedEvent(event: SpeedStreamEvent) {
		if (event.type === 'progress') {
			liveSpeedMbps = event.downloadMbps;
		}

		if (event.type === 'complete') {
			streamedSpeedMbps = event.downloadMbps;
			toast.success('انجام شد', { description: event.speedSuccess });
		}

		if (event.type === 'error') {
			toast.error('خطا', { description: event.speedError });
		}
	}

	async function runLiveSpeedTest(uuid: string) {
		if (speedTesting) return;

		speedTesting = true;
		liveSpeedMbps = null;

		try {
			const response = await fetch(`/user/${encodeURIComponent(uuid)}/speed-test`, { method: 'POST' });

			if (!response.ok) {
				const result = (await response.json().catch(() => ({}))) as { speedError?: string };
				toast.error('خطا', { description: result.speedError ?? 'تست سرعت انجام نشد.' });
				return;
			}

			const reader = response.body?.getReader();
			if (!reader) {
				toast.error('خطا', { description: 'پاسخ تست سرعت قابل خواندن نیست.' });
				return;
			}

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				buffer += decoder.decode(value, { stream: !done });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.trim()) continue;
					handleSpeedEvent(JSON.parse(line) as SpeedStreamEvent);
				}

				if (done) break;
			}

			if (buffer.trim()) {
				handleSpeedEvent(JSON.parse(buffer) as SpeedStreamEvent);
			}
		} catch (error) {
			toast.error('خطا', {
				description: error instanceof Error ? error.message : 'تست سرعت انجام نشد.'
			});
		} finally {
			speedTesting = false;
			liveSpeedMbps = null;
		}
	}

	async function copyConfigUrl(configUrl: string) {
		try {
			await navigator.clipboard.writeText(configUrl);
			copyState = 'success';
			toast.success('کپی شد', {
				description: 'لینک کانفیگ در کلیپ‌بورد قرار گرفت.'
			});
		} catch {
			copyState = 'error';
			toast.error('کپی انجام نشد', {
				description: 'مرورگر اجازه دسترسی به کلیپ‌بورد نداد.'
			});
		}

		window.setTimeout(() => {
			copyState = 'idle';
		}, 1800);
	}

	async function createCustomerTicket() {
		const result = await createClientTicketCommand({ subject: ticketSubject, message: ticketMessage, attachment: null });
		if (result.ticketSuccess) {
			toast.success(result.ticketSuccess);
			ticketSubject = '';
			ticketMessage = '';
			await refreshPanel();
		}
		if (result.ticketError) toast.error(result.ticketError);
	}

	async function replyCustomerTicket(ticketId: number) {
		const result = await replyClientTicketAsClientCommand({ ticketId, message: replyMessage, attachment: null });
		if (result.ticketSuccess) {
			toast.success(result.ticketSuccess);
			replyMessage = '';
			await refreshPanel();
		}
		if (result.ticketError) toast.error(result.ticketError);
	}

	async function openExternal(url: string) {
		window.open(url, '_blank', 'noopener,noreferrer');
	}

	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark';
		applyStoredTheme(theme);
	}

	async function submitWithToast<Result extends Record<string, unknown> | undefined>(
		submit: () => Promise<void>,
		getResult: () => Result,
		successKey: string,
		errorKey: string
	) {
		await submit();
		const result = getResult();
		const success = result?.[successKey];
		const error = result?.[errorKey];

		if (typeof success === 'string') toast.success('انجام شد', { description: success });
		if (typeof error === 'string') toast.error('خطا', { description: error });
	}

	onMount(() => {
		theme = readStoredTheme();
		const refreshInterval = window.setInterval(() => {
			void refreshPanel();
		}, 30_000);

		return () => window.clearInterval(refreshInterval);
	});

	$effect(() => {
		if (typeof measurePing.result?.pingMs === 'number') {
			lastSuccessfulPingMs = measurePing.result.pingMs;
		}
	});
</script>

<svelte:head>
	<title>Skyline | {panelData.client.email}</title>
	<meta name="description" content={getMetaDescription(panelData)} />
	<meta property="og:title" content={`Skyline | ${panelData.client.email}`} />
	<meta property="og:description" content={getMetaDescription(panelData)} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={panelData.shareUrl} />
</svelte:head>

{#if !panelData}
	<main class="user-page loading" dir="rtl" in:fade={{ duration: 180 }}>
		<div class="user-loader"></div>
		<p>در حال آماده‌سازی پنل کاربر...</p>
	</main>
{:else}
	{@const state = panelData}
	{@const status = statusCopy[state.client.status]}
	<main class:refresh-pulse={refreshPulse} class="user-page" dir="rtl">
		<header class="public-header">
			<div class="public-brand">
				<Brand size={28} title="Skyline" />
				<span>پنل کاربر</span>
			</div>
			<div class="header-actions">
				<button type="button" class="theme-toggle" onclick={toggleTheme} aria-label={theme === 'dark' ? 'تم روشن' : 'تم تیره'}>
					<span class="toggle-track">
						<span class="toggle-thumb">
							<span class="mdi {theme === 'dark' ? 'mdi-moon-waning-crescent' : 'mdi-white-balance-sunny'}"></span>
						</span>
					</span>
				</button>
				<button type="button" class="icon-button" onclick={refreshPanel} aria-label="رفرش">
					<span class="mdi mdi-cloud-sync-outline"></span>
				</button>
			</div>
		</header>

		<div class="user-stack">
			<section class="intro-block">
				<p class="mono-label">پنل اختصاصی</p>
				<h1>سلام {state.client.email}</h1>
				<p>وضعیت لحظه‌ای حساب و کانفیگ شما. در صورت قطعی، از پایین صفحه گزارش بدهید.</p>
			</section>

			{#if state.adminMessage}
				<section class="edge-card accent">
					<div class="edge-icon">
						<span class="mdi mdi-message-text-outline"></span>
					</div>
					<div>
						<p class="mono-label">پیام مدیر</p>
						<div class="message-text">{state.adminMessage}</div>
					</div>
				</section>
			{/if}

			{#if state.resellerMessage}
				<section class="edge-card success top-message">
					<div class="edge-icon success-icon">
						<span class="mdi mdi-account-tie-outline"></span>
					</div>
					<div>
						<p class="mono-label">پیام فروشنده {state.resellerUsername ? `· ${state.resellerUsername}` : ''}</p>
						<div class="message-text pre-line">{state.resellerMessage}</div>
					</div>
				</section>
			{/if}

			<section class="main-card">
				<div class="client-head">
					<div class="avatar" aria-hidden="true">{state.client.email.slice(0, 1).toUpperCase()}</div>
					<div class="client-main">
						<div class="client-row">
							<strong>{state.client.email}</strong>
							<span class="status-dot tone-{status.tone}">
								<i></i>
								{status.label}
							</span>
							{#if state.features.onlineStatus}
								<span class="online-chip" class:online={state.client.isOnline}>
									<i></i>
									{state.client.isOnline ? 'آنلاین' : state.client.isOnline === false ? 'آفلاین' : 'نامشخص'}
								</span>
							{/if}
						</div>
						<div class="uuid-line" dir="ltr">UUID {state.client.uuid}</div>
					</div>
					<div class="plan-box">
						<span>پلن</span>
						<strong class="plan-quota" dir={state.client.totalBytes === null ? 'rtl' : 'ltr'}>{quotaText}</strong>
						<small>{getExpiryPrimary(state.client)}</small>
					</div>
				</div>

				<div class="metric-block">
					<div class="metric-side">
						<p class="mono-label">مصرف</p>
						<div class="big-meter">
							<strong>{formatTraffic(state.client.usedBytes)}</strong>
							<span>از {quotaText}</span>
						</div>
						<div class="progress-track" aria-label={`${usagePercent}% مصرف`}>
							<span style={`width: ${usagePercent}%`}></span>
						</div>
						<div class="meter-foot">
							<span>{usagePercent}% مصرف</span>
							<span>{remainingText} باقی</span>
						</div>
					</div>

					<div class="metric-divider"></div>

					<div class="metric-side">
						<p class="mono-label">انقضا</p>
						<div class="big-meter">
							<strong>{getExpiryPrimary(state.client)}</strong>
						</div>
						<p class="expiry-note">تاریخ پایان: <span>{getExpirySecondary(state.client)}</span></p>
					</div>
				</div>

				<div class="config-block">
					<div class="config-main">
						<p class="mono-label">کانفیگ VLESS</p>
						{#if state.client.configUrl}
							<div class="config-box" dir="ltr">
								<code>{state.client.configUrl}</code>
							</div>
						{:else}
							<div class="warning-box">برای این ورودی لینک اتصال در دسترس نیست.</div>
						{/if}

						<div class="button-row">
							<button
								type="button"
								class="accent-button"
								disabled={!state.client.configUrl}
								onclick={() => state.client.configUrl && copyConfigUrl(state.client.configUrl)}
							>
								<span class="mdi {copyState === 'success' ? 'mdi-check-bold' : 'mdi-content-copy'}"></span>
								<span>{copyState === 'success' ? 'کپی شد' : 'کپی کانفیگ'}</span>
							</button>

							{#if pingWidgetEnabled}
								<form
									{...measurePing.enhance(async ({ submit }) => {
										await submitWithToast(submit, () => measurePing.result, 'pingSuccess', 'pingError');
									})}
								>
									<button type="submit" class="ghost-button" disabled={!pingAllowed || measurePing.pending > 0}>
										<span class="mdi {measurePing.pending > 0 ? 'mdi-loading mdi-spin' : 'mdi-cloud-outline'}"></span>
										<span
											class:button-result={lastPingMs !== null && measurePing.pending === 0}
											class:latency-value={lastPingMs !== null && measurePing.pending === 0}
											style={lastPingMs !== null && measurePing.pending === 0 ? `--latency-color: ${getLatencyColor(lastPingMs)}` : undefined}
										>
											{latencyButtonLabel}
										</span>
									</button>
								</form>
							{/if}
							{#if speedWidgetEnabled}
								<button
									type="button"
									class="ghost-button"
									class:speed-active={speedTesting}
									disabled={!pingAllowed || speedTesting}
									onclick={() => runLiveSpeedTest(state.client.uuid)}
								>
									<span class="mdi {speedTesting ? 'mdi-loading mdi-spin' : 'mdi-speedometer'}"></span>
									<span>{speedTesting ? (liveSpeedMbps === null ? 'در حال تست...' : `${liveSpeedMbps.toFixed(2)} Mbps`) : 'تست سرعت'}</span>
								</button>
							{/if}

							{#if state.features.configIssueReport}
								<form
									{...sendConfigIssueReport.enhance(async ({ submit }) => {
										await submitWithToast(submit, () => sendConfigIssueReport.result, 'reportSuccess', 'reportError');
									})}
								>
									<button type="submit" class="danger-ghost-button" disabled={!ticketAllowed || sendConfigIssueReport.pending > 0}>
										<span class="mdi {sendConfigIssueReport.pending > 0 ? 'mdi-loading mdi-spin' : 'mdi-flag-outline'}"></span>
										<span>گزارش قطعی</span>
									</button>
								</form>
							{/if}
						</div>

						{#if !pingAllowed || !ticketAllowed}
							<p class="disabled-note">{getDisabledReason(state.client.status)}</p>
						{/if}
					</div>

					<div class="qr-column">
						<div class="qr-frame">
							{#if state.client.configQrCodeDataUrl}
								<img src={state.client.configQrCodeDataUrl} alt={`QR Code for ${state.client.email}`} />
							{:else}
								<span class="mdi mdi-qrcode-remove"></span>
							{/if}
						</div>
						<div class="qr-label">اسکن با اپ کلاینت</div>
					</div>
				</div>
			</section>

			<div class="bottom-grid">
				<section class="apps-card">
					<button type="button" class="apps-head apps-toggle" onclick={() => (appsExpanded = !appsExpanded)} aria-expanded={appsExpanded}>
						<div>
							<h2>اپ‌های پیشنهادی</h2>
							<p>متناسب با دستگاه شما</p>
						</div>
						<span class="mdi {appsExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down'}"></span>
					</button>

					{#if appsExpanded}
						{#if !state.features.clientAppsLinks}
							<div class="empty-line">نمایش اپ‌های کلاینت از سمت مدیر فعال نشده است.</div>
						{:else if visibleClientApps.length === 0}
							<div class="empty-line">هنوز اپی ثبت نشده است.</div>
						{:else}
							<div class="apps-list">
								{#each visibleClientApps.slice(0, 4) as app (app.name)}
									<button type="button" onclick={() => openExternal(app.downloadUrl)}>
										<span class="app-icon"><span class="mdi mdi-apps"></span></span>
										<strong>{app.name}</strong>
										<small>{getAppOs(app.os)}</small>
										<span class="download-chip">
											<span class="mdi mdi-cloud-download-outline"></span>
											دانلود
										</span>
									</button>
								{/each}
							</div>
						{/if}
					{/if}
				</section>
					{#if state.features.clientTickets}
						<button type="button" class="apps-card customer-ticket-launch" onclick={() => (ticketModalOpen = true)}>
							<div class="apps-head">
								<div><h2>تیکت پشتیبانی</h2><p>گفتگو با فروشنده کانفیگ</p></div>
								<span class="ticket-launch-action">
									{state.clientTickets.length === 0 ? 'شروع گفتگو' : 'مشاهده گفتگو'}
									<span class="mdi mdi-chevron-left"></span>
								</span>
							</div>
						</button>
					{/if}
			</div>

			<footer class="user-footer">{state.client.inboundRemark || 'پنل اختصاصی شما'} · پنل اختصاصی شما</footer>
		</div>
	</main>
{/if}

<Modal open={ticketModalOpen} title="پشتیبانی" eyebrow="گفتگو با فروشنده" size="md" onClose={() => (ticketModalOpen = false)}>
	{#if panelData.features.clientTickets}
		<div class="client-ticket-modal">
			{#if panelData.clientTickets.length === 0}
				<div class="new-ticket-compose">
					<input class="ticket-input" bind:value={ticketSubject} placeholder="موضوع تیکت" maxlength="128" />
					<textarea class="ticket-input" bind:value={ticketMessage} placeholder="پیام شما" rows="5"></textarea>
					<button type="button" class="accent-button" disabled={!ticketSubject.trim() || !ticketMessage.trim()} onclick={createCustomerTicket}>ارسال تیکت</button>
				</div>
			{:else}
				{@const ticket = panelData.clientTickets[0]}
				<header class="ticket-chat-head">
					<div>
						<strong>{ticket.subject}</strong>
						<span>گفتگو با فروشنده کانفیگ</span>
					</div>
					<span class="ticket-status" class:is-open={ticket.status === 'open'}>{ticket.status === 'open' ? 'باز' : 'بسته'}</span>
				</header>
				<div class="ticket-thread">
					{#each ticket.messages as message (message.id)}
						<div class="ticket-message" class:from-seller={message.senderType === 'seller'}>
							<span class="ticket-sender">{message.senderType === 'seller' ? 'فروشنده' : 'شما'}</span>
							<p>{message.message}</p>
							{#each message.attachments as attachment (attachment.id)}
								<button type="button" class="ticket-image" onclick={() => (previewImage = { src: attachment.dataUrl, alt: attachment.fileName })}>{attachment.fileName}</button>
							{/each}
						</div>
					{/each}
				</div>
				{#if ticket.status === 'open'}
					<div class="ticket-reply">
						<textarea class="ticket-input" bind:value={replyMessage} placeholder="پاسخ شما" rows="3"></textarea>
						<button type="button" class="accent-button" disabled={!replyMessage.trim()} onclick={() => replyCustomerTicket(ticket.id)}>ارسال پاسخ</button>
					</div>
				{:else}
					<div class="ticket-closed">این گفتگو بسته شده است.</div>
				{/if}
			{/if}
		</div>
	{/if}
</Modal>

<ImagePreviewModal open={previewImage !== null} src={previewImage?.src ?? null} alt={previewImage?.alt} onClose={() => (previewImage = null)} />

<style>
	:global(body) {
		background: var(--va-bg);
	}

	.user-page {
		min-height: 100vh;
		background: var(--va-bg);
		color: var(--va-text);
		direction: rtl;
		font-family: var(--va-font-fa);
		overflow: auto;
	}

	.public-header {
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 0 32px;
		border-bottom: 1px solid var(--va-border);
		background: var(--va-bg);
	}

	.public-brand,
	.header-actions,
	.client-head,
	.client-row,
	.button-row,
	.apps-list button {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.public-brand span {
		padding: 2px 6px;
		border-radius: 3px;
		background: var(--va-bg-raised);
		color: var(--va-text-faint);
		font-size: 10px;
	}

	:global(.public-brand .brand-text) {
		font-size: 0.78rem;
	}

	.theme-toggle {
		display: inline-flex;
		align-items: center;
		border: 0;
		background: transparent;
		padding: 0;
		cursor: pointer;
	}

	.toggle-track {
		position: relative;
		width: 44px;
		height: 24px;
		border: 1px solid var(--va-border);
		border-radius: 999px;
		background: var(--va-bg-raised);
	}

	.toggle-thumb {
		position: absolute;
		top: 2px;
		inset-inline-start: 2px;
		width: 18px;
		height: 18px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: var(--va-bg-panel);
		color: var(--va-text);
		box-shadow: 0 4px 12px rgb(0 0 0 / 18%);
		transition: inset-inline-start 180ms ease;
		font-size: 11px;
	}

	:global(html[data-theme='dark']) .toggle-thumb {
		inset-inline-start: 22px;
	}

	.icon-button {
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		border: 1px solid transparent;
		border-radius: 6px;
		background: transparent;
		color: var(--va-text-muted);
		cursor: pointer;
	}

	.icon-button:hover {
		background: var(--va-bg-raised);
		color: var(--va-text);
	}

	.user-stack {
		width: min(920px, 100%);
		margin: 0 auto;
		padding: 28px 24px 80px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.intro-block h1 {
		margin: 6px 0 0;
		color: var(--va-text);
		font-size: 26px;
		font-weight: 600;
		letter-spacing: -0.3px;
	}

	.intro-block p {
		margin: 8px 0 0;
		color: var(--va-text-muted);
		font-size: 13px;
		line-height: 1.7;
	}

	.mono-label {
		margin: 0;
		color: var(--va-text-faint);
		font-size: 10.5px;
		letter-spacing: 0.5px;
		text-transform: uppercase;
	}

	.edge-card {
		display: flex;
		gap: 10px;
		border: 1px solid var(--va-border);
		border-inline-start-width: 3px;
		border-radius: 8px;
		background: var(--va-bg-panel);
		padding: 12px 14px;
	}

	.edge-card.accent {
		border-inline-start-color: var(--va-accent);
	}

	.edge-card.success {
		border-inline-start-color: var(--va-success);
		padding: 14px 16px;
	}

	.top-message {
		margin-top: -4px;
	}

	.success-icon {
		background: color-mix(in srgb, var(--va-success) 12%, transparent);
		color: var(--va-success);
	}

	.edge-icon {
		width: 24px;
		height: 24px;
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		border-radius: 5px;
		background: var(--va-accent-soft);
		color: var(--va-accent);
	}

	.message-text {
		margin-top: 5px;
		color: var(--va-text);
		font-size: 13px;
		line-height: 1.7;
	}

	.pre-line {
		white-space: pre-line;
	}

	.main-card,
	.apps-card {
		overflow: hidden;
		border: 1px solid var(--va-border);
		border-radius: 8px;
		background: var(--va-bg-panel);
	}

	.customer-ticket-launch {
		width: 100%;
		padding: 0;
		color: inherit;
		text-align: right;
	}

	.customer-ticket-launch:hover {
		border-color: var(--va-border-strong);
		background: var(--va-bg-hover);
	}

	.ticket-launch-action {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--va-accent);
		font-size: 12px;
	}

	.client-ticket-modal,
	.new-ticket-compose,
	.ticket-reply {
		display: grid;
		gap: 10px;
	}

	.ticket-input {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid var(--va-border);
		border-radius: 6px;
		background: var(--va-bg-raised);
		color: var(--va-text);
		padding: 10px 12px;
		font: inherit;
		resize: vertical;
	}

	.ticket-chat-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--va-border);
		color: var(--va-text);
	}

	.ticket-chat-head div {
		display: grid;
		gap: 3px;
	}

	.ticket-chat-head strong {
		font-size: 14px;
		font-weight: 600;
	}

	.ticket-chat-head div span {
		color: var(--va-text-muted);
		font-size: 12px;
	}

	.ticket-status {
		padding: 3px 9px;
		border-radius: 5px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		font-size: 11px;
	}

	.ticket-status.is-open {
		background: color-mix(in srgb, var(--va-success) 12%, transparent);
		color: var(--va-success);
	}

	.ticket-thread {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 180px;
		max-height: min(54dvh, 420px);
		overflow: auto;
		padding: 4px 1px;
	}

	.ticket-message {
		align-self: flex-end;
		max-width: 82%;
		padding: 9px 10px;
		border: 1px solid color-mix(in srgb, var(--va-accent) 25%, var(--va-border));
		border-radius: 8px 8px 2px 8px;
		background: color-mix(in srgb, var(--va-accent) 8%, var(--va-bg-raised));
		color: var(--va-text);
		font-size: 13px;
	}

	.ticket-message.from-seller {
		align-self: flex-start;
		border-color: var(--va-border);
		border-radius: 8px 8px 8px 2px;
		background: var(--va-bg-raised);
	}

	.ticket-sender {
		display: block;
		margin-bottom: 4px;
		color: var(--va-text-faint);
		font-size: 10.5px;
	}

	.ticket-message p {
		margin: 0;
		white-space: pre-wrap;
	}

	.ticket-image {
		margin-top: 7px;
		border: 0;
		background: transparent;
		color: var(--va-accent);
		cursor: zoom-in;
	}

	.ticket-reply {
		padding-top: 12px;
		border-top: 1px solid var(--va-border);
	}

	.ticket-closed {
		padding: 12px;
		border: 1px solid var(--va-border);
		border-radius: 6px;
		color: var(--va-text-muted);
		text-align: center;
		font-size: 12px;
	}

	.client-head {
		align-items: flex-start;
		padding: 18px 20px;
		border-bottom: 1px solid var(--va-border);
	}

	.avatar {
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		border: 1px solid var(--va-border);
		border-radius: 8px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		font-weight: 700;
	}

	.client-main {
		min-width: 0;
		flex: 1;
	}

	.client-row {
		flex-wrap: wrap;
	}

	.client-row strong {
		color: var(--va-text);
		font-size: 15px;
		font-weight: 500;
	}

	.status-dot,
	.online-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 8px;
		border-radius: 3px;
		font-size: 11px;
	}

	.status-dot i,
	.online-chip i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}

	.status-dot.tone-success,
	.online-chip.online {
		color: var(--va-success);
		background: color-mix(in srgb, var(--va-success) 10%, transparent);
	}

	.status-dot.tone-warning {
		color: var(--va-warning);
		background: color-mix(in srgb, var(--va-warning) 10%, transparent);
	}

	.status-dot.tone-danger {
		color: var(--va-danger);
		background: color-mix(in srgb, var(--va-danger) 10%, transparent);
	}

	.status-dot.tone-muted,
	.online-chip {
		color: var(--va-text-faint);
		background: var(--va-bg-raised);
	}

	.uuid-line {
		margin-top: 6px;
		color: var(--va-text-faint);
		font-size: 11px;
		text-align: right;
	}

	.plan-box {
		color: var(--va-text-muted);
		font-size: 11px;
		text-align: left;
	}

	.plan-box span,
	.plan-box strong,
	.plan-box small {
		display: block;
	}

	.plan-box strong {
		margin-top: 3px;
		color: var(--va-text);
		font-size: 13px;
		font-weight: 500;
	}

	.plan-box small {
		margin-top: 4px;
		color: var(--va-text-faint);
		font-size: 11px;
		line-height: 1.5;
		text-align: right;
	}

	.plan-quota {
		direction: ltr;
		unicode-bidi: isolate;
	}

	.metric-block {
		display: flex;
		align-items: center;
		gap: 32px;
		padding: 24px 28px;
	}

	.metric-side {
		min-width: 0;
		flex: 1;
	}

	.big-meter {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-top: 4px;
	}

	.big-meter strong {
		color: var(--va-text);
		font-size: 36px;
		font-weight: 600;
		line-height: 1;
		letter-spacing: -1px;
	}

	.big-meter span,
	.meter-foot {
		color: var(--va-text-faint);
		font-size: 11px;
	}

	.progress-track {
		height: 3px;
		margin-top: 14px;
		overflow: hidden;
		border-radius: 2px;
		background: var(--va-border);
	}

	.progress-track span {
		display: block;
		height: 100%;
		background: var(--va-accent);
	}

	.meter-foot {
		display: flex;
		justify-content: space-between;
		margin-top: 8px;
	}

	.metric-divider {
		width: 1px;
		height: 80px;
		background: var(--va-border);
	}

	.expiry-note {
		margin: 14px 0 0;
		color: var(--va-text-muted);
		font-size: 12px;
		line-height: 1.6;
	}

	.expiry-note span {
		color: var(--va-text);
	}

	.latency-value {
		color: var(--latency-color);
		font-weight: 700;
		text-shadow: 0 0 14px color-mix(in srgb, var(--latency-color) 42%, transparent);
	}

	.button-result {
		font-weight: 400;
	}

	.config-block {
		display: flex;
		gap: 24px;
		padding: 20px 28px;
		border-top: 1px solid var(--va-border);
		background: var(--va-bg);
	}

	.config-main {
		min-width: 0;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.config-box {
		overflow: hidden;
		border: 1px solid var(--va-border);
		border-radius: 6px;
		background: var(--va-bg-panel);
		padding: 12px 14px;
		text-align: left;
	}

	.config-box code {
		display: block;
		overflow: hidden;
		color: var(--va-text);
		font-size: 11px;
		line-height: 1.6;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.button-row {
		flex-wrap: wrap;
		gap: 8px;
	}

	.button-row form {
		display: contents;
	}

	.accent-button,
	.ghost-button,
	.danger-ghost-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 34px;
		border-radius: 6px;
		padding: 6px 11px;
		font-size: 12.5px;
		font-weight: 500;
		cursor: pointer;
	}

	.accent-button {
		flex: 1 1 160px;
		border: 0;
		background: var(--va-accent);
		color: white;
	}

	.ghost-button {
		flex: 1 1 140px;
		border: 1px solid var(--va-border);
		background: transparent;
		color: var(--va-text);
	}

	.ghost-button.speed-active {
		border-color: color-mix(in srgb, var(--va-accent) 45%, var(--va-border));
		background: color-mix(in srgb, var(--va-accent) 10%, transparent);
		color: var(--va-text);
	}

	.danger-ghost-button {
		border: 1px solid var(--va-border);
		background: transparent;
		color: var(--va-danger);
	}

	.accent-button:disabled,
	.ghost-button:disabled,
	.danger-ghost-button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.disabled-note {
		margin: 0;
		color: var(--va-text-faint);
		font-size: 11px;
	}

	.qr-column {
		display: flex;
		flex: 0 0 auto;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}

	.qr-frame {
		width: 142px;
		height: 142px;
		display: grid;
		place-items: center;
		border-radius: 6px;
		background: white;
		padding: 6px;
	}

	.qr-frame img {
		width: 130px;
		height: 130px;
		object-fit: contain;
	}

	.qr-frame > span {
		color: #0a0c10;
		font-size: 42px;
	}

	.qr-label {
		color: var(--va-text-faint);
		font-size: 10.5px;
	}

	.bottom-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	.bottom-grid > .apps-card:only-child {
		grid-column: 1 / -1;
	}

	.apps-head {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--va-border);
	}

	.apps-toggle {
		border: 0;
		background: transparent;
		color: inherit;
		text-align: right;
		cursor: pointer;
	}

	.apps-toggle:hover {
		background: var(--va-bg-raised);
	}

	.apps-head h2 {
		margin: 0;
		color: var(--va-text);
		font-size: 13px;
		font-weight: 500;
	}

	.apps-head p {
		margin: 3px 0 0;
		color: var(--va-text-faint);
		font-size: 10.5px;
	}

	.apps-list {
		display: flex;
		flex-direction: column;
	}

	.apps-list button {
		width: 100%;
		border: 0;
		border-bottom: 1px solid var(--va-border);
		background: transparent;
		color: var(--va-text);
		padding: 10px 16px;
		text-align: right;
		cursor: pointer;
	}

	.apps-list button:last-child {
		border-bottom: 0;
	}

	.apps-list button:hover {
		background: var(--va-bg-raised);
	}

	.app-icon {
		width: 26px;
		height: 26px;
		display: grid;
		place-items: center;
		border-radius: 5px;
		background: var(--va-bg-raised);
		color: var(--va-accent);
	}

	.apps-list strong {
		flex: 1;
		color: var(--va-text);
		font-size: 12.5px;
		font-weight: 500;
	}

	.apps-list small {
		padding: 1px 6px;
		border-radius: 3px;
		background: var(--va-bg);
		color: var(--va-text-faint);
		font-size: 10px;
	}

	.download-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		border: 1px solid var(--va-border);
		border-radius: 5px;
		color: var(--va-text-muted);
		padding: 4px 9px;
		font-size: 12px;
	}

	.empty-line,
	.warning-box {
		margin: 14px 16px 16px;
		border: 1px solid var(--va-border);
		border-radius: 6px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		padding: 10px 12px;
		font-size: 12px;
		line-height: 1.7;
	}

	.user-footer {
		color: var(--va-text-faint);
		font-size: 10.5px;
		text-align: center;
	}

	.loading {
		display: grid;
		place-items: center;
		align-content: center;
		gap: 18px;
		color: var(--va-text-muted);
	}

	.user-loader {
		width: 54px;
		height: 54px;
		border: 4px solid var(--va-border);
		border-top-color: var(--va-accent);
		border-radius: 50%;
		animation: spin 0.9s linear infinite;
	}

	.refresh-pulse .main-card {
		animation: pulse-card 0.7s ease;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes pulse-card {
		50% {
			box-shadow: 0 0 0 1px var(--va-accent);
		}
	}

	@media (max-width: 760px) {
		.public-header {
			padding: 0 16px;
		}

		.user-stack {
			padding: 14px 16px 24px;
			gap: 14px;
		}

		.intro-block {
			display: none;
		}

		.client-head,
		.config-block,
		.bottom-grid {
			display: flex;
			flex-direction: column;
		}

		.metric-block {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 1px;
			background: var(--va-border);
			border-radius: 6px;
			overflow: hidden;
			padding: 0;
			border-bottom: none;
		}

		.metric-side {
			background: var(--va-bg);
			padding: 12px 14px;
			border: none;
			border-radius: 0;
			height: 100%;
		}

		.metric-divider {
			display: none;
		}

		.big-meter strong {
			font-size: 22px;
			letter-spacing: -0.6px;
		}

		.progress-track {
			margin: 10px 0 0;
		}

		.meter-foot {
			font-size: 10px;
		}

		.config-block {
			padding: 14px 16px;
		}

		.button-row {
			display: grid;
			grid-template-columns: 1fr 1fr auto;
			gap: 6px;
		}

		.accent-button,
		.ghost-button,
		.danger-ghost-button {
			width: 100%;
			min-height: 40px;
			padding: 10px;
		}

		.danger-ghost-button span:last-child {
			display: none;
		}

		.qr-column {
			display: none;
		}

		.bottom-grid {
			gap: 14px;
		}
	}
</style>
