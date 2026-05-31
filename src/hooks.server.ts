import { redirect } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { getPanelPathSettings, getSharedPanelBasePath } from '$lib/server/admin';
import { getSafeClientAddress } from '$lib/server/request';
import {
	buildUserSubscriptionResponse,
	shouldServeUserSubscription
} from '$lib/server/subscription';
import { checkUserPanelRateLimit } from '$lib/server/rate-limit';
import type { Handle } from '@sveltejs/kit';

const requestLogger = logger.child('http');

function panelLoginRedirect(pathname: string, panel: 'manager' | 'reseller', sourceUrl: URL) {
	const target = new URL(pathname, sourceUrl);
	sourceUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));
	target.searchParams.set('panel', panel);
	return target.pathname + target.search;
}

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const hiddenManageAlias = path.match(/^(\/[^/]+)\/manage(\/.*)?$/);
	if (hiddenManageAlias) {
		throw redirect(
			301,
			`${hiddenManageAlias[1]}/manager${hiddenManageAlias[2] ?? ''}${event.url.search}`
		);
	}

	const legacyHiddenLogin = path.match(/^\/([^/]+)\/(manager|reseller)\/login\/?$/);
	if (legacyHiddenLogin) {
		const panel = legacyHiddenLogin[2] === 'manager' ? 'manager' : 'reseller';
		throw redirect(301, panelLoginRedirect(`/${legacyHiddenLogin[1]}/login`, panel, event.url));
	}

	if (path === '/manage/login' || path === '/reseller/login') {
		const settings = await getPanelPathSettings();
		const sharedBasePath = getSharedPanelBasePath(settings);
		const panel = path.startsWith('/manage') ? 'manager' : 'reseller';
		throw redirect(
			301,
			panelLoginRedirect(`${sharedBasePath ? `/${sharedBasePath}` : ''}/login`, panel, event.url)
		);
	}

	if (path === '/login') {
		const settings = await getPanelPathSettings();
		const sharedBasePath = getSharedPanelBasePath(settings);
		if (sharedBasePath) {
			throw redirect(302, `/${sharedBasePath}/login${event.url.search}`);
		}
	}

	const legacyDefaultPanel = path.match(/^\/(manage|reseller)(\/.*)?$/);
	if (legacyDefaultPanel) {
		const settings = await getPanelPathSettings();
		const sharedBasePath = getSharedPanelBasePath(settings);
		if (sharedBasePath) {
			const panel = legacyDefaultPanel[1] === 'manage' ? 'manager' : 'reseller';
			throw redirect(
				301,
				`/${sharedBasePath}/${panel}${legacyDefaultPanel[2] ?? ''}${event.url.search}`
			);
		}
	}

	const startedAt = Date.now();
	const userRouteMatch = path.match(/^\/user\/([^/]+)\/?$/);
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
