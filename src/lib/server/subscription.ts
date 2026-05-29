import { getVpnClient } from '$lib/server/xui';
import { error, type RequestEvent } from '@sveltejs/kit';

const subscriptionUserAgentHints = [
	'v2ray',
	'v2rayng',
	'v2rayn',
	'v2tun',
	'clash',
	'clashmeta',
	'clash-meta',
	'clash verge',
	'clashverge',
	'clashx',
	'clashforandroid',
	'cfa',
	'mihomo',
	'sing-box',
	'singbox',
	'sfa',
	'sfi',
	'sfm',
	'hiddify',
	'nekobox',
	'neko box',
	'nekoray',
	'neko',
	'throne',
	'streisand',
	'fair',
	'foxray',
	'karing',
	'shadowrocket',
	'stash',
	'quantumult',
	'surge',
	'loon',
	'pharos',
	'potatso',
	'oneclick',
	'passwall',
	'sagernet',
	'matsuri',
	'napsternetv',
	'nekogram',
	'v2box',
	'v2rayu',
	'qv2ray',
	'xray',
	'xcaddy',
	'go-http-client',
	'okhttp',
	'dart',
	'cfnetwork'
];

export function encodeSubscriptionBase64(value: string) {
	return Buffer.from(value, 'utf8').toString('base64');
}

function unixSeconds(value: string | null) {
	return value ? Math.floor(new Date(value).getTime() / 1000) : 0;
}

export function shouldServeUserSubscription(event: Pick<RequestEvent, 'request' | 'url' | 'isDataRequest'>) {
	if (event.request.method !== 'GET') {
		return false;
	}

	if (event.isDataRequest) {
		return false;
	}

	if (
		event.url.pathname.endsWith('/__data.json') ||
		event.url.pathname.endsWith('.html__data.json') ||
		event.url.searchParams.has('x-sveltekit-invalidated') ||
		event.url.searchParams.has('x-sveltekit-trailing-slash') ||
		event.request.headers.has('x-sveltekit-action') ||
		event.request.headers.has('x-sveltekit-pathname') ||
		event.request.headers.has('x-sveltekit-search') ||
		event.request.headers.has('x-sveltekit-error') ||
		event.request.headers.has('x-sveltekit-normalize')
	) {
		return false;
	}

	if (event.url.searchParams.get('html') === '1' || event.url.searchParams.get('view') === 'html') {
		return false;
	}

	const requestedFormat = event.url.searchParams.get('format')?.toLowerCase() ?? '';
	const requestedSub = event.url.searchParams.get('sub')?.toLowerCase() ?? '';
	const requestedType = event.url.searchParams.get('type')?.toLowerCase() ?? '';

	if (
		event.url.searchParams.get('sub') === '1' ||
		requestedSub === 'base64' ||
		requestedSub === 'v2ray' ||
		requestedFormat === 'sub' ||
		requestedFormat === 'subscription' ||
		requestedFormat === 'base64' ||
		requestedType === 'subscription' ||
		event.url.searchParams.get('subscription') === '1' ||
		event.url.searchParams.get('download') === '1'
	) {
		return true;
	}

	const accept = event.request.headers.get('accept')?.toLowerCase() ?? '';

	if (accept.includes('text/html') || accept.includes('application/json')) {
		return false;
	}

	const userAgent = event.request.headers.get('user-agent')?.toLowerCase() ?? '';

	if (subscriptionUserAgentHints.some((hint) => userAgent.includes(hint))) {
		return true;
	}

	return true;
}

export async function buildUserSubscriptionResponse(uuid: string, host: string, profileUrl?: string) {
	const client = await getVpnClient(uuid, host, {
		includeOnlineStatus: false
	});

	if (!client?.configUrl) {
		throw error(404, 'subscription not found');
	}

	return new Response(`${encodeSubscriptionBase64(`${client.configUrl}\n`)}\n`, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'no-store',
			'profile-title': `base64:${encodeSubscriptionBase64(`Skyline-${client.email}`)}`,
			'profile-update-interval': '24',
			'profile-web-page-url': profileUrl ?? '',
			'subscription-userinfo': [
				`upload=${client.upBytes}`,
				`download=${client.downBytes}`,
				`total=${client.totalBytes ?? 0}`,
				`expire=${unixSeconds(client.expiresAt)}`
			].join('; ')
		}
	});
}
