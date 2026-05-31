import { env } from '$env/dynamic/private';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '$lib/server/logger';

const execFileAsync = promisify(execFile);
const telegramLogger = logger.child('telegram-bot');

type TelegramApiResponse<T> = {
	ok: boolean;
	result?: T;
	description?: string;
};

export type TelegramBotIdentity = {
	id: number;
	username: string;
	displayName: string;
};

function getTokenSecret() {
	return env.TELEGRAM_BOT_TOKEN_SECRET?.trim() ?? '';
}

export function hasTelegramTokenSecret() {
	return getTokenSecret().length >= 16;
}

function encryptionKey() {
	const secret = getTokenSecret();
	if (!secret || secret.length < 16) {
		throw new Error('TELEGRAM_BOT_TOKEN_SECRET برای ذخیره امن توکن بات تنظیم نشده است.');
	}
	return createHash('sha256').update(secret).digest();
}

export function encryptTelegramToken(token: string) {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
	const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptTelegramToken(value: string) {
	const [version, ivBase64, tagBase64, encryptedBase64] = value.split(':');
	if (version !== 'v1' || !ivBase64 || !tagBase64 || !encryptedBase64) {
		throw new Error('فرمت توکن ذخیره‌شده بات نامعتبر است.');
	}
	const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivBase64, 'base64'));
	decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
	return Buffer.concat([
		decipher.update(Buffer.from(encryptedBase64, 'base64')),
		decipher.final()
	]).toString('utf8');
}

function normalizeProxy(proxyUrl: string) {
	const trimmed = proxyUrl.trim();
	if (!trimmed) return '';
	if (/^socks5h?:\/\//i.test(trimmed)) return trimmed.replace(/^socks5:\/\//i, 'socks5h://');
	if (/^[\w.-]+:\d+$/i.test(trimmed)) return `socks5h://${trimmed}`;
	return trimmed;
}

export async function telegramApiRequest<T>(
	token: string,
	method: string,
	body: Record<string, unknown> = {},
	proxyUrl = ''
): Promise<T> {
	const url = `https://api.telegram.org/bot${token}/${method}`;
	const proxy = normalizeProxy(proxyUrl);
	let payload: TelegramApiResponse<T>;

	if (proxy) {
		const { stdout } = await execFileAsync(
			'curl',
			[
				'--silent',
				'--show-error',
				'--fail-with-body',
				'--max-time',
				'20',
				'--proxy',
				proxy,
				'--header',
				'Content-Type: application/json',
				'--data',
				JSON.stringify(body),
				url
			],
			{ maxBuffer: 1024 * 1024 }
		);
		payload = JSON.parse(stdout) as TelegramApiResponse<T>;
	} else {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		payload = (await response.json()) as TelegramApiResponse<T>;
	}

	if (!payload.ok || payload.result === undefined) {
		telegramLogger.warn('Telegram API request failed.', { method, description: payload.description });
		throw new Error(payload.description || 'درخواست تلگرام ناموفق بود.');
	}

	return payload.result;
}

export async function getTelegramBotIdentity(token: string, proxyUrl = '') {
	const result = await telegramApiRequest<{
		id: number;
		username?: string;
		first_name?: string;
		last_name?: string;
	}>(
		token,
		'getMe',
		{},
		proxyUrl
	);

	return {
		id: result.id,
		username: result.username ?? '',
		displayName: [result.first_name, result.last_name].filter(Boolean).join(' ').trim() || result.username || String(result.id)
	} satisfies TelegramBotIdentity;
}

export async function setTelegramWebhook(
	token: string,
	webhookUrl: string,
	secretToken: string,
	proxyUrl = ''
) {
	return telegramApiRequest<boolean>(
		token,
		'setWebhook',
		{
			url: webhookUrl,
			secret_token: secretToken,
			allowed_updates: ['message']
		},
		proxyUrl
	);
}

export async function deleteTelegramWebhook(token: string, proxyUrl = '') {
	return telegramApiRequest<boolean>(token, 'deleteWebhook', { drop_pending_updates: false }, proxyUrl);
}

export async function sendTelegramMessage(
	token: string,
	chatId: number,
	text: string,
	proxyUrl = ''
) {
	return telegramApiRequest<unknown>(
		token,
		'sendMessage',
		{ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true },
		proxyUrl
	);
}
