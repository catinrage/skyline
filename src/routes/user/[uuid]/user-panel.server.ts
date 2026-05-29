import { logger } from '$lib/server/logger';
import { getClientAppLinks, getUserPanelMessage, isFeatureEnabled } from '$lib/server/admin';
import { getClientTicketsByClientUuid, getResellerMessageByUsername, getResellerOwnerByClientUuid } from '$lib/server/resellers';
import { getSafeClientAddress } from '$lib/server/request';
import { checkUserPanelRateLimit } from '$lib/server/rate-limit';
import { getVpnClient } from '$lib/server/xui';
import { error, type RequestEvent } from '@sveltejs/kit';

const userPanelLogger = logger.child('user-panel');

export interface UserPanelData {
	client: Awaited<ReturnType<typeof getVpnClient>> extends infer T ? NonNullable<T> : never;
	shareUrl: string;
	adminMessage: string;
	resellerMessage: string;
	resellerUsername: string;
	clientTickets: Array<{
		id: number;
		subject: string;
		status: 'open' | 'closed';
		createdAt: number;
		messages: Array<{
			id: number;
			senderType: string;
			message: string;
			createdAt: number;
			attachments: Array<{ id: number; fileName: string; dataUrl: string }>;
		}>;
	}>;
	clientAppLinks: Array<{
		name: string;
		downloadUrl: string;
		os: 'android' | 'ios' | 'windows' | 'linux';
	}>;
	features: {
		clientAppsLinks: boolean;
		configIssueReport: boolean;
		onlineStatus: boolean;
		proxyPing: boolean;
		speedTestWidget: boolean;
		clientTickets: boolean;
	};
}

export async function loadUserPanel(
	event: Pick<RequestEvent, 'params' | 'getClientAddress' | 'request' | 'setHeaders' | 'url'>
): Promise<UserPanelData> {
	const { params, setHeaders, url } = event;
	const rateLimit = checkUserPanelRateLimit(getSafeClientAddress(event));

	if (!rateLimit.allowed) {
		setHeaders({
			'Retry-After': String(rateLimit.retryAfter)
		});

		throw error(
			429,
			`شما برای ۱ دقیقه محدود شده‌اید. لطفاً ${rateLimit.retryAfter} ثانیه دیگر دوباره تلاش کنید.`
		);
	}

	const onlineStatusEnabled = await isFeatureEnabled('online_status');
	const client = await getVpnClient(params.uuid!, url.hostname, {
		includeOnlineStatus: onlineStatusEnabled
	});

	if (!client) {
		userPanelLogger.warn('User panel lookup returned no client.', {
			uuid: params.uuid
		});
		throw error(404, 'کاربر موردنظر پیدا نشد.');
	}

	// Feature 5: DB-based owner attribution — look up via DB first, fall back to legacy ?ri= param
	const dbOwner = await getResellerOwnerByClientUuid(params.uuid!);
	const legacyRi = url.searchParams.get('ri')?.trim() ?? '';
	const resellerUsername = dbOwner?.resellerUsername || legacyRi;
	const resellerMessage = resellerUsername
		? await getResellerMessageByUsername(resellerUsername)
		: null;
	const clientTicketsEnabled = (await isFeatureEnabled('client_tickets')) && Boolean(dbOwner?.clientTicketsEnabled);

	return {
		client,
		shareUrl: url.toString(),
		adminMessage: await getUserPanelMessage(),
		resellerMessage: resellerMessage ?? '',
		resellerUsername,
		clientTickets: clientTicketsEnabled ? await getClientTicketsByClientUuid(params.uuid!) : [],
		clientAppLinks: await getClientAppLinks(),
		features: {
			clientAppsLinks: await isFeatureEnabled('client_apps_links'),
			configIssueReport: await isFeatureEnabled('config_issue_report'),
			onlineStatus: onlineStatusEnabled,
			proxyPing: await isFeatureEnabled('proxy_ping'),
			speedTestWidget: await isFeatureEnabled('speed_test_widget')
			,
			clientTickets: clientTicketsEnabled
		}
	};
}
