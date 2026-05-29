import type {
	ClientStatus,
	VpnClientUsage,
	VpnDashboardSummary,
	VpnInboundSummary
} from '$lib/types/vpn';

/**
 * Pure, dependency-free transforms shared by the x-ui client.
 *
 * Everything here is side-effect free (no network, DB, env, or SvelteKit
 * imports) so it can be unit tested in isolation. Keep it that way.
 */

export type PanelHostKind = 'loopback' | 'private' | 'public' | 'unknown';

export interface XuiInboundClient {
	id?: string;
	email?: string;
	flow?: string;
	limitIp?: number;
	totalGB?: number;
	expiryTime?: number;
	expiryDays?: number;
	totalDays?: number;
	expireDays?: number;
	day?: number;
	days?: number;
	enable?: boolean;
	tgId?: string | number;
	subId?: string;
}

export const daySeconds = 60 * 60 * 24;
export const dayMilliseconds = daySeconds * 1000;

export function classifyPanelHost(hostname: string): PanelHostKind {
	if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
		return 'loopback';
	}

	if (
		hostname.startsWith('10.') ||
		hostname.startsWith('192.168.') ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
	) {
		return 'private';
	}

	return hostname ? 'public' : 'unknown';
}

export function normalizeExpiry(expiryTime: number | undefined): string | null {
	if (!expiryTime || expiryTime <= 0) {
		return null;
	}

	// Some x-ui variants keep "expire N days after first use" as a duration before activation.
	// Only treat clearly timestamp-shaped values as absolute expiry instants.
	if (expiryTime < 1_000_000_000) {
		return null;
	}

	const normalized = expiryTime < 1_000_000_000_000 ? expiryTime * 1000 : expiryTime;
	return new Date(normalized).toISOString();
}

export function getActivationExpiryDays(client: XuiInboundClient): number | null {
	const directCandidates = [
		client.expiryDays,
		client.totalDays,
		client.expireDays,
		client.day,
		client.days
	];

	for (const candidate of directCandidates) {
		if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
			return Math.round(candidate);
		}
	}

	if (!client.expiryTime || client.expiryTime <= 0) {
		return null;
	}

	if (client.expiryTime < 1_000_000_000 && client.expiryTime % daySeconds === 0) {
		return client.expiryTime / daySeconds;
	}

	if (client.expiryTime < 1_000_000_000_000 && client.expiryTime % dayMilliseconds === 0) {
		return client.expiryTime / dayMilliseconds;
	}

	return null;
}

export function parseJson<T>(value: string | object | null | undefined): T | null {
	if (value == null) {
		return null;
	}

	if (typeof value === 'object') {
		return value as T;
	}

	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
}

export function getStatus(
	enabled: boolean,
	expiresAt: string | null,
	remainingBytes: number | null,
	totalBytes: number | null
): ClientStatus {
	if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
		return 'expired';
	}

	if (totalBytes === null) {
		return enabled ? 'active' : 'disabled';
	}

	if ((remainingBytes ?? 0) <= 0) {
		return 'depleted';
	}

	if (!enabled) {
		return 'disabled';
	}

	return 'active';
}

export function summarizeClients(clients: VpnClientUsage[]): VpnDashboardSummary {
	const expiringSoonThreshold = Date.now() + 1000 * 60 * 60 * 24 * 7;
	let totalQuotaBytes = 0;
	let activeLimitedRemainingBytes = 0;
	let hasLimitedPlans = false;
	let hasActiveLimitedPlans = false;

	for (const client of clients) {
		if (client.totalBytes !== null) {
			totalQuotaBytes += client.totalBytes;
			hasLimitedPlans = true;
		}

		if (client.status === 'active' && client.totalBytes !== null) {
			activeLimitedRemainingBytes += client.remainingBytes ?? 0;
			hasActiveLimitedPlans = true;
		}
	}

	return {
		totalClients: clients.length,
		activeClients: clients.filter((client) => client.status === 'active').length,
		activeLimitedClients: clients.filter((client) => client.status === 'active').length,
		expiringSoonClients: clients.filter((client) => {
			if (!client.expiresAt) {
				return false;
			}

			const expiresAt = new Date(client.expiresAt).getTime();
			return expiresAt >= Date.now() && expiresAt <= expiringSoonThreshold;
		}).length,
		depletedClients: clients.filter((client) => client.status === 'depleted').length,
		totalUsedBytes: clients.reduce((total, client) => total + client.usedBytes, 0),
		totalQuotaBytes: hasLimitedPlans ? totalQuotaBytes : null,
		activeLimitedRemainingBytes: hasActiveLimitedPlans ? activeLimitedRemainingBytes : null
	};
}

export function summarizeInbounds(clients: VpnClientUsage[]): VpnInboundSummary[] {
	const inboundMap = new Map<
		string,
		{
			remark: string | null;
			totalClients: number;
			activeLimitedClients: number;
			activeLimitedRemainingBytes: number;
			hasActiveLimitedPlans: boolean;
		}
	>();

	for (const client of clients) {
		const key = client.inboundRemark ?? '';
		const current = inboundMap.get(key) ?? {
			remark: client.inboundRemark,
			totalClients: 0,
			activeLimitedClients: 0,
			activeLimitedRemainingBytes: 0,
			hasActiveLimitedPlans: false
		};

		current.totalClients += 1;

		if (client.status === 'active' && client.totalBytes !== null) {
			current.activeLimitedClients += 1;
			current.activeLimitedRemainingBytes += client.remainingBytes ?? 0;
			current.hasActiveLimitedPlans = true;
		}

		inboundMap.set(key, current);
	}

	return Array.from(inboundMap.values())
		.map((inbound) => ({
			remark: inbound.remark,
			totalClients: inbound.totalClients,
			activeLimitedClients: inbound.activeLimitedClients,
			activeLimitedRemainingBytes: inbound.hasActiveLimitedPlans
				? inbound.activeLimitedRemainingBytes
				: null
		}))
		.sort((left, right) => (left.remark ?? '').localeCompare(right.remark ?? ''));
}
