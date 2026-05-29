import { logger } from '$lib/server/logger';

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 35;
const ADMIN_LOGIN_MAX_REQUESTS = 5;
const requestsByIp = new Map<string, RateLimitEntry>();
const requestsByResellerAction = new Map<string, RateLimitEntry>();
const adminLoginAttemptsByIp = new Map<string, RateLimitEntry>();
const rateLimitLogger = logger.child('rate-limit');

export function checkUserPanelRateLimit(ip: string): { allowed: boolean; retryAfter: number } {
	const now = Date.now();
	const current = requestsByIp.get(ip);

	if (!current || current.resetAt <= now) {
		if (current && current.resetAt <= now) {
			requestsByIp.delete(ip);
		}

		requestsByIp.set(ip, {
			count: 1,
			resetAt: now + WINDOW_MS
		});

		return {
			allowed: true,
			retryAfter: 0
		};
	}

	if (current.count >= MAX_REQUESTS) {
		const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
		rateLimitLogger.warn('User panel rate limit exceeded.', {
			ip,
			retryAfter,
			windowMs: WINDOW_MS,
			maxRequests: MAX_REQUESTS
		});

		return {
			allowed: false,
			retryAfter
		};
	}

	current.count += 1;

	return {
		allowed: true,
		retryAfter: 0
	};
}

export function checkAdminLoginRateLimit(ip: string): { allowed: boolean; retryAfter: number } {
	const now = Date.now();
	const current = adminLoginAttemptsByIp.get(ip);

	if (!current || current.resetAt <= now) {
		if (current && current.resetAt <= now) {
			adminLoginAttemptsByIp.delete(ip);
		}

		adminLoginAttemptsByIp.set(ip, { count: 1, resetAt: now + WINDOW_MS });

		return { allowed: true, retryAfter: 0 };
	}

	if (current.count >= ADMIN_LOGIN_MAX_REQUESTS) {
		const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
		rateLimitLogger.warn('Admin login rate limit exceeded.', { ip, retryAfter });

		return { allowed: false, retryAfter };
	}

	current.count += 1;

	return { allowed: true, retryAfter: 0 };
}

export function checkResellerActionRateLimit(
	key: string,
	options?: {
		maxRequests?: number;
		windowMs?: number;
	}
): { allowed: boolean; retryAfter: number } {
	const now = Date.now();
	const windowMs = options?.windowMs ?? 60_000;
	const maxRequests = options?.maxRequests ?? 20;
	const current = requestsByResellerAction.get(key);

	if (!current || current.resetAt <= now) {
		if (current && current.resetAt <= now) {
			requestsByResellerAction.delete(key);
		}

		requestsByResellerAction.set(key, {
			count: 1,
			resetAt: now + windowMs
		});

		return {
			allowed: true,
			retryAfter: 0
		};
	}

	if (current.count >= maxRequests) {
		const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
		rateLimitLogger.warn('Reseller action rate limit exceeded.', {
			key,
			retryAfter,
			windowMs,
			maxRequests
		});

		return {
			allowed: false,
			retryAfter
		};
	}

	current.count += 1;

	return {
		allowed: true,
		retryAfter: 0
	};
}
