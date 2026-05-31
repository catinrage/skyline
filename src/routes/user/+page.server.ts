import { checkIpActionRateLimit } from '$lib/server/rate-limit';
import { getSafeClientAddress } from '$lib/server/request';
import { getVpnClient } from '$lib/server/xui';
import { fail, redirect, type Actions } from '@sveltejs/kit';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractUuid(value: string) {
	const trimmed = value.trim();

	if (uuidPattern.test(trimmed)) {
		return trimmed.toLowerCase();
	}

	try {
		const url = new URL(trimmed);
		const username = decodeURIComponent(url.username);
		if (url.protocol === 'vless:' && uuidPattern.test(username)) {
			return username.toLowerCase();
		}
	} catch {
		// Fall through to regex extraction for pasted config fragments.
	}

	return trimmed.match(uuidPattern)?.[0].toLowerCase() ?? null;
}

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const input = String(formData.get('lookup') ?? '');
		const ip = getSafeClientAddress(event);
		const rateLimit = checkIpActionRateLimit('user-lookup', ip, {
			maxRequests: 10,
			windowMs: 60_000
		});

		if (!rateLimit.allowed) {
			return fail(429, {
				input,
				error: `درخواست‌های شما زیاد است. ${rateLimit.retryAfter} ثانیه دیگر دوباره تلاش کنید.`
			});
		}

		const uuid = extractUuid(input);

		if (!uuid) {
			return fail(400, {
				input,
				error: 'UUID یا کانفیگ VLESS معتبر وارد کنید.'
			});
		}

		let client: Awaited<ReturnType<typeof getVpnClient>>;

		try {
			client = await getVpnClient(uuid, event.url.hostname);
		} catch {
			return fail(502, {
				input,
				error: 'بررسی کاربر در x-ui انجام نشد. کمی بعد دوباره تلاش کنید.'
			});
		}

		if (!client) {
			return fail(404, {
				input,
				error: 'کاربری با این UUID در x-ui پیدا نشد.'
			});
		}

		throw redirect(303, `/user/${uuid}`);
	}
};
