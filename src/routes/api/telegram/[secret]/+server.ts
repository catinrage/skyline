import { json, type RequestHandler } from '@sveltejs/kit';
import {
	attachReceiptToLatestTelegramOrder,
	createTelegramBotOrderFromCommand,
	getTelegramWebhookContext,
	recordTelegramBotError,
	touchTelegramBotUpdate
} from '$lib/server/resellers';
import { sendTelegramMessage } from '$lib/server/telegram-bot';
import { getFeatureSettings } from '$lib/server/admin';

type TelegramMessage = {
	message_id: number;
	text?: string;
	caption?: string;
	photo?: Array<{ file_id: string }>;
	document?: { file_id: string };
	chat: { id: number };
	from?: { id: number; username?: string; first_name?: string; last_name?: string };
};

type TelegramUpdate = {
	message?: TelegramMessage;
};

function parseOrderCommand(text: string) {
	const parts = text.trim().split(/\s+/);
	if (parts[0] !== '/order' && parts[0] !== 'order' && parts[0] !== 'سفارش') return null;
	const quotaGb = Number(parts[1]);
	const durationDays = Number(parts[2]);
	const priceToman = Number(String(parts[3] ?? '').replace(/[,\u066C]/g, ''));
	const customerName = parts.slice(4).join(' ').trim() || 'مشتری تلگرام';
	if (!Number.isFinite(quotaGb) || !Number.isInteger(durationDays) || !Number.isInteger(priceToman)) {
		throw new Error('فرمت سفارش: /order 10 30 250000 نام مشتری');
	}
	return { quotaGb, durationDays, priceToman, customerName };
}

const helpText = [
	'منوی فروش Skyline',
	'برای ثبت سفارش این قالب را بفرستید:',
	'<code>/order 10 30 250000 نام مشتری</code>',
	'بعد از ثبت سفارش، رسید پرداخت را به همین گفتگو ارسال کنید تا فروشنده در پنل بررسی کند.'
].join('\n');

export const POST: RequestHandler = async ({ params, request }) => {
	const secret = params.secret ?? '';
	const context = await getTelegramWebhookContext(
		secret,
		request.headers.get('x-telegram-bot-api-secret-token')
	);
	if (!context) return json({ ok: true });

	const settings = await getFeatureSettings();
	const update = (await request.json()) as TelegramUpdate;
	const message = update.message;
	if (!message) return json({ ok: true });

	try {
		await touchTelegramBotUpdate(context.bot.id);
		const chatId = message.chat.id;
		const userId = message.from?.id ?? chatId;
		const username = message.from?.username ?? '';
		const text = message.text?.trim() ?? '';

		if (text === '/start' || text === 'start') {
			await sendTelegramMessage(context.token, chatId, helpText, settings.telegramBotSocksProxyUrl);
			return json({ ok: true });
		}

		const fileId = message.photo?.at(-1)?.file_id ?? message.document?.file_id ?? '';
		if (fileId || message.caption) {
			const order = await attachReceiptToLatestTelegramOrder({
				resellerId: context.bot.reseller_id,
				botId: context.bot.id,
				telegramUserId: userId,
				receiptText: message.caption ?? text,
				receiptFileId: fileId
			});
			await sendTelegramMessage(
				context.token,
				chatId,
				order
					? 'رسید ثبت شد و در صف بررسی فروشنده قرار گرفت.'
					: 'سفارش باز برای ثبت رسید پیدا نشد. ابتدا سفارش را با /order ثبت کنید.',
				settings.telegramBotSocksProxyUrl
			);
			return json({ ok: true });
		}

		const parsed = parseOrderCommand(text);
		if (parsed) {
			const order = await createTelegramBotOrderFromCommand({
				resellerId: context.bot.reseller_id,
				botId: context.bot.id,
				telegramUserId: userId,
				telegramUsername: username,
				...parsed
			});
			await sendTelegramMessage(
				context.token,
				chatId,
				`سفارش #${order?.id ?? ''} ثبت شد. لطفا رسید پرداخت را ارسال کنید.`,
				settings.telegramBotSocksProxyUrl
			);
			return json({ ok: true });
		}

		await sendTelegramMessage(context.token, chatId, helpText, settings.telegramBotSocksProxyUrl);
	} catch (error) {
		await recordTelegramBotError(
			context.bot.id,
			error instanceof Error ? error.message : 'پردازش پیام تلگرام ناموفق بود.'
		);
		await sendTelegramMessage(
			context.token,
			message.chat.id,
			error instanceof Error ? error.message : 'پردازش پیام انجام نشد.',
			settings.telegramBotSocksProxyUrl
		).catch(() => undefined);
	}

	return json({ ok: true });
};
