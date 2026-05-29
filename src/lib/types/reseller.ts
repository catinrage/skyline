import type { ClientStatus, VpnClientUsage } from './vpn';

export interface ResellerPlan {
	id: number;
	quotaGb: number;
	durationDays: number;
	priceToman: number;
	inboundId: number;
	inboundRemarkSnapshot: string | null;
	isActive: boolean;
	isPublic: boolean;
	createdAt: number;
	updatedAt: number;
}

export interface ResellerCustomPricing {
	enabled: boolean;
	pricePerGbToman: number;
	durationDays: number;
	inboundId: number | null;
	inboundRemarkSnapshot: string | null;
	updatedAt: number | null;
}

export interface ResellerCreditPackage {
	id: number;
	quotaGb: number;
	priceToman: number;
	isActive: boolean;
	isPublic: boolean;
	accessKind: 'public' | 'group' | 'direct' | 'private';
	eligibleGroupId: number | null;
	eligibleGroupName: string | null;
	groupAccessIds: number[];
	resellerAccessIds: number[];
	createdAt: number;
	updatedAt: number;
}

export interface ResellerConfigTemplate {
	id: number;
	resellerId: number;
	name: string;
	quotaGb: number;
	durationDays: number;
	priceToman: number;
	createdAt: number;
	updatedAt: number;
}

export type ResellerCreditRequestStatus = 'pending' | 'approved' | 'rejected';

export interface ResellerCreditRequest {
	id: number;
	resellerId: number;
	resellerUsername: string;
	packageId: number;
	quotaGbSnapshot: number;
	priceTomanSnapshot: number;
	receiptText: string;
	receiptFileName: string | null;
	receiptMimeType: string | null;
	receiptDataBase64: string | null;
	receiptSizeBytes: number | null;
	status: ResellerCreditRequestStatus;
	managerNote: string;
	createdAt: number;
	reviewedAt: number | null;
}

export type ResellerGbLedgerType = 'purchase' | 'create' | 'recharge' | 'refund' | 'transfer';

export interface ResellerGbLedgerEntry {
	id: number;
	resellerId: number;
	requestId: number | null;
	creditRequestId: number | null;
	type: ResellerGbLedgerType;
	amountGb: number;
	createdAt: number;
}

export interface ResellerPayment {
	id: number;
	resellerId: number;
	amountToman: number;
	createdAt: number;
}

export type ResellerChargeType = 'create' | 'recharge';

export interface ResellerCharge {
	id: number;
	resellerId: number;
	requestId: number;
	type: ResellerChargeType;
	amountToman: number;
	settledAmountToman: number;
	reversedAmountToman: number;
	reversedAt: number | null;
	createdAt: number;
}

export interface ResellerTicket {
	id: number;
	resellerId: number;
	resellerUsername: string;
	subject: string;
	message: string;
	status: 'open' | 'closed';
	createdAt: number;
	closedAt: number | null;
	messages: ResellerTicketMessage[];
}

export type ResellerTicketSender = 'reseller' | 'manager' | 'user';

export interface ResellerTicketAttachment {
	id: number;
	messageId: number;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	dataUrl: string;
	createdAt: number;
}

export interface ResellerTicketMessage {
	id: number;
	ticketId: number;
	senderType: ResellerTicketSender;
	message: string;
	createdAt: number;
	attachments: ResellerTicketAttachment[];
}

export interface NewTicketAttachmentInput {
	fileName: string;
	mimeType: string;
	dataBase64: string;
	sizeBytes: number;
}

export interface ResellerRequestSnapshot {
	id: number;
	resellerId: number;
	planId: number;
	templateId: number | null;
	customerLabel: string;
	internalNote: string;
	xuiEmail: string;
	xuiClientUuid: string;
	xuiInboundId: number;
	quotaGbSnapshot: number;
	durationDaysSnapshot: number;
	priceTomanSnapshot: number;
	createdAt: number;
	revokedAt: number | null;
	settledAmountToman: number;
	settledPaymentId: number | null;
}

export type ResellerRequestLiveState = ClientStatus | 'revoked' | 'missing';

export interface ResellerRequestView extends ResellerRequestSnapshot {
	status: ResellerRequestLiveState;
	userPageUrl: string;
	configUrl: string | null;
	configQrCodeDataUrl: string | null;
	chargeAmountToman: number;
	outstandingAmountToman: number;
	rechargeCount: number;
	lastRechargeAt: number | null;
	rechargePlan: Pick<ResellerPlan, 'quotaGb' | 'durationDays' | 'priceToman'> | null;
	canRecharge: boolean;
	rechargeBlockedReason: string | null;
	usage: Pick<
		VpnClientUsage,
		| 'usedBytes'
		| 'remainingBytes'
		| 'totalBytes'
		| 'usageRatio'
		| 'expiresAt'
		| 'activationExpiryDays'
		| 'isOnline'
	> | null;
}

export interface ResellerStats {
	gbBalance: number;
	totalGbAdded: number;
	totalGbSold: number;
	totalGbRefunded: number;
	walletBalanceToman: number;
	totalSpentToman: number;
	currentDebtToman: number;
	debtCapToman: number | null;
	remainingCapToman: number | null;
	totalPaidToman: number;
	grossSalesToman: number;
	revokedValueToman: number;
	unpaidRequests: number;
	totalRequests: number;
	activeRequests: number;
	revokedRequests: number;
	settledRequests: number;
	lastPaymentAt: number | null;
}

export interface ResellerDailySummary {
	createdToday: number;
	rechargedToday: number;
	revokedToday: number;
	debtAddedTodayToman: number;
	gbSoldToday: number;
}

export interface ResellerAccountSummary {
	id: number;
	username: string;
	email: string;
	mustChangePassword: boolean;
	allowedInboundIds: number[] | null;
	isActive: boolean;
	customMessage: string;
	debtCapToman: number | null;
	parentResellerId: number | null;
	canManageSubResellers: boolean;
	subResellerLimit: number;
	groupId: number | null;
	groupName: string | null;
	groupColor: string | null;
	groupBadgeIcon: string | null;
	clientTicketsEnabled: boolean;
	isSystemManager: boolean;
	createdAt: number;
	updatedAt: number;
	stats: ResellerStats;
	payments: ResellerPayment[];
	charges: ResellerCharge[];
	gbLedger: ResellerGbLedgerEntry[];
	creditRequests: ResellerCreditRequest[];
	sessions: Array<{
		id: number;
		createdAt: number;
		lastUsedAt: number;
		expiresAt: number;
		userAgent: string;
	}>;
	canDelete: boolean;
	deleteBlockedReason: string | null;
}

export interface ResellerFinancialReport {
	totalOutstandingToman: number;
	totalPaidToman: number;
	totalGrossSalesToman: number;
	totalRevokedValueToman: number;
	totalActiveRequests: number;
	totalRevokedRequests: number;
	blockedResellers: number;
	cappedResellers: number;
	totalRemainingCapToman: number | null;
	totalGbBalance: number;
	totalGbSold: number;
	pendingCreditRequests: number;
}

// ── Group types ────────────────────────────────────────────────────────────────

export interface ResellerGroup {
	id: number;
	name: string;
	color: string;
	badgeIcon: string;
	description: string;
	createdAt: number;
	updatedAt: number;
}

// ── Sub-reseller ticket types ─────────────────────────────────────────────────

export type SubResellerTicketSender = 'sub_reseller' | 'parent_reseller';

export interface SubResellerTicketAttachment {
	id: number;
	messageId: number;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	dataUrl: string;
	createdAt: number;
}

export interface SubResellerTicketMessage {
	id: number;
	ticketId: number;
	senderType: SubResellerTicketSender;
	message: string;
	createdAt: number;
	attachments: SubResellerTicketAttachment[];
}

export interface SubResellerTicket {
	id: number;
	subResellerId: number;
	subResellerUsername: string;
	parentResellerId: number;
	parentResellerUsername: string;
	subject: string;
	message: string;
	status: 'open' | 'closed';
	createdAt: number;
	closedAt: number | null;
	messages: SubResellerTicketMessage[];
}

// ── Client ticket types ───────────────────────────────────────────────────────

export type ClientTicketSender = 'client' | 'seller';

export interface ClientTicketAttachment {
	id: number;
	messageId: number;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	dataUrl: string;
	createdAt: number;
}

export interface ClientTicketMessage {
	id: number;
	ticketId: number;
	senderType: ClientTicketSender;
	message: string;
	createdAt: number;
	attachments: ClientTicketAttachment[];
}

export interface ClientTicket {
	id: number;
	clientUuid: string;
	clientEmail: string;
	clientLabel: string;
	ownerResellerId: number | null;
	subject: string;
	status: 'open' | 'closed';
	createdAt: number;
	closedAt: number | null;
	messages: ClientTicketMessage[];
}

// ── Sub-reseller types ────────────────────────────────────────────────────────

export interface ResellerSubPackage {
	id: number;
	ownerResellerId: number;
	quotaGb: number;
	priceToman: number;
	isActive: boolean;
	createdAt: number;
	updatedAt: number;
}

export type SubResellerCreditRequestStatus = 'pending' | 'approved' | 'rejected';

export interface SubResellerCreditRequest {
	id: number;
	subResellerId: number;
	subResellerUsername: string;
	parentResellerId: number;
	packageId: number;
	quotaGbSnapshot: number;
	priceTomanSnapshot: number;
	receiptText: string;
	receiptFileName: string | null;
	receiptMimeType: string | null;
	receiptDataBase64: string | null;
	receiptSizeBytes: number | null;
	status: SubResellerCreditRequestStatus;
	parentNote: string;
	createdAt: number;
	reviewedAt: number | null;
}

export interface SubResellerSummary {
	id: number;
	username: string;
	email: string;
	isActive: boolean;
	gbBalance: number;
	totalConfigs: number;
	activeConfigs: number;
	createdAt: number;
}

// ── Dashboard state ───────────────────────────────────────────────────────────

export interface ResellerDashboardState {
	authenticated: boolean;
	isSubReseller: boolean;
	canManageSubResellers: boolean;
	parentResellerId: number | null;
	reseller: {
		id: number;
		username: string;
		email: string;
		mustChangePassword: boolean;
		allowedInboundIds: number[] | null;
		customMessage: string;
		managerMessage: string;
		debtCapToman: number | null;
		clientTicketsEnabled: boolean;
		subResellerLimit: number;
		group: ResellerGroup | null;
	};
	stats: ResellerStats;
	dailySummary: ResellerDailySummary;
	salesEnabled: boolean;
	availableInbounds: Array<{ id: number; remark: string | null; protocol: string | null; port: number | null }>;
	templates: ResellerConfigTemplate[];
	creditPackages: ResellerCreditPackage[];
	creditRequests: ResellerCreditRequest[];
	gbLedger: ResellerGbLedgerEntry[];
	payments: ResellerPayment[];
	charges: ResellerCharge[];
	tickets: ResellerTicket[];
	plans: ResellerPlan[];
	requests: ResellerRequestView[];
	lastCreatedRequest: ResellerRequestView | null;
	// Sub-reseller management (only populated for parent resellers)
	subResellers: SubResellerSummary[];
	subPackages: ResellerSubPackage[];
	subCreditRequests: SubResellerCreditRequest[];
	// Sub-reseller tickets (for sub-resellers: their own tickets; for parents: tickets from sub-resellers)
	subResellerTickets: SubResellerTicket[];
	// Client tickets (tickets from clients assigned to this reseller)
	clientTickets: ClientTicket[];
	sessions: Array<{
		id: number;
		createdAt: number;
		lastUsedAt: number;
		expiresAt: number;
		userAgent: string;
		isCurrent: boolean;
	}>;
}
