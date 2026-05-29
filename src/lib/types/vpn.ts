export type ClientStatus = 'active' | 'depleted' | 'disabled' | 'expired';

export interface VpnClientUsage {
	uuid: string;
	email: string;
	inboundRemark: string | null;
	upBytes: number;
	downBytes: number;
	usedBytes: number;
	totalBytes: number | null;
	remainingBytes: number | null;
	usageRatio: number | null;
	expiresAt: string | null;
	activationExpiryDays: number | null;
	enabled: boolean;
	status: ClientStatus;
	configUrl: string | null;
	configQrCodeDataUrl: string | null;
	isOnline: boolean | null;
}

export interface VpnDashboardSummary {
	totalClients: number;
	activeClients: number;
	activeLimitedClients: number;
	expiringSoonClients: number;
	depletedClients: number;
	totalUsedBytes: number;
	totalQuotaBytes: number | null;
	activeLimitedRemainingBytes: number | null;
}

export interface VpnInboundSummary {
	remark: string | null;
	totalClients: number;
	activeLimitedClients: number;
	activeLimitedRemainingBytes: number | null;
}

export interface VpnDashboardData {
	summary: VpnDashboardSummary;
	inbounds: VpnInboundSummary[];
	clients: VpnClientUsage[];
}
