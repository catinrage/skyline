import { redirect } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { getSafeClientAddress } from '$lib/server/request';
import {
	buildUserSubscriptionResponse,
	shouldServeUserSubscription
} from '$lib/server/subscription';
import { checkUserPanelRateLimit } from '$lib/server/rate-limit';
import type { Handle } from '@sveltejs/kit';

const requestLogger = logger.child('http');

export const handle: Handle = async ({ event, resolve }) => {
	// Redirect legacy /*/manager/* URLs → /*/manage/* so old bookmarks keep working.
	const managerAlias = event.url.pathname.match(/^(\/[^/]+)\/manager(\/.*)?$/);
	if (managerAlias) {
		throw redirect(301, `${managerAlias[1]}/manage${managerAlias[2] ?? ''}`);
	}

	const startedAt = Date.now();
	const userRouteMatch = event.url.pathname.match(/^\/user\/([^/]+)\/?$/);
	let response: Response;

	if (userRouteMatch && shouldServeUserSubscription(event)) {
		const ip = getSafeClientAddress(event);
		const rateLimit = checkUserPanelRateLimit(ip);

		if (!rateLimit.allowed) {
			response = new Response('Too Many Requests', {
				status: 429,
				headers: { 'Retry-After': String(rateLimit.retryAfter) }
			});
		} else {
			const rawUuid = decodeURIComponent(userRouteMatch[1]);
			const uuidValid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUuid);

			if (!uuidValid) {
				response = new Response('Not Found', { status: 404 });
			} else {
				response = await buildUserSubscriptionResponse(
					rawUuid,
					event.url.hostname,
					new URL(event.url.pathname, event.url.origin).toString()
				);
			}
		}
	} else {
		response = await resolve(event);
	}
	const durationMs = Date.now() - startedAt;
	const metadata = {
		method: event.request.method,
		path: event.url.pathname,
		query: event.url.search || null,
		status: response.status,
		durationMs,
		ip: getSafeClientAddress(event)
	};

	if (response.status >= 500) {
		requestLogger.error('Request completed with a server error response.', metadata);
	} else if (response.status === 429) {
		requestLogger.warn('Request completed with rate limiting.', metadata);
	} else {
		requestLogger.debug('Request completed.', metadata);
	}

	return response;
};

// export const handleError: HandleServerError = ({ error, event, status, message }) => {
// 	requestLogger.error('Unhandled server error.', {
// 		method: event.request.method,
// 		path: event.url.pathname,
// 		query: event.url.search || null,
// 		status,
// 		message,
// 		ip: getSafeClientAddress(event),
// 		error: error instanceof Error ? error : { value: error }
// 	});
// };
