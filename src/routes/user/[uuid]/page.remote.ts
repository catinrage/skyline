import { getRequestEvent, form, query, command } from '$app/server';
import { logger } from '$lib/server/logger';
import {
	checkConfigIssueReportCooldown,
	checkLatencyTestCooldown,
	createConfigIssueReport,
	getFeatureSettings,
	isFeatureEnabled,
	recordLatencyTest
} from '$lib/server/admin';
import { measureProxyDownloadSpeed, measureProxyLatency } from '$lib/server/proxy-ping';
import { getVpnClient } from '$lib/server/xui';
import {
	createClientTicket,
	addClientTicketMessage,
	getResellerOwnerByClientUuid
} from '$lib/server/resellers';
import { z } from 'zod';
import { loadUserPanel } from './user-panel.server';

const userPanelLogger = logger.child('user-panel');

export const getUserPanel = query(async () => {
	return loadUserPanel(getRequestEvent());
});

export const sendConfigIssueReport = form(
	z.object({
		message: z.string().trim().max(1000, 'متن تیکت نمی‌تواند بیشتر از ۱۰۰۰ کاراکتر باشد.').optional()
	}),
	async ({ message }) => {
	const event = getRequestEvent();
	const { params, url } = event;
	const uuid = params.uuid!;

	if (!(await isFeatureEnabled('config_issue_report'))) {
		userPanelLogger.warn('Config issue report rejected because feature is disabled.', { uuid });
		return {
			reportError: 'ارسال گزارش قطعی در حال حاضر غیرفعال است.'
		};
	}

	const client = await getVpnClient(uuid, url.hostname);

	if (!client) {
		userPanelLogger.warn('Config issue report rejected because client was not found.', { uuid });
		return {
			reportError: 'کاربر موردنظر پیدا نشد.'
		};
	}

	if (client.status !== 'active') {
		userPanelLogger.warn('Config issue report rejected because client is not active.', {
			uuid,
			status: client.status
		});
		return {
			reportError: 'فقط کانفیگ‌های فعال می‌توانند گزارش قطعی ارسال کنند.'
		};
	}

	const featureSettings = await getFeatureSettings();
	const cooldownSeconds = featureSettings.configIssueReportCooldownMinutes * 60;
	const cooldown = await checkConfigIssueReportCooldown(uuid, cooldownSeconds);

	if (!cooldown.allowed) {
		userPanelLogger.warn('Config issue report rejected because cooldown is active.', {
			uuid,
			retryAfter: cooldown.retryAfter
		});
		return {
			reportError: `این قابلیت هر ${featureSettings.configIssueReportCooldownMinutes.toLocaleString('fa-IR-u-nu-latn')} دقیقه یک‌بار قابل استفاده است. ${cooldown.retryAfter} ثانیه دیگر دوباره تلاش کنید.`
		};
	}

	await createConfigIssueReport(uuid, client.email, message ?? '');
	userPanelLogger.warn('Config issue report created.', {
		uuid,
		email: client.email
	});

	return {
		reportSuccess: 'تیکت برای مدیر ارسال شد.'
	};
	}
);

export const measurePing = form(z.object({}), async () => {
	const event = getRequestEvent();
	const { params, url } = event;
	const uuid = params.uuid!;

	if (!(await isFeatureEnabled('proxy_ping')) && !(await isFeatureEnabled('speed_test_widget'))) {
		userPanelLogger.warn('Latency test rejected because feature is disabled.', { uuid });
		return {
			pingError: 'تست تاخیر کانفیگ در حال حاضر غیرفعال است.'
		};
	}

	const cooldown = await checkLatencyTestCooldown(uuid, 10);

	if (!cooldown.allowed) {
		userPanelLogger.warn('Latency test rejected because cooldown is active.', {
			uuid,
			retryAfter: cooldown.retryAfter
		});
		return {
			pingError: `تست تاخیر برای این کانفیگ موقتاً محدود شده است. ${cooldown.retryAfter} ثانیه دیگر دوباره تلاش کنید.`
		};
	}

	const client = await getVpnClient(uuid, url.hostname);

	if (!client?.configUrl) {
		userPanelLogger.warn('Latency test rejected because config URL is unavailable.', { uuid });
		return {
			pingError: 'برای این کاربر لینک اتصال قابل تست در دسترس نیست.'
		};
	}

	if (client.status === 'depleted') {
		userPanelLogger.warn('Latency test rejected because client traffic is depleted.', { uuid });
		return {
			pingError: 'به دلیل تمام‌شدن ترافیک، تست تاخیر این کانفیگ غیرفعال است.'
		};
	}

	if (client.status === 'expired') {
		userPanelLogger.warn('Latency test rejected because client is expired.', { uuid });
		return {
			pingError: 'به دلیل منقضی‌شدن کانفیگ، تست تاخیر در دسترس نیست.'
		};
	}

	if (client.status === 'disabled') {
		userPanelLogger.warn('Latency test rejected because client is disabled.', { uuid });
		return {
			pingError: 'به دلیل غیرفعال‌بودن کانفیگ، تست تاخیر در دسترس نیست.'
		};
	}

	try {
		const featureSettings = await getFeatureSettings();
		const result = await measureProxyLatency(client.configUrl, featureSettings.latencyTestTargetUrl);
		await recordLatencyTest(uuid);
		userPanelLogger.debug('Latency test completed successfully.', {
			uuid,
			pingMs: result.latencyMs,
			samples: result.samples
		});

		return {
			pingSuccess: 'تست تاخیر با موفقیت انجام شد.',
			pingMs: result.latencyMs
		};
	} catch (err) {
		userPanelLogger.error('Latency test failed.', {
			uuid,
			error: err instanceof Error ? err : undefined
		});
		return {
			pingError: err instanceof Error ? err.message : 'تست تاخیر انجام نشد.'
		};
	}
});

export const measureSpeed = form(z.object({}), async () => {
	const event = getRequestEvent();
	const { params, url } = event;
	const uuid = params.uuid!;

	if (!(await isFeatureEnabled('speed_test_widget'))) {
		userPanelLogger.warn('Speed test rejected because feature is disabled.', { uuid });
		return {
			speedError: 'تست سرعت در حال حاضر غیرفعال است.'
		};
	}

	const cooldown = await checkLatencyTestCooldown(`${uuid}:speed`, 30);

	if (!cooldown.allowed) {
		return {
			speedError: `تست سرعت موقتاً محدود شده است. ${cooldown.retryAfter} ثانیه دیگر دوباره تلاش کنید.`
		};
	}

	const client = await getVpnClient(uuid, url.hostname);

	if (!client?.configUrl) {
		return {
			speedError: 'برای این کاربر لینک اتصال قابل تست در دسترس نیست.'
		};
	}

	if (client.status !== 'active') {
		return {
			speedError: 'تست سرعت فقط برای کانفیگ فعال در دسترس است.'
		};
	}

	try {
		const featureSettings = await getFeatureSettings();
		const result = await measureProxyDownloadSpeed(client.configUrl, featureSettings.speedTestTargetUrl);
		await recordLatencyTest(`${uuid}:speed`);

		return {
			speedSuccess: 'تست سرعت با موفقیت انجام شد.',
			downloadMbps: result.downloadMbps
		};
	} catch (err) {
		userPanelLogger.error('Speed test failed.', {
			uuid,
			error: err instanceof Error ? err : undefined
		});
		return {
			speedError: err instanceof Error ? err.message : 'تست سرعت انجام نشد.'
		};
	}
});

// ── Feature 10: Client ↔ Seller ticket system ─────────────────────────────────

export const createClientTicketCommand = command(
	z.object({
		subject: z.string().trim().min(1, 'موضوع تیکت را وارد کنید.').max(128),
		message: z.string().trim().min(1, 'متن تیکت را وارد کنید.').max(2000),
		attachment: z
			.object({
				fileName: z.string().trim().max(120),
				mimeType: z.string().trim().max(40),
				dataBase64: z.string().max(3_000_000), // max ~2MB base64
				sizeBytes: z.number().int().positive().max(2 * 1024 * 1024)
			})
			.nullable()
			.optional()
	}),
	async ({ subject, message, attachment }) => {
		const { params } = getRequestEvent();
		const uuid = params.uuid!;

		if (!(await isFeatureEnabled('client_tickets'))) {
			return { ticketError: 'سیستم تیکت مشتریان در حال حاضر غیرفعال است.' };
		}

		const owner = await getResellerOwnerByClientUuid(uuid);
		const ownerResellerId = owner?.resellerId ?? null;

		const attachments = attachment ? [attachment] : [];

		try {
			await createClientTicket(uuid, ownerResellerId, subject, message, attachments);
			return { ticketSuccess: 'تیکت شما ثبت شد و به‌زودی پاسخ داده خواهد شد.' };
		} catch (error) {
			return { ticketError: error instanceof Error ? error.message : 'ثبت تیکت انجام نشد.' };
		}
	}
);

export const replyClientTicketAsClientCommand = command(
	z.object({
		ticketId: z.number().int().positive(),
		message: z.string().trim().min(1, 'متن پیام را وارد کنید.').max(2000),
		attachment: z
			.object({
				fileName: z.string().trim().max(120),
				mimeType: z.string().trim().max(40),
				dataBase64: z.string().max(3_000_000),
				sizeBytes: z.number().int().positive().max(2 * 1024 * 1024)
			})
			.nullable()
			.optional()
	}),
	async ({ ticketId, message, attachment }) => {
		const { params } = getRequestEvent();
		const uuid = params.uuid!;
		const attachments = attachment ? [attachment] : [];

		try {
			await addClientTicketMessage(ticketId, uuid, message, attachments);
			return { ticketSuccess: 'پیام ارسال شد.' };
		} catch (error) {
			return { ticketError: error instanceof Error ? error.message : 'ارسال پیام انجام نشد.' };
		}
	}
);
