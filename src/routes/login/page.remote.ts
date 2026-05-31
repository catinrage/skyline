import { form, getRequestEvent } from '$app/server';
import { authenticateAdmin, createAdminSession } from '$lib/server/admin';
import { logger } from '$lib/server/logger';
import { checkAdminLoginRateLimit, checkResellerActionRateLimit } from '$lib/server/rate-limit';
import { getSafeClientAddress } from '$lib/server/request';
import { authenticateReseller, createResellerSession } from '$lib/server/resellers';
import { z } from 'zod';

const loginLogger = logger.child('unified-login');

export const login = form(
	z.object({
		username: z.string().trim().min(1, 'نام کاربری را وارد کنید.'),
		password: z.string().trim().min(1, 'گذرواژه را وارد کنید.')
	}),
	async ({ username, password }) => {
		const event = getRequestEvent();
		const { cookies } = event;
		const ip = getSafeClientAddress(event);
		const adminRateLimit = checkAdminLoginRateLimit(ip);

		if (adminRateLimit.allowed) {
			const adminAuthenticated = await authenticateAdmin(username, password);

			if (adminAuthenticated) {
				await createAdminSession(cookies, event.request.headers.get('user-agent') ?? '');
				loginLogger.warn('Unified login succeeded as admin.', { ip });
				return {
					loginSuccess: 'با موفقیت وارد شدید.',
					role: 'admin' as const
				};
			}
		}

		const resellerIpLimit = checkResellerActionRateLimit(`login:ip:${ip}`, {
			maxRequests: 20,
			windowMs: 60_000
		});

		if (!resellerIpLimit.allowed) {
			loginLogger.warn('Unified login reseller IP rate limited.', { ip });
			return {
				loginError: `تلاش‌های ورود زیاد است. ${resellerIpLimit.retryAfter} ثانیه دیگر دوباره تلاش کنید.`
			};
		}

		const resellerRateLimit = checkResellerActionRateLimit(`login:${username}:${ip}`, {
			maxRequests: 5,
			windowMs: 60_000
		});

		if (!resellerRateLimit.allowed) {
			return {
				loginError: `تلاش‌های ورود زیاد است. ${resellerRateLimit.retryAfter} ثانیه دیگر دوباره تلاش کنید.`
			};
		}

		const reseller = await authenticateReseller(username, password);

		if (reseller) {
			await createResellerSession(
				cookies,
				reseller.id,
				event.request.headers.get('user-agent') ?? ''
			);
			loginLogger.warn('Unified login succeeded as reseller.', { username, ip });
			return {
				loginSuccess: 'با موفقیت وارد شدید.',
				role: 'reseller' as const
			};
		}

		if (!adminRateLimit.allowed) {
			loginLogger.warn('Unified login admin rate limited and reseller auth failed.', { ip });
			return {
				loginError: `تلاش‌های ورود زیاد است. ${adminRateLimit.retryAfter} ثانیه دیگر دوباره تلاش کنید.`
			};
		}

		loginLogger.warn('Unified login failed.', { username, ip });
		return {
			loginError: 'نام کاربری یا گذرواژه نادرست است.'
		};
	}
);
