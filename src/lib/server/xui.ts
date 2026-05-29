import {
	getRuntimeSettings,
	getVlessRewriteRules,
	type RuntimeSettings,
	type VlessRewriteRule
} from '$lib/server/admin';
import { logger } from '$lib/server/logger';
import type { VpnClientUsage, VpnDashboardData } from '$lib/types/vpn';
import {
	classifyPanelHost,
	getActivationExpiryDays,
	getStatus,
	normalizeExpiry,
	parseJson,
	summarizeClients,
	summarizeInbounds,
	type XuiInboundClient
} from '$lib/server/xui-transform';
import QRCode from 'qrcode';

interface XuiClientStat {
	id?: number;
	inboundId?: number;
	enable?: boolean;
	email?: string;
	up?: number;
	down?: number;
	expiryTime?: number;
	total?: number;
	reset?: number;
}

interface XuiInboundSettings {
	decryption?: string;
	clients?: XuiInboundClient[];
}

interface InboundStreamSettings {
	network?: string;
	security?: string;
	tcpSettings?: {
		header?: {
			type?: string;
		};
	};
	wsSettings?: {
		path?: string;
		host?: string;
		headers?: {
			Host?: string;
			host?: string;
		};
	};
	grpcSettings?: {
		serviceName?: string;
	};
	httpupgradeSettings?: {
		path?: string;
		host?: string;
		headers?: {
			Host?: string;
			host?: string;
		};
	};
	xhttpSettings?: {
		path?: string;
		host?: string;
		mode?: string;
		headers?: {
			Host?: string;
			host?: string;
			[key: string]: unknown;
		};
	};
	realitySettings?: {
		fingerprint?: string;
		publicKey?: string;
		serverName?: string;
		shortIds?: string[];
		spiderX?: string;
	};
	tlsSettings?: {
		serverName?: string;
		alpn?: string[];
	};
}

interface XuiInbound {
	id: number;
	remark: string | null;
	listen: string | null;
	port: number | null;
	protocol: string | null;
	enable?: boolean;
	settings: string | object | null;
	streamSettings: string | object | null;
	clientStats?: XuiClientStat[] | null;
}

interface XuiEnvelope<T> {
	success: boolean;
	msg: string;
	obj: T;
}

interface XuiRequestOptions {
	method?: 'GET' | 'POST';
	body?: BodyInit | null;
	headers?: Record<string, string>;
}

export interface XuiInboundOption {
	id: number;
	remark: string | null;
	protocol: string | null;
	port: number | null;
	enable: boolean;
}

export interface CreateVpnClientInput {
	inboundId: number;
	uuid: string;
	email: string;
	totalBytes: number;
	expiryTime: number;
	enable?: boolean;
	limitIp?: number;
	subId?: string;
	tgId?: string;
}

export interface UpdateVpnClientInput {
	inboundId: number;
	uuid: string;
	totalBytes: number;
	expiryTime: number;
	enable?: boolean;
}

const xuiLogger = logger.child('xui');

function getRequiredRuntimeValue(settings: RuntimeSettings, key: 'xuiPanelUrl' | 'xuiApiToken') {
	const value = settings[key]?.trim();

	if (!value) {
		throw new Error(`${key} must be set for x-ui API access.`);
	}

	return value;
}

async function getPanelUrl(settings?: RuntimeSettings) {
	const runtimeSettings = settings ?? (await getRuntimeSettings());
	const panelUrl = getRequiredRuntimeValue(runtimeSettings, 'xuiPanelUrl');
	return panelUrl.endsWith('/') ? panelUrl.slice(0, -1) : panelUrl;
}

async function getPanelApiUrl(path: string, settings?: RuntimeSettings) {
	const panelUrl = await getPanelUrl(settings);

	if (!panelUrl.endsWith('/panel')) {
		throw new Error(
			'x-ui panel URL must point to the panel path, for example http://host:port/base/panel'
		);
	}

	return `${panelUrl}/api/${path.replace(/^\//, '')}`;
}

function getApiHeaders(settings: RuntimeSettings, headers: Record<string, string> = {}) {
	return {
		...headers,
		Authorization: `Bearer ${getRequiredRuntimeValue(settings, 'xuiApiToken')}`
	};
}

export type XuiHealthResult = {
	envConfigured: boolean;
	panelUrlValid: boolean;
	tokenConfigured: boolean;
	reachable: boolean;
	tokenValid: boolean | null;
	apiOk: boolean;
	httpStatus: number | null;
	panelScheme: string | null;
	panelHostKind: 'loopback' | 'private' | 'public' | 'unknown';
	panelPortConfigured: boolean;
	errorName: string | null;
	errorCauseCode: string | null;
	message: string;
};

function getErrorCauseCode(error: unknown) {
	const cause = error instanceof Error ? error.cause : null;

	if (typeof cause === 'object' && cause !== null && 'code' in cause) {
		const code = (cause as { code?: unknown }).code;
		return typeof code === 'string' ? code : null;
	}

	return null;
}

export async function checkXuiHealth(
	timeoutMs = 5000,
	settingsOverride?: RuntimeSettings
): Promise<XuiHealthResult> {
	const result: XuiHealthResult = {
		envConfigured: false,
		panelUrlValid: false,
		tokenConfigured: false,
		reachable: false,
		tokenValid: null,
		apiOk: false,
		httpStatus: null,
		panelScheme: null,
		panelHostKind: 'unknown',
		panelPortConfigured: false,
		errorName: null,
		errorCauseCode: null,
		message: 'x-ui API has not been checked.'
	};

	let panelUrl: string;
	const settings = settingsOverride ?? (await getRuntimeSettings());

	try {
		panelUrl = await getPanelUrl(settings);
		const parsedPanelUrl = new URL(panelUrl);
		result.envConfigured = true;
		result.panelScheme = parsedPanelUrl.protocol.replace(/:$/, '');
		result.panelHostKind = classifyPanelHost(parsedPanelUrl.hostname);
		result.panelPortConfigured = parsedPanelUrl.port.length > 0;
		result.panelUrlValid = panelUrl.endsWith('/panel');
		getRequiredRuntimeValue(settings, 'xuiApiToken');
		result.tokenConfigured = true;
	} catch (error) {
		result.errorName = error instanceof Error ? error.name : null;
		result.message = error instanceof Error ? error.message : 'x-ui environment is not configured.';
		return result;
	}

	if (!result.panelUrlValid) {
		result.message = 'x-ui panel URL must end with /panel.';
		return result;
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(await getPanelApiUrl('inbounds/list', settings), {
			method: 'GET',
			headers: getApiHeaders(settings, {
				accept: 'application/json'
			}),
			signal: controller.signal
		});

		result.reachable = true;
		result.httpStatus = response.status;

		if (response.status === 401 || response.status === 403) {
			result.tokenValid = false;
			result.message = 'x-ui API rejected the configured token.';
			return result;
		}

		result.tokenValid = true;

		if (!response.ok) {
			result.message = `x-ui API responded with HTTP ${response.status}.`;
			return result;
		}

		const payload = (await response.json()) as Partial<XuiEnvelope<unknown>>;
		result.apiOk = payload.success === true;
		result.message = result.apiOk
			? 'x-ui API is reachable and token-authenticated.'
			: 'x-ui API responded, but the response envelope was not successful.';
		return result;
	} catch (error) {
		result.errorName = error instanceof Error ? error.name : null;
		result.errorCauseCode = getErrorCauseCode(error);
		result.message =
			error instanceof Error && error.name === 'AbortError'
				? 'x-ui API health check timed out.'
				: 'Skyline could not connect to the x-ui API.';
		return result;
	} finally {
		clearTimeout(timeout);
	}
}

function normalizeHost(
	listen: string | null,
	fallbackHost?: string,
	publicHost?: string
): string | null {
	const configuredHost = publicHost?.trim();

	if (configuredHost) {
		return configuredHost;
	}

	if (listen && !['0.0.0.0', '::', '127.0.0.1', 'localhost', ''].includes(listen)) {
		return listen;
	}

	return fallbackHost?.trim() || null;
}

function getHeaderHost(headers: { Host?: string; host?: string } | undefined) {
	return headers?.Host?.trim() || headers?.host?.trim() || null;
}

function buildVlessConfig(
	inbound: XuiInbound,
	streamSettings: InboundStreamSettings | null,
	inboundSettings: XuiInboundSettings | null,
	client: XuiInboundClient,
	fallbackHost?: string,
	publicHost?: string
): string | null {
	if (inbound.protocol !== 'vless' || !client.id || !inbound.port) {
		return null;
	}

	const host = normalizeHost(inbound.listen, fallbackHost, publicHost);

	if (!host) {
		return null;
	}

	const params = new URLSearchParams();
	const network = streamSettings?.network || 'tcp';
	const security = streamSettings?.security || 'none';

	params.set('encryption', 'none');
	params.set('type', network);
	params.set('security', security);

	if (client.flow) {
		params.set('flow', client.flow);
	}

	if (network === 'ws') {
		if (streamSettings?.wsSettings?.path) {
			params.set('path', streamSettings.wsSettings.path);
		}

		const wsHost = streamSettings?.wsSettings?.host?.trim() || getHeaderHost(streamSettings?.wsSettings?.headers);
		if (wsHost) {
			params.set('host', wsHost);
		}
	}

	if (network === 'grpc' && streamSettings?.grpcSettings?.serviceName) {
		params.set('serviceName', streamSettings.grpcSettings.serviceName);
	}

	if (network === 'httpupgrade') {
		if (streamSettings?.httpupgradeSettings?.path) {
			params.set('path', streamSettings.httpupgradeSettings.path);
		}

		const httpUpgradeHost =
			streamSettings?.httpupgradeSettings?.host?.trim() ||
			getHeaderHost(streamSettings?.httpupgradeSettings?.headers);
		if (httpUpgradeHost) {
			params.set('host', httpUpgradeHost);
		}
	}

	if (network === 'xhttp') {
		if (streamSettings?.xhttpSettings?.path) {
			params.set('path', streamSettings.xhttpSettings.path);
		}

		const xhttpHost =
			streamSettings?.xhttpSettings?.host?.trim() ||
			getHeaderHost(streamSettings?.xhttpSettings?.headers);
		if (xhttpHost) {
			params.set('host', xhttpHost);
		}

		if (streamSettings?.xhttpSettings?.mode) {
			params.set('mode', streamSettings.xhttpSettings.mode);
		}
	}

	const tcpHeaderType = streamSettings?.tcpSettings?.header?.type;
	if (network === 'tcp' && tcpHeaderType && tcpHeaderType !== 'none') {
		params.set('headerType', tcpHeaderType);
	}

	if (security === 'tls') {
		if (streamSettings?.tlsSettings?.serverName) {
			params.set('sni', streamSettings.tlsSettings.serverName);
		}

		if (streamSettings?.tlsSettings?.alpn?.[0]) {
			params.set('alpn', streamSettings.tlsSettings.alpn[0]);
		}
	}

	if (security === 'reality') {
		if (streamSettings?.realitySettings?.serverName) {
			params.set('sni', streamSettings.realitySettings.serverName);
		}

		if (streamSettings?.realitySettings?.fingerprint) {
			params.set('fp', streamSettings.realitySettings.fingerprint);
		}

		if (streamSettings?.realitySettings?.publicKey) {
			params.set('pbk', streamSettings.realitySettings.publicKey);
		}

		if (streamSettings?.realitySettings?.shortIds?.[0]) {
			params.set('sid', streamSettings.realitySettings.shortIds[0]);
		}

		if (streamSettings?.realitySettings?.spiderX) {
			params.set('spx', streamSettings.realitySettings.spiderX);
		}
	}

	if (inboundSettings?.decryption && inboundSettings.decryption !== 'none') {
		params.set('decryption', inboundSettings.decryption);
	}

	const label = [inbound.remark, client.email].filter(Boolean).join('-') || client.id;
	return `vless://${client.id}@${host}:${inbound.port}?${params.toString()}#${encodeURIComponent(label)}`;
}

function selectVlessRewriteRule(inboundId: number, rules: VlessRewriteRule[]) {
	const enabledRules = rules.filter((rule) => rule.enabled);
	return (
		enabledRules.find((rule) => rule.targetInboundId === inboundId) ??
		enabledRules.find((rule) => rule.targetInboundId === null) ??
		null
	);
}

function rewriteVlessConfig(
	configUrl: string | null,
	inboundId: number,
	rules: VlessRewriteRule[]
): string | null {
	if (!configUrl) {
		return null;
	}

	const rule = selectVlessRewriteRule(inboundId, rules);
	if (!rule) {
		return configUrl;
	}

	try {
		const url = new URL(configUrl);
		if (url.protocol !== 'vless:') {
			return configUrl;
		}

		url.hostname = rule.address;
		url.port = String(rule.port);

		const params = url.searchParams;
		params.set('encryption', params.get('encryption') || 'none');

		if (rule.tlsEnabled) {
			params.set('security', 'tls');
			params.set('sni', rule.sni);
			params.set('fp', rule.fingerprint);
			params.delete('pbk');
			params.delete('sid');
			params.delete('spx');

			if (
				['ws', 'xhttp'].includes((params.get('type') ?? '').toLowerCase()) &&
				!params.get('host') &&
				rule.sni
			) {
				params.set('host', rule.sni);
			}
		} else {
			params.set('security', 'none');
			params.delete('sni');
			params.delete('fp');
			params.delete('alpn');
			params.delete('pbk');
			params.delete('sid');
			params.delete('spx');
		}

		url.search = params.toString();
		return url.toString();
	} catch (error) {
		xuiLogger.warn('Failed to rewrite VLESS config URL.', {
			inboundId,
			error: error instanceof Error ? error : undefined
		});
		return configUrl;
	}
}

async function xuiRequest<T>(path: string, options?: XuiRequestOptions): Promise<T> {
	const { method = 'GET', body = null, headers = {} } = options ?? {};
	const settings = await getRuntimeSettings();
	xuiLogger.debug('Calling x-ui API.', { path, method });
	const response = await fetch(await getPanelApiUrl(path, settings), {
		method,
		headers: getApiHeaders(settings, headers),
		body
	});

	if (!response.ok) {
		xuiLogger.error('x-ui API request failed.', {
			path,
			method,
			status: response.status
		});
		throw new Error(`x-ui API request failed for ${path} with HTTP ${response.status}.`);
	}

	const payload = (await response.json()) as XuiEnvelope<T>;

	if (!payload.success) {
		xuiLogger.error('x-ui API returned unsuccessful payload.', {
			path,
			message: payload.msg || null
		});
		throw new Error(payload.msg || `x-ui API request failed for ${path}.`);
	}

	return payload.obj;
}

async function xuiRequestRaw(path: string, options?: XuiRequestOptions) {
	const { method = 'GET', body = null, headers = {} } = options ?? {};
	const settings = await getRuntimeSettings();
	xuiLogger.debug('Calling raw x-ui API.', { path, method });
	const response = await fetch(await getPanelApiUrl(path, settings), {
		method,
		headers: getApiHeaders(settings, headers),
		body
	});

	if (!response.ok) {
		xuiLogger.error('x-ui raw API request failed.', {
			path,
			method,
			status: response.status
		});
		throw new Error(`x-ui API request failed for ${path} with HTTP ${response.status}.`);
	}

	return response.text();
}

async function getInbounds(): Promise<XuiInbound[]> {
	const inbounds = await xuiRequest<XuiInbound[]>('inbounds/list');
	xuiLogger.debug('Loaded x-ui inbounds.', { count: inbounds.length });
	return inbounds;
}

export async function getXuiInboundOptions(): Promise<XuiInboundOption[]> {
	const inbounds = await getInbounds();

	return inbounds
		.map((inbound) => ({
			id: inbound.id,
			remark: inbound.remark,
			protocol: inbound.protocol,
			port: inbound.port,
			enable: inbound.enable !== false
		}))
		.sort((left, right) => (left.remark ?? '').localeCompare(right.remark ?? ''));
}

function buildTrafficMap(inbound: XuiInbound) {
	const map = new Map<string, XuiClientStat>();

	for (const stat of inbound.clientStats ?? []) {
		if (stat.email) {
			map.set(stat.email, stat);
		}
	}

	return map;
}

async function getOnlineStatusMap() {
	try {
		const onlineEmails = await xuiRequest<string[]>('clients/onlines', { method: 'POST' });
		return new Map(
			onlineEmails
				.filter((email): email is string => typeof email === 'string' && email.trim().length > 0)
				.map((email) => [email, { isOnline: true }] as const)
		);
	} catch (error) {
		xuiLogger.warn('Failed to load current online emails from x-ui.', {
			error: error instanceof Error ? error : undefined
		});
		return new Map<string, { isOnline: boolean | null }>();
	}
}

function buildClientUsage(
	inbound: XuiInbound,
	client: XuiInboundClient,
	trafficMap: Map<string, XuiClientStat>,
	onlineStatusMap: Map<string, { isOnline: boolean | null }>
): VpnClientUsage | null {
	if (!client.id) {
		return null;
	}

	const email = client.email || 'Unnamed client';
	const traffic = trafficMap.get(email);
	const upBytes = Number(traffic?.up ?? 0);
	const downBytes = Number(traffic?.down ?? 0);
	const usedBytes = upBytes + downBytes;
	const totalBytes = client.totalGB && client.totalGB > 0 ? client.totalGB : null;
	const remainingBytes = totalBytes === null ? null : Math.max(totalBytes - usedBytes, 0);
	const usageRatio = totalBytes === null ? null : Math.min(usedBytes / totalBytes, 1);
	const expiresAt = normalizeExpiry(traffic?.expiryTime) ?? normalizeExpiry(client.expiryTime);
	const activationExpiryDays = expiresAt ? null : getActivationExpiryDays(client);
	const enabled = client.enable !== false && traffic?.enable !== false;
	const onlineStatus = onlineStatusMap.get(email) ?? {
		isOnline: false
	};

	return {
		uuid: client.id,
		email,
		inboundRemark: inbound.remark,
		upBytes,
		downBytes,
		usedBytes,
		totalBytes,
		remainingBytes,
		usageRatio,
		expiresAt,
		activationExpiryDays,
		enabled,
		status: getStatus(enabled, expiresAt, remainingBytes, totalBytes),
		configUrl: null,
		configQrCodeDataUrl: null,
		isOnline: onlineStatus.isOnline
	};
}

function getAllClientUsages(
	inbounds: XuiInbound[],
	onlineStatusMap: Map<string, { isOnline: boolean | null }>
) {
	const clients: Array<{
		inbound: XuiInbound;
		inboundSettings: XuiInboundSettings | null;
		streamSettings: InboundStreamSettings | null;
		client: XuiInboundClient;
		usage: VpnClientUsage;
	}> = [];

	for (const inbound of inbounds) {
		const trafficMap = buildTrafficMap(inbound);
		const inboundSettings = parseJson<XuiInboundSettings>(inbound.settings);
		const streamSettings = parseJson<InboundStreamSettings>(inbound.streamSettings);
		const inboundClients = Array.isArray(inboundSettings?.clients) ? inboundSettings.clients : [];

		for (const client of inboundClients) {
			const usage = buildClientUsage(inbound, client, trafficMap, onlineStatusMap);

			if (usage) {
				clients.push({
					inbound,
					inboundSettings,
					streamSettings,
					client,
					usage
				});
			}
		}
	}

	return clients;
}

function buildVpnClientRecord(
	entry: ReturnType<typeof getAllClientUsages>[number],
	fallbackHost: string | undefined,
	rewriteRules: VlessRewriteRule[],
	publicHost: string
): VpnClientUsage {
	const configUrl = rewriteVlessConfig(
		buildVlessConfig(
			entry.inbound,
			entry.streamSettings,
			entry.inboundSettings,
			entry.client,
			fallbackHost,
			publicHost
		),
		entry.inbound.id,
		rewriteRules
	);

	return {
		...entry.usage,
		configUrl,
		configQrCodeDataUrl: null
	};
}

export async function getVpnClientUsageMap(
	fallbackHost?: string,
	options?: {
		includeOnlineStatus?: boolean;
	}
) {
	const settings = await getRuntimeSettings();
	const inbounds = await getInbounds();
	const onlineStatusMap = options?.includeOnlineStatus ? await getOnlineStatusMap() : new Map();
	const rewriteRules = await getVlessRewriteRules();
	const usageMap = new Map<string, VpnClientUsage>();

	for (const entry of getAllClientUsages(inbounds, onlineStatusMap)) {
		usageMap.set(
			entry.client.id!,
			buildVpnClientRecord(entry, fallbackHost, rewriteRules, settings.xuiPublicHost)
		);
	}

	return usageMap;
}

function randomSubId(length = 16) {
	return crypto.randomUUID().replace(/-/g, '').slice(0, length);
}

export async function createVpnClient(input: CreateVpnClientInput) {
	const payload = {
		client: {
			id: input.uuid,
			email: input.email,
			flow: '',
			limitIp: input.limitIp ?? 0,
			totalGB: input.totalBytes,
			expiryTime: input.expiryTime,
			enable: input.enable ?? true,
			tgId: Number(input.tgId) || 0,
			subId: input.subId ?? randomSubId()
		},
		inboundIds: [input.inboundId]
	};

	const raw = await xuiRequestRaw('clients/add', {
		method: 'POST',
		headers: {
			'content-type': 'application/json'
		},
		body: JSON.stringify(payload)
	});

	// Some 3x-ui versions intermittently return an empty body on success.
	if (!raw.trim()) {
		xuiLogger.warn('x-ui addClient returned an empty response body.', {
			inboundId: input.inboundId,
			uuid: input.uuid,
			email: input.email
		});
		return;
	}

	const parsed = JSON.parse(raw) as XuiEnvelope<unknown>;

	if (!parsed.success) {
		xuiLogger.error('x-ui addClient returned unsuccessful payload.', {
			inboundId: input.inboundId,
			uuid: input.uuid,
			email: input.email,
			message: parsed.msg || null
		});
		throw new Error(parsed.msg || 'افزودن کاربر به 3x-ui انجام نشد.');
	}
}

async function findVpnClient(inboundId: number, uuid: string) {
	const inbounds = await getInbounds();
	const inbound = inbounds.find((item) => item.id === inboundId);

	if (!inbound) {
		return null;
	}

	const inboundSettings = parseJson<XuiInboundSettings>(inbound.settings);
	const clients = Array.isArray(inboundSettings?.clients) ? inboundSettings.clients : [];
	const client = clients.find((item) => item.id === uuid);

	if (!client?.id || !client.email) {
		return null;
	}

	return {
		inbound,
		client
	};
}

export async function updateVpnClient(input: UpdateVpnClientInput) {
	const current = await findVpnClient(input.inboundId, input.uuid);

	if (!current) {
		throw new Error('کانفیگ در 3x-ui پیدا نشد.');
	}

	const email = current.client.email;

	if (!email) {
		throw new Error('شناسه ایمیل کانفیگ در 3x-ui پیدا نشد.');
	}

	const payload = {
		...current.client,
		id: input.uuid,
		email,
		totalGB: input.totalBytes,
		expiryTime: input.expiryTime,
		enable: input.enable ?? current.client.enable ?? true,
		tgId: Number(current.client.tgId) || 0
	};

	const raw = await xuiRequestRaw(`clients/update/${encodeURIComponent(email)}`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json'
		},
		body: JSON.stringify(payload)
	});

	if (!raw.trim()) {
		xuiLogger.warn('x-ui updateClient returned an empty response body.', {
			inboundId: input.inboundId,
			uuid: input.uuid
		});
		return email;
	}

	const parsed = JSON.parse(raw) as XuiEnvelope<unknown>;

	if (!parsed.success) {
		xuiLogger.error('x-ui updateClient returned unsuccessful payload.', {
			inboundId: input.inboundId,
			uuid: input.uuid,
			message: parsed.msg || null
		});
		throw new Error(parsed.msg || 'به‌روزرسانی کانفیگ در 3x-ui انجام نشد.');
	}

	return email;
}

export async function setVpnClientEnabled(inboundId: number, uuid: string, enabled: boolean) {
	const current = await findVpnClient(inboundId, uuid);

	if (!current) {
		throw new Error('کانفیگ در 3x-ui پیدا نشد.');
	}

	if (!current.client.email) {
		throw new Error('شناسه ایمیل کانفیگ در 3x-ui پیدا نشد.');
	}

	await updateVpnClient({
		inboundId,
		uuid,
		totalBytes: current.client.totalGB ?? 0,
		expiryTime: current.client.expiryTime ?? 0,
		enable: enabled
	});
}

export async function resetVpnClientTraffic(email: string) {
	await xuiRequest<unknown>(`clients/resetTraffic/${encodeURIComponent(email)}`, {
		method: 'POST'
	});
}

export async function deleteVpnClient(email: string) {
	await xuiRequest<unknown>(`clients/del/${encodeURIComponent(email)}`, {
		method: 'POST'
	});
}

export async function getVpnDashboardData(): Promise<VpnDashboardData> {
	const inbounds = await getInbounds();
	const clients = getAllClientUsages(inbounds, new Map()).map((entry) => entry.usage);

	clients.sort((left, right) => {
		const statusOrder = ['active', 'disabled', 'depleted', 'expired'];
		const statusDelta = statusOrder.indexOf(left.status) - statusOrder.indexOf(right.status);

		if (statusDelta !== 0) {
			return statusDelta;
		}

		return left.email.localeCompare(right.email);
	});

	return {
		summary: summarizeClients(clients),
		inbounds: summarizeInbounds(clients),
		clients
	};
}

export async function getVpnClient(
	uuid: string,
	fallbackHost?: string,
	options?: {
		includeOnlineStatus?: boolean;
	}
): Promise<VpnClientUsage | null> {
	const usageMap = await getVpnClientUsageMap(fallbackHost, options);
	const client = usageMap.get(uuid);

	if (client) {
		return {
			...client,
			configQrCodeDataUrl: client.configUrl
				? await QRCode.toDataURL(client.configUrl, {
						margin: 1,
						width: 320
					})
				: null
		};
	}

	xuiLogger.warn('Requested VPN client was not found.', { uuid });

	return null;
}
