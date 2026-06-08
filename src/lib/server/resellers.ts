import type { Cookies } from '@sveltejs/kit';
import type { Row } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { logger } from '$lib/server/logger';
import {
	getFeatureSettings,
	getPaymentCardSettings,
	getResellerPanelMessage,
	isFeatureEnabled
} from '$lib/server/admin';
import {
	executeMultiple,
	getDatabase,
	hashSecret,
	queryAll,
	queryFirst,
	run,
	verifySecret
} from '$lib/server/storage';
import type {
	ResellerAccountSummary,
	ResellerCharge,
	ResellerChargeType,
	ResellerConfigTemplate,
	ResellerCreditPackage,
	ResellerCreditRequest,
	ResellerCreditRequestStatus,
	ResellerCustomPricing,
	ResellerDailySummary,
	ResellerDashboardState,
	ResellerFinancialReport,
	ResellerGbLedgerEntry,
	ResellerGbLedgerType,
	NewTicketAttachmentInput,
	ResellerPayment,
	ResellerPlan,
	ResellerRequestSnapshot,
	ResellerRequestView,
	ResellerStats,
	ResellerSubPackage,
	SubResellerCreditRequest,
	SubResellerSummary,
	ResellerTicket,
	ResellerTicketAttachment,
	ResellerTicketMessage,
	ResellerTicketSender,
	ResellerGroup,
	SubResellerTicket,
	SubResellerTicketMessage,
	SubResellerTicketAttachment,
	SubResellerTicketSender,
	ClientTicket,
	ClientTicketMessage,
	ClientTicketAttachment,
	ClientTicketSender,
	ResellerTelegramBot,
	TelegramBotOrder,
	TelegramBotStatus,
	TelegramBotOrderStatus
} from '$lib/types/reseller';
import {
	decryptTelegramToken,
	deleteTelegramWebhook,
	encryptTelegramToken,
	getTelegramBotIdentity,
	getTelegramWebhookInfo,
	hasTelegramTokenSecret,
	sendTelegramMessage,
	setTelegramWebhook
} from '$lib/server/telegram-bot';
import {
	createVpnClient,
	deleteVpnClient,
	getVpnClientUsageMap,
	getXuiInboundOptions,
	resetVpnClientTraffic,
	setVpnClientEnabled,
	updateVpnClient
} from './xui';

const resellerSessionCookieName = 'skyline_reseller_session';
const resellerSessionLifetimeSeconds = 60 * 60 * 24 * 30;
const resellerLogger = logger.child('resellers');

let tablesInitPromise: Promise<void> | null = null;
const rechargeLocks = new Set<number>();
const ticketMaxAttachments = 3;
const ticketMaxAttachmentBytes = 5 * 1024 * 1024;

type ResellerAccountRow = Row & {
	id: number;
	username: string;
	username_normalized: string;
	password_hash: string;
	is_active: number;
	email: string | null;
	must_change_password: number;
	allowed_inbound_ids: string | null;
	custom_message: string | null;
	debt_cap_toman: number | null;
	parent_reseller_id: number | null;
	can_manage_sub_resellers: number;
	sub_reseller_limit: number;
	group_id: number | null;
	client_tickets_enabled: number;
	telegram_bot_allowed: number;
	payment_card_number: string | null;
	payment_card_owner_name: string | null;
	is_system_manager: number;
	created_at: number;
	updated_at: number;
};

type ResellerTelegramBotRow = Row & {
	id: number;
	reseller_id: number;
	bot_id: number;
	username: string;
	display_name: string;
	token_encrypted: string;
	webhook_secret: string;
	webhook_path_secret: string;
	status: TelegramBotStatus;
	webhook_url: string;
	last_error: string | null;
	last_update_at: number | null;
	created_at: number;
	updated_at: number;
};

type TelegramBotOrderRow = Row & {
	id: number;
	reseller_id: number;
	bot_id: number;
	telegram_user_id: number;
	telegram_username: string | null;
	customer_name: string;
	quota_gb: number;
	duration_days: number;
	price_toman: number;
	inbound_id: number;
	receipt_text: string | null;
	receipt_file_id: string | null;
	status: TelegramBotOrderStatus;
	reseller_note: string | null;
	customer_note: string | null;
	xui_request_id: number | null;
	xui_client_uuid: string | null;
	config_url: string | null;
	delivery_error: string | null;
	created_at: number;
	updated_at: number;
	reviewed_at: number | null;
	delivered_at: number | null;
};

type ResellerSubPackageRow = Row & {
	id: number;
	owner_reseller_id: number;
	quota_gb: number;
	price_toman: number;
	is_active: number;
	created_at: number;
	updated_at: number;
};

type SubResellerCreditRequestRow = Row & {
	id: number;
	sub_reseller_id: number;
	sub_reseller_username: string | null;
	parent_reseller_id: number;
	package_id: number;
	quota_gb_snapshot: number;
	price_toman_snapshot: number;
	receipt_text: string;
	receipt_file_name: string | null;
	receipt_mime_type: string | null;
	receipt_data_base64: string | null;
	receipt_size_bytes: number | null;
	status: 'pending' | 'approved' | 'rejected';
	parent_note: string;
	created_at: number;
	reviewed_at: number | null;
};

type ResellerGroupRow = Row & {
	id: number;
	name: string;
	color: string;
	badge_icon: string;
	description: string;
	created_at: number;
	updated_at: number;
};

type SubResellerTicketRow = Row & {
	id: number;
	sub_reseller_id: number;
	sub_reseller_username: string | null;
	parent_reseller_id: number;
	parent_reseller_username: string | null;
	subject: string;
	message: string;
	status: 'open' | 'closed';
	created_at: number;
	closed_at: number | null;
};

type SubResellerTicketMessageRow = Row & {
	id: number;
	ticket_id: number;
	sender_type: 'sub_reseller' | 'parent_reseller';
	message: string;
	created_at: number;
};

type SubResellerTicketAttachmentRow = Row & {
	id: number;
	message_id: number;
	file_name: string;
	mime_type: string;
	data_base64: string;
	size_bytes: number;
	created_at: number;
};

type ClientTicketRow = Row & {
	id: number;
	client_uuid: string;
	client_email: string | null;
	client_label: string | null;
	owner_reseller_id: number | null;
	subject: string;
	status: 'open' | 'closed';
	created_at: number;
	closed_at: number | null;
};

type ClientTicketMessageRow = Row & {
	id: number;
	ticket_id: number;
	sender_type: 'client' | 'seller';
	message: string;
	created_at: number;
};

type ClientTicketAttachmentRow = Row & {
	id: number;
	message_id: number;
	file_name: string;
	mime_type: string;
	data_base64: string;
	size_bytes: number;
	created_at: number;
};

type ResellerPlanRow = Row & {
	id: number;
	quota_gb: number;
	duration_days: number;
	price_toman: number;
	inbound_id: number;
	inbound_remark_snapshot: string | null;
	is_active: number;
	is_public: number;
	created_at: number;
	updated_at: number;
};

type ResellerCustomPricingRow = Row & {
	id: number;
	is_enabled: number;
	price_per_gb_toman: number;
	duration_days: number;
	inbound_id: number | null;
	inbound_remark_snapshot: string | null;
	updated_at: number;
};

type ResellerCreditPackageRow = Row & {
	id: number;
	quota_gb: number;
	price_toman: number;
	is_active: number;
	is_public: number;
	created_at: number;
	updated_at: number;
};

type ResellerCreditPackageAccessRow = Row & {
	package_id: number;
	reseller_id: number | null;
	group_id: number | null;
};

type ResellerConfigTemplateRow = Row & {
	id: number;
	reseller_id: number;
	name: string;
	quota_gb: number;
	duration_days: number;
	price_toman: number;
	created_at: number;
	updated_at: number;
};

type ResellerCreditRequestRow = Row & {
	id: number;
	reseller_id: number;
	reseller_username: string | null;
	package_id: number;
	quota_gb_snapshot: number;
	price_toman_snapshot: number;
	receipt_text: string;
	receipt_file_name: string | null;
	receipt_mime_type: string | null;
	receipt_data_base64: string | null;
	receipt_size_bytes: number | null;
	status: ResellerCreditRequestStatus;
	manager_note: string | null;
	created_at: number;
	reviewed_at: number | null;
};

type ResellerGbLedgerRow = Row & {
	id: number;
	reseller_id: number;
	request_id: number | null;
	credit_request_id: number | null;
	type: ResellerGbLedgerType;
	amount_gb: number;
	created_at: number;
};

type ResellerRequestRow = Row & {
	id: number;
	reseller_id: number;
	plan_id: number;
	template_id: number | null;
	customer_label: string;
	internal_note: string | null;
	xui_email: string;
	xui_client_uuid: string;
	xui_inbound_id: number;
	quota_gb_snapshot: number;
	duration_days_snapshot: number;
	price_toman_snapshot: number;
	created_at: number;
	revoked_at: number | null;
	settled_amount_toman: number;
	settled_payment_id: number | null;
};

type ResellerChargeRow = Row & {
	id: number;
	reseller_id: number;
	request_id: number;
	type: ResellerChargeType;
	amount_toman: number;
	settled_amount_toman: number;
	reversed_amount_toman: number;
	reversed_at: number | null;
	created_at: number;
};

type ResellerSessionRow = Row & {
	id: number;
	token_hash: string;
	reseller_id: number;
	expires_at: number;
	created_at: number;
	last_used_at: number;
	user_agent: string;
};

type ResellerPaymentRow = Row & {
	id: number;
	reseller_id: number;
	amount_toman: number;
	created_at: number;
};

type ResellerTicketRow = Row & {
	id: number;
	reseller_id: number;
	reseller_username: string | null;
	subject: string;
	message: string;
	status: 'open' | 'closed';
	created_at: number;
	closed_at: number | null;
};

type ResellerTicketMessageRow = Row & {
	id: number;
	ticket_id: number;
	sender_type: ResellerTicketSender;
	message: string;
	created_at: number;
};

type ResellerTicketAttachmentRow = Row & {
	id: number;
	message_id: number;
	file_name: string;
	mime_type: string;
	data_base64: string;
	size_bytes: number;
	created_at: number;
};

function nowSeconds() {
	return Math.floor(Date.now() / 1000);
}

function normalizeUsername(username: string) {
	return username.trim().toLowerCase();
}

function normalizeOptionalEmail(email: string) {
	const normalized = email.trim().toLowerCase();
	if (!normalized) {
		return '';
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) {
		throw new Error('ایمیل واردشده معتبر نیست.');
	}
	return normalized;
}

function normalizePaymentCardInput(input: { cardNumber?: string; cardOwnerName?: string }) {
	return {
		cardNumber: String(input.cardNumber ?? '')
			.trim()
			.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
			.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
			.slice(0, 32),
		cardOwnerName: String(input.cardOwnerName ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)
	};
}

function parseAllowedInboundIds(value: string | null | undefined) {
	if (!value?.trim()) {
		return null;
	}

	try {
		const parsed = JSON.parse(value);
		if (!Array.isArray(parsed)) return null;
		const ids = parsed
			.map((item) => Number(item))
			.filter((item) => Number.isInteger(item) && item > 0);
		return ids.length ? Array.from(new Set(ids)) : null;
	} catch {
		return null;
	}
}

function stringifyAllowedInboundIds(ids: number[] | null | undefined) {
	if (!ids?.length) {
		return '';
	}

	return JSON.stringify(Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0))));
}

function isInboundAllowedForAccount(
	account: Pick<ResellerAccountRow, 'allowed_inbound_ids'>,
	inboundId: number
) {
	const allowed = parseAllowedInboundIds(account.allowed_inbound_ids);
	return !allowed || allowed.includes(inboundId);
}

function isAllowedImagePayload(_mimeType: string, buffer: Buffer) {
	// Validate by magic bytes only — immune to MIME type mismatches (image/x-png, etc.)
	if (
		buffer.length >= 8 &&
		buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
	) {
		return true; // PNG
	}
	if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
		return true; // JPEG
	}
	if (
		buffer.length >= 12 &&
		buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
		buffer.subarray(8, 12).toString('ascii') === 'WEBP'
	) {
		return true; // WebP
	}
	const header = buffer.subarray(0, 6).toString('ascii');
	if (header === 'GIF87a' || header === 'GIF89a') {
		return true; // GIF
	}
	return false;
}

function sanitizeAttachmentFileName(fileName: string) {
	return (
		fileName
			.trim()
			.replace(/[^\p{L}\p{N}._ -]/gu, '')
			.replace(/\s+/g, '-')
			.slice(0, 96) || 'attachment'
	);
}

function validateTicketAttachments(attachments: NewTicketAttachmentInput[] = []) {
	if (attachments.length > ticketMaxAttachments) {
		throw new Error('حداکثر ۳ تصویر می‌توانید پیوست کنید.');
	}

	return attachments.map((attachment) => {
		const mimeType = attachment.mimeType.trim().toLowerCase();
		const base64 = attachment.dataBase64.replace(/^data:[^;]+;base64,/, '').trim();
		const buffer = Buffer.from(base64, 'base64');

		if (buffer.length === 0 || buffer.toString('base64') !== base64.replace(/\s/g, '')) {
			throw new Error('فایل پیوست معتبر نیست.');
		}

		if (
			buffer.length > ticketMaxAttachmentBytes ||
			attachment.sizeBytes > ticketMaxAttachmentBytes
		) {
			throw new Error('حجم هر تصویر باید حداکثر ۵ مگابایت باشد.');
		}

		if (!isAllowedImagePayload(mimeType, buffer)) {
			throw new Error('فقط فایل تصویر معتبر قابل ارسال است.');
		}

		return {
			fileName: sanitizeAttachmentFileName(attachment.fileName),
			mimeType,
			dataBase64: buffer.toString('base64'),
			sizeBytes: buffer.length
		};
	});
}

export function normalizeCustomerLabel(label: string) {
	return label
		.trim()
		.replace(/\s+/g, ' ')
		.replace(/[^\p{L}\p{N}\s_-]/gu, '')
		.slice(0, 64)
		.trim();
}

export function buildUniqueXuiEmail(label: string) {
	const normalized = normalizeCustomerLabel(label)
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^[-_]+|[-_]+$/g, '');
	const base = normalized || 'client';
	const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);

	return `${base}-${suffix}`.slice(0, 72);
}

function createSessionTokenHash(token: string) {
	return createHash('sha256').update(token).digest('hex');
}

function setResellerSessionCookie(cookies: Cookies, token: string) {
	cookies.set(resellerSessionCookieName, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		maxAge: resellerSessionLifetimeSeconds
	});
}

function mapPlanRow(row: ResellerPlanRow): ResellerPlan {
	return {
		id: row.id,
		quotaGb: row.quota_gb,
		durationDays: row.duration_days,
		priceToman: row.price_toman,
		inboundId: row.inbound_id,
		inboundRemarkSnapshot: row.inbound_remark_snapshot,
		isActive: row.is_active === 1,
		isPublic: (row.is_public ?? 1) === 1,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

function mapCustomPricingRow(row: ResellerCustomPricingRow | null): ResellerCustomPricing {
	return {
		enabled: row?.is_enabled === 1,
		pricePerGbToman: row?.price_per_gb_toman ?? 0,
		durationDays: row?.duration_days ?? 30,
		inboundId: row?.inbound_id ?? null,
		inboundRemarkSnapshot: row?.inbound_remark_snapshot ?? null,
		updatedAt: row?.updated_at ?? null
	};
}

function mapCreditPackageRow(
	row: ResellerCreditPackageRow,
	access: ResellerCreditPackageAccessRow[] = []
): ResellerCreditPackage {
	return {
		id: row.id,
		quotaGb: row.quota_gb,
		priceToman: row.price_toman,
		isActive: row.is_active === 1,
		isPublic: (row.is_public ?? 1) === 1,
		accessKind: (row.is_public ?? 1) === 1 ? 'public' : 'private',
		eligibleGroupId: null,
		eligibleGroupName: null,
		groupAccessIds: access
			.filter((entry) => entry.package_id === row.id && entry.group_id !== null)
			.map((entry) => entry.group_id!),
		resellerAccessIds: access
			.filter((entry) => entry.package_id === row.id && entry.reseller_id !== null)
			.map((entry) => entry.reseller_id!),
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

function mapConfigTemplateRow(row: ResellerConfigTemplateRow): ResellerConfigTemplate {
	return {
		id: row.id,
		resellerId: row.reseller_id,
		name: row.name,
		quotaGb: row.quota_gb,
		durationDays: row.duration_days,
		priceToman: row.price_toman,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

function mapTelegramBotRow(row: ResellerTelegramBotRow): ResellerTelegramBot {
	return {
		id: row.id,
		resellerId: row.reseller_id,
		botId: row.bot_id,
		username: row.username,
		displayName: row.display_name,
		status: row.status,
		webhookUrl: row.webhook_url,
		lastError: row.last_error ?? '',
		lastUpdateAt: row.last_update_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

function mapTelegramOrderRow(row: TelegramBotOrderRow): TelegramBotOrder {
	return {
		id: row.id,
		resellerId: row.reseller_id,
		botId: row.bot_id,
		telegramUserId: row.telegram_user_id,
		telegramUsername: row.telegram_username ?? '',
		customerName: row.customer_name,
		quotaGb: row.quota_gb,
		durationDays: row.duration_days,
		priceToman: row.price_toman,
		inboundId: row.inbound_id,
		receiptText: row.receipt_text ?? '',
		receiptFileId: row.receipt_file_id ?? '',
		status: row.status,
		resellerNote: row.reseller_note ?? '',
		customerNote: row.customer_note ?? '',
		xuiRequestId: row.xui_request_id,
		xuiClientUuid: row.xui_client_uuid,
		configUrl: row.config_url,
		deliveryError: row.delivery_error ?? '',
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		reviewedAt: row.reviewed_at,
		deliveredAt: row.delivered_at
	};
}

function mapCreditRequestRow(row: ResellerCreditRequestRow): ResellerCreditRequest {
	return {
		id: row.id,
		resellerId: row.reseller_id,
		resellerUsername: row.reseller_username ?? '',
		packageId: row.package_id,
		quotaGbSnapshot: row.quota_gb_snapshot,
		priceTomanSnapshot: row.price_toman_snapshot,
		receiptText: row.receipt_text,
		receiptFileName: row.receipt_file_name,
		receiptMimeType: row.receipt_mime_type,
		receiptDataBase64: row.receipt_data_base64,
		receiptSizeBytes: row.receipt_size_bytes,
		status: row.status,
		managerNote: row.manager_note ?? '',
		createdAt: row.created_at,
		reviewedAt: row.reviewed_at
	};
}

function mapGbLedgerRow(row: ResellerGbLedgerRow): ResellerGbLedgerEntry {
	return {
		id: row.id,
		resellerId: row.reseller_id,
		requestId: row.request_id,
		creditRequestId: row.credit_request_id,
		type: row.type,
		amountGb: row.amount_gb,
		createdAt: row.created_at
	};
}

function mapRequestRow(row: ResellerRequestRow): ResellerRequestSnapshot {
	return {
		id: row.id,
		resellerId: row.reseller_id,
		planId: row.plan_id,
		templateId: row.template_id ?? null,
		customerLabel: row.customer_label,
		internalNote: row.internal_note ?? '',
		xuiEmail: row.xui_email,
		xuiClientUuid: row.xui_client_uuid,
		xuiInboundId: row.xui_inbound_id,
		quotaGbSnapshot: row.quota_gb_snapshot,
		durationDaysSnapshot: row.duration_days_snapshot,
		priceTomanSnapshot: row.price_toman_snapshot,
		createdAt: row.created_at,
		revokedAt: row.revoked_at,
		settledAmountToman: row.settled_amount_toman,
		settledPaymentId: row.settled_payment_id
	};
}

function mapPaymentRow(row: ResellerPaymentRow): ResellerPayment {
	return {
		id: row.id,
		resellerId: row.reseller_id,
		amountToman: row.amount_toman,
		createdAt: row.created_at
	};
}

function mapChargeRow(row: ResellerChargeRow): ResellerCharge {
	return {
		id: row.id,
		resellerId: row.reseller_id,
		requestId: row.request_id,
		type: row.type,
		amountToman: row.amount_toman,
		settledAmountToman: row.settled_amount_toman,
		reversedAmountToman: row.reversed_amount_toman,
		reversedAt: row.reversed_at,
		createdAt: row.created_at
	};
}

function mapTicketRow(row: ResellerTicketRow): ResellerTicket {
	return {
		id: row.id,
		resellerId: row.reseller_id,
		resellerUsername: row.reseller_username ?? '',
		subject: row.subject,
		message: row.message,
		status: row.status,
		createdAt: row.created_at,
		closedAt: row.closed_at,
		messages: []
	};
}

function mapSubPackageRow(row: ResellerSubPackageRow): ResellerSubPackage {
	return {
		id: row.id,
		ownerResellerId: row.owner_reseller_id,
		quotaGb: row.quota_gb,
		priceToman: row.price_toman,
		isActive: row.is_active === 1,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

function mapSubCreditRequestRow(row: SubResellerCreditRequestRow): SubResellerCreditRequest {
	return {
		id: row.id,
		subResellerId: row.sub_reseller_id,
		subResellerUsername: row.sub_reseller_username ?? '',
		parentResellerId: row.parent_reseller_id,
		packageId: row.package_id,
		quotaGbSnapshot: row.quota_gb_snapshot,
		priceTomanSnapshot: row.price_toman_snapshot,
		receiptText: row.receipt_text,
		receiptFileName: row.receipt_file_name,
		receiptMimeType: row.receipt_mime_type,
		receiptDataBase64: row.receipt_data_base64,
		receiptSizeBytes: row.receipt_size_bytes,
		status: row.status,
		parentNote: row.parent_note,
		createdAt: row.created_at,
		reviewedAt: row.reviewed_at
	};
}

function mapTicketAttachmentRow(row: ResellerTicketAttachmentRow): ResellerTicketAttachment {
	return {
		id: row.id,
		messageId: row.message_id,
		fileName: row.file_name,
		mimeType: row.mime_type,
		sizeBytes: row.size_bytes,
		dataUrl: `data:${row.mime_type};base64,${row.data_base64}`,
		createdAt: row.created_at
	};
}

function mapTicketMessageRow(
	row: ResellerTicketMessageRow,
	attachmentsByMessageId: Map<number, ResellerTicketAttachment[]>
): ResellerTicketMessage {
	return {
		id: row.id,
		ticketId: row.ticket_id,
		senderType: row.sender_type,
		message: row.message,
		createdAt: row.created_at,
		attachments: attachmentsByMessageId.get(row.id) ?? []
	};
}

async function attachTicketMessages(tickets: ResellerTicket[]) {
	if (tickets.length === 0) {
		return tickets;
	}

	const ticketIds = tickets.map((ticket) => ticket.id);
	const placeholders = ticketIds.map(() => '?').join(', ');
	const messageRows = await queryAll<ResellerTicketMessageRow>(
		`
		SELECT id, ticket_id, sender_type, message, created_at
		FROM reseller_ticket_messages
		WHERE ticket_id IN (${placeholders})
		ORDER BY created_at ASC, id ASC
	`,
		ticketIds
	);
	const messageIds = messageRows.map((message) => message.id);
	const attachmentRows =
		messageIds.length === 0
			? []
			: await queryAll<ResellerTicketAttachmentRow>(
					`
					SELECT id, message_id, file_name, mime_type, data_base64, size_bytes, created_at
					FROM reseller_ticket_attachments
					WHERE message_id IN (${messageIds.map(() => '?').join(', ')})
					ORDER BY id ASC
				`,
					messageIds
				);
	const attachmentsByMessageId = new Map<number, ResellerTicketAttachment[]>();

	for (const attachment of attachmentRows.map(mapTicketAttachmentRow)) {
		const existing = attachmentsByMessageId.get(attachment.messageId) ?? [];
		existing.push(attachment);
		attachmentsByMessageId.set(attachment.messageId, existing);
	}

	const messagesByTicketId = new Map<number, ResellerTicketMessage[]>();

	for (const messageRow of messageRows) {
		const message = mapTicketMessageRow(messageRow, attachmentsByMessageId);
		const existing = messagesByTicketId.get(message.ticketId) ?? [];
		existing.push(message);
		messagesByTicketId.set(message.ticketId, existing);
	}

	return tickets.map((ticket) => ({
		...ticket,
		messages: messagesByTicketId.get(ticket.id) ?? []
	}));
}

function getChargeOutstandingAmount(
	charge: Pick<ResellerCharge, 'amountToman' | 'settledAmountToman' | 'reversedAmountToman'>
) {
	return Math.max(charge.amountToman - charge.settledAmountToman - charge.reversedAmountToman, 0);
}

function getChargeNetAmount(charge: Pick<ResellerCharge, 'amountToman' | 'reversedAmountToman'>) {
	return Math.max(charge.amountToman - charge.reversedAmountToman, 0);
}

function getChargesForRequest(charges: ResellerCharge[], requestId: number) {
	return charges.filter((charge) => charge.requestId === requestId);
}

function buildGbStats(ledger: ResellerGbLedgerEntry[]) {
	const totalGbAdded = ledger
		.filter((entry) => entry.amountGb > 0 && entry.type === 'purchase')
		.reduce((total, entry) => total + entry.amountGb, 0);
	const totalGbRefunded = ledger
		.filter((entry) => entry.type === 'refund')
		.reduce((total, entry) => total + entry.amountGb, 0);
	const totalGbSold = Math.abs(
		ledger
			.filter(
				(entry) => entry.amountGb < 0 && (entry.type === 'create' || entry.type === 'recharge')
			)
			.reduce((total, entry) => total + entry.amountGb, 0)
	);
	const gbBalance = ledger.reduce((total, entry) => total + entry.amountGb, 0);

	return {
		gbBalance,
		totalGbAdded,
		totalGbSold,
		totalGbRefunded
	};
}

function buildResellerStats(
	requests: ResellerRequestSnapshot[],
	payments: ResellerPayment[],
	debtCapToman: number | null,
	charges: ResellerCharge[],
	gbLedger: ResellerGbLedgerEntry[] = []
): ResellerStats {
	const gbStats = buildGbStats(gbLedger);
	const totalPaidToman = payments.reduce((total, payment) => total + payment.amountToman, 0);
	const grossSalesToman = charges.reduce((total, charge) => total + getChargeNetAmount(charge), 0);
	const walletBalanceToman = totalPaidToman - grossSalesToman;
	const currentDebtToman = Math.max(-walletBalanceToman, 0);
	const revokedValueToman = charges.reduce(
		(total, charge) => total + charge.reversedAmountToman,
		0
	);
	const requestIdsWithDebt = new Set(
		charges
			.filter((charge) => getChargeOutstandingAmount(charge) > 0)
			.map((charge) => charge.requestId)
	);

	return {
		...gbStats,
		walletBalanceToman,
		totalSpentToman: grossSalesToman,
		currentDebtToman,
		debtCapToman,
		remainingCapToman: walletBalanceToman,
		totalPaidToman,
		grossSalesToman,
		revokedValueToman,
		unpaidRequests: requestIdsWithDebt.size,
		totalRequests: requests.length,
		activeRequests: requests.filter((request) => request.revokedAt === null).length,
		revokedRequests: requests.filter((request) => request.revokedAt !== null).length,
		settledRequests: requests.filter((request) => {
			const requestCharges = getChargesForRequest(charges, request.id);
			return (
				requestCharges.length > 0 &&
				requestCharges.every((charge) => getChargeOutstandingAmount(charge) === 0)
			);
		}).length,
		lastPaymentAt: payments[0]?.createdAt ?? null
	};
}

function getStartOfTodaySeconds() {
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	return Math.floor(now.getTime() / 1000);
}

function buildDailySummary(
	requests: ResellerRequestSnapshot[],
	charges: ResellerCharge[],
	gbLedger: ResellerGbLedgerEntry[] = []
): ResellerDailySummary {
	const today = getStartOfTodaySeconds();

	return {
		createdToday: requests.filter((request) => request.createdAt >= today).length,
		rechargedToday: charges.filter(
			(charge) => charge.type === 'recharge' && charge.createdAt >= today
		).length,
		revokedToday: requests.filter(
			(request) => request.revokedAt !== null && request.revokedAt >= today
		).length,
		debtAddedTodayToman: charges
			.filter((charge) => charge.createdAt >= today)
			.reduce((total, charge) => total + getChargeNetAmount(charge), 0),
		gbSoldToday: Math.abs(
			gbLedger
				.filter(
					(entry) =>
						entry.createdAt >= today &&
						entry.amountGb < 0 &&
						(entry.type === 'create' || entry.type === 'recharge')
				)
				.reduce((total, entry) => total + entry.amountGb, 0)
		)
	};
}

function buildUserPageUrl(origin: string, uuid: string, _resellerUsername?: string | null) {
	// Owner attribution is now stored in DB (getResellerOwnerByClientUuid), no ?ri= needed
	return new URL(`/user/${uuid}`, origin).toString();
}

function buildRequestView(
	request: ResellerRequestSnapshot,
	origin: string,
	liveUsageMap: Awaited<ReturnType<typeof getVpnClientUsageMap>>,
	resellerUsername: string | null | undefined,
	charges: ResellerCharge[],
	plans: ResellerPlan[]
): ResellerRequestView {
	const liveUsage = liveUsageMap.get(request.xuiClientUuid) ?? null;
	const requestCharges = getChargesForRequest(charges, request.id);
	const settledAmountToman = requestCharges.reduce(
		(total, charge) => total + charge.settledAmountToman,
		0
	);
	const chargeAmountToman = requestCharges.reduce(
		(total, charge) => total + getChargeNetAmount(charge),
		0
	);
	const outstandingAmountToman = requestCharges.reduce(
		(total, charge) => total + getChargeOutstandingAmount(charge),
		0
	);
	const rechargeCharges = requestCharges.filter(
		(charge) => charge.type === 'recharge' && charge.reversedAmountToman < charge.amountToman
	);
	const currentPlan = plans.find((plan) => plan.id === request.planId) ?? null;
	const status = request.revokedAt ? 'revoked' : liveUsage ? liveUsage.status : 'missing';
	const canRecharge = status !== 'revoked' && status !== 'missing' && status !== 'disabled';
	const rechargeBlockedReason = (() => {
		if (status === 'revoked') {
			return 'کانفیگ لغو شده است.';
		}

		if (status === 'missing') {
			return 'کانفیگ در x-ui پیدا نشد.';
		}

		if (status === 'disabled') {
			return 'کانفیگ غیرفعال است.';
		}

		return null;
	})();

	return {
		...request,
		settledAmountToman,
		status,
		userPageUrl: buildUserPageUrl(origin, request.xuiClientUuid, resellerUsername),
		configUrl: liveUsage?.configUrl ?? null,
		configQrCodeDataUrl: liveUsage?.configQrCodeDataUrl ?? null,
		chargeAmountToman,
		outstandingAmountToman,
		rechargeCount: rechargeCharges.length,
		lastRechargeAt: rechargeCharges[0]?.createdAt ?? null,
		rechargePlan: currentPlan?.isActive
			? {
					quotaGb: currentPlan.quotaGb,
					durationDays: currentPlan.durationDays,
					priceToman: 0
				}
			: {
					quotaGb: request.quotaGbSnapshot,
					durationDays: request.durationDaysSnapshot,
					priceToman: 0
				},
		canRecharge,
		rechargeBlockedReason,
		usage: liveUsage
			? {
					usedBytes: liveUsage.usedBytes,
					remainingBytes: liveUsage.remainingBytes,
					totalBytes: liveUsage.totalBytes,
					usageRatio: liveUsage.usageRatio,
					expiresAt: liveUsage.expiresAt,
					activationExpiryDays: liveUsage.activationExpiryDays,
					isOnline: liveUsage.isOnline
				}
			: null
	};
}

function isUniqueConstraintError(error: unknown) {
	return error instanceof Error && /unique/i.test(error.message);
}

async function tableHasColumn(tableName: string, columnName: string) {
	const rows = await queryAll<Row & { name: string }>(`PRAGMA table_info(${tableName})`);
	return rows.some((row) => row.name === columnName);
}

async function ensureColumn(tableName: string, columnName: string, definition: string) {
	if (await tableHasColumn(tableName, columnName)) {
		return;
	}

	await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

async function ensureResellerTables() {
	if (!tablesInitPromise) {
		tablesInitPromise = runResellerMigrations();
	}
	return tablesInitPromise;
}

async function runResellerMigrations() {
	await executeMultiple(`
		CREATE TABLE IF NOT EXISTS reseller_accounts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL,
			username_normalized TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			is_active INTEGER NOT NULL DEFAULT 1,
			email TEXT NOT NULL DEFAULT '',
			must_change_password INTEGER NOT NULL DEFAULT 0,
			allowed_inbound_ids TEXT NOT NULL DEFAULT '',
			custom_message TEXT NOT NULL DEFAULT '',
			debt_cap_toman INTEGER,
			sub_reseller_limit INTEGER NOT NULL DEFAULT 10,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS reseller_sessions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			token_hash TEXT NOT NULL UNIQUE,
			reseller_id INTEGER NOT NULL,
			expires_at INTEGER NOT NULL,
			created_at INTEGER NOT NULL DEFAULT 0,
			last_used_at INTEGER NOT NULL DEFAULT 0,
			user_agent TEXT NOT NULL DEFAULT ''
		);

		CREATE TABLE IF NOT EXISTS reseller_plans (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			quota_gb INTEGER NOT NULL,
			duration_days INTEGER NOT NULL,
			price_toman INTEGER NOT NULL,
			inbound_id INTEGER NOT NULL,
			inbound_remark_snapshot TEXT,
			is_active INTEGER NOT NULL DEFAULT 1,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS reseller_custom_pricing (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			is_enabled INTEGER NOT NULL DEFAULT 0,
			price_per_gb_toman INTEGER NOT NULL DEFAULT 0,
			duration_days INTEGER NOT NULL DEFAULT 30,
			inbound_id INTEGER,
			inbound_remark_snapshot TEXT,
			updated_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS reseller_credit_packages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			quota_gb INTEGER NOT NULL,
			price_toman INTEGER NOT NULL,
			is_public INTEGER NOT NULL DEFAULT 1,
			is_active INTEGER NOT NULL DEFAULT 1,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS reseller_config_templates (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			reseller_id INTEGER NOT NULL,
			name TEXT NOT NULL,
			quota_gb INTEGER NOT NULL,
			duration_days INTEGER NOT NULL,
			price_toman INTEGER NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS reseller_credit_requests (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			reseller_id INTEGER NOT NULL,
			package_id INTEGER NOT NULL,
			quota_gb_snapshot INTEGER NOT NULL,
			price_toman_snapshot INTEGER NOT NULL,
			receipt_text TEXT NOT NULL DEFAULT '',
			receipt_file_name TEXT,
			receipt_mime_type TEXT,
			receipt_data_base64 TEXT,
			receipt_size_bytes INTEGER,
			status TEXT NOT NULL DEFAULT 'pending',
			manager_note TEXT NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL,
			reviewed_at INTEGER
		);

		CREATE TABLE IF NOT EXISTS reseller_gb_ledger (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			reseller_id INTEGER NOT NULL,
			request_id INTEGER,
			credit_request_id INTEGER,
			type TEXT NOT NULL,
			amount_gb INTEGER NOT NULL,
			created_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS reseller_payments (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			reseller_id INTEGER NOT NULL,
			amount_toman INTEGER NOT NULL,
			created_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS reseller_requests (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			reseller_id INTEGER NOT NULL,
			plan_id INTEGER NOT NULL,
			template_id INTEGER,
			customer_label TEXT NOT NULL,
			internal_note TEXT NOT NULL DEFAULT '',
			xui_email TEXT NOT NULL,
			xui_client_uuid TEXT NOT NULL UNIQUE,
			xui_inbound_id INTEGER NOT NULL,
			quota_gb_snapshot INTEGER NOT NULL,
			duration_days_snapshot INTEGER NOT NULL,
			price_toman_snapshot INTEGER NOT NULL,
			created_at INTEGER NOT NULL,
			revoked_at INTEGER,
			settled_amount_toman INTEGER NOT NULL DEFAULT 0,
			settled_payment_id INTEGER
		);

		CREATE TABLE IF NOT EXISTS reseller_charges (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			reseller_id INTEGER NOT NULL,
			request_id INTEGER NOT NULL,
			type TEXT NOT NULL,
			amount_toman INTEGER NOT NULL,
			settled_amount_toman INTEGER NOT NULL DEFAULT 0,
			reversed_amount_toman INTEGER NOT NULL DEFAULT 0,
			reversed_at INTEGER,
			created_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS reseller_tickets (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			reseller_id INTEGER NOT NULL,
			subject TEXT NOT NULL,
			message TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'open',
			created_at INTEGER NOT NULL,
			closed_at INTEGER
		);

		CREATE TABLE IF NOT EXISTS reseller_ticket_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			ticket_id INTEGER NOT NULL,
			sender_type TEXT NOT NULL,
			message TEXT NOT NULL,
			created_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS reseller_ticket_attachments (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			message_id INTEGER NOT NULL,
			file_name TEXT NOT NULL,
			mime_type TEXT NOT NULL,
			data_base64 TEXT NOT NULL,
			size_bytes INTEGER NOT NULL,
			created_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS reseller_sub_packages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			owner_reseller_id INTEGER NOT NULL,
			quota_gb INTEGER NOT NULL,
			price_toman INTEGER NOT NULL,
			is_active INTEGER NOT NULL DEFAULT 1,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS sub_reseller_credit_requests (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sub_reseller_id INTEGER NOT NULL,
			parent_reseller_id INTEGER NOT NULL,
			package_id INTEGER NOT NULL,
			quota_gb_snapshot INTEGER NOT NULL,
			price_toman_snapshot INTEGER NOT NULL,
			receipt_text TEXT NOT NULL DEFAULT '',
			receipt_file_name TEXT,
			receipt_mime_type TEXT,
			receipt_data_base64 TEXT,
			receipt_size_bytes INTEGER,
			status TEXT NOT NULL DEFAULT 'pending',
			parent_note TEXT NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL,
			reviewed_at INTEGER
		);

		CREATE TABLE IF NOT EXISTS reseller_groups (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			color TEXT NOT NULL DEFAULT '#6366f1',
			badge_icon TEXT NOT NULL DEFAULT 'sparkle',
			description TEXT NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS sub_reseller_tickets (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sub_reseller_id INTEGER NOT NULL,
			parent_reseller_id INTEGER NOT NULL,
			subject TEXT NOT NULL,
			message TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'open',
			created_at INTEGER NOT NULL,
			closed_at INTEGER
		);

		CREATE TABLE IF NOT EXISTS sub_reseller_ticket_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			ticket_id INTEGER NOT NULL,
			sender_type TEXT NOT NULL,
			message TEXT NOT NULL,
			created_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS sub_reseller_ticket_attachments (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			message_id INTEGER NOT NULL,
			file_name TEXT NOT NULL,
			mime_type TEXT NOT NULL,
			data_base64 TEXT NOT NULL,
			size_bytes INTEGER NOT NULL,
			created_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS client_tickets (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			client_uuid TEXT NOT NULL,
			owner_reseller_id INTEGER,
			subject TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'open',
			created_at INTEGER NOT NULL,
			closed_at INTEGER
		);

		CREATE TABLE IF NOT EXISTS client_ticket_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			ticket_id INTEGER NOT NULL,
			sender_type TEXT NOT NULL,
			message TEXT NOT NULL,
			created_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS client_ticket_attachments (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			message_id INTEGER NOT NULL,
			file_name TEXT NOT NULL,
			mime_type TEXT NOT NULL,
			data_base64 TEXT NOT NULL,
			size_bytes INTEGER NOT NULL,
			created_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS reseller_password_reset_tokens (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			reseller_id INTEGER NOT NULL,
			token_hash TEXT NOT NULL UNIQUE,
			expires_at INTEGER NOT NULL,
			used_at INTEGER
		);

		CREATE TABLE IF NOT EXISTS reseller_telegram_bots (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			reseller_id INTEGER NOT NULL UNIQUE,
			bot_id INTEGER NOT NULL,
			username TEXT NOT NULL DEFAULT '',
			display_name TEXT NOT NULL DEFAULT '',
			token_encrypted TEXT NOT NULL,
			webhook_secret TEXT NOT NULL,
			webhook_path_secret TEXT NOT NULL UNIQUE,
			status TEXT NOT NULL DEFAULT 'active',
			webhook_url TEXT NOT NULL DEFAULT '',
			last_error TEXT NOT NULL DEFAULT '',
			last_update_at INTEGER,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS telegram_bot_orders (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			reseller_id INTEGER NOT NULL,
			bot_id INTEGER NOT NULL,
			telegram_user_id INTEGER NOT NULL,
			telegram_username TEXT NOT NULL DEFAULT '',
			customer_name TEXT NOT NULL DEFAULT '',
			quota_gb REAL NOT NULL,
			duration_days INTEGER NOT NULL,
			price_toman INTEGER NOT NULL,
			inbound_id INTEGER NOT NULL DEFAULT 0,
			receipt_text TEXT NOT NULL DEFAULT '',
			receipt_file_id TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'awaiting_receipt',
			reseller_note TEXT NOT NULL DEFAULT '',
			customer_note TEXT NOT NULL DEFAULT '',
			xui_request_id INTEGER,
			xui_client_uuid TEXT,
			config_url TEXT,
			delivery_error TEXT NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			reviewed_at INTEGER,
			delivered_at INTEGER
		);

		CREATE TABLE IF NOT EXISTS reseller_plan_access (
			plan_id INTEGER NOT NULL,
			reseller_id INTEGER,
			group_id INTEGER,
			UNIQUE(plan_id, reseller_id, group_id)
		);

		CREATE TABLE IF NOT EXISTS reseller_credit_package_access (
			package_id INTEGER NOT NULL,
			reseller_id INTEGER,
			group_id INTEGER,
			UNIQUE(package_id, reseller_id, group_id)
		);

		CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_package_access_reseller
			ON reseller_credit_package_access(package_id, reseller_id)
			WHERE reseller_id IS NOT NULL;

		CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_package_access_group
			ON reseller_credit_package_access(package_id, group_id)
			WHERE group_id IS NOT NULL;

		CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_gb_ledger_purchase_once
			ON reseller_gb_ledger(credit_request_id)
			WHERE credit_request_id IS NOT NULL AND type = 'purchase';

		CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_gb_ledger_create_once
			ON reseller_gb_ledger(request_id)
			WHERE request_id IS NOT NULL AND type = 'create';

		CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_gb_ledger_refund_once
			ON reseller_gb_ledger(request_id)
			WHERE request_id IS NOT NULL AND type = 'refund';
	`);

	await ensureColumn('reseller_accounts', 'custom_message', "TEXT NOT NULL DEFAULT ''");
	await ensureColumn('reseller_accounts', 'debt_cap_toman', 'INTEGER');
	await ensureColumn('reseller_credit_packages', 'is_public', 'INTEGER NOT NULL DEFAULT 1');
	await ensureColumn('reseller_requests', 'internal_note', "TEXT NOT NULL DEFAULT ''");
	await ensureColumn('reseller_requests', 'template_id', 'INTEGER');
	await ensureColumn('reseller_accounts', 'email', "TEXT NOT NULL DEFAULT ''");
	await ensureColumn('reseller_accounts', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
	await ensureColumn('reseller_accounts', 'allowed_inbound_ids', "TEXT NOT NULL DEFAULT ''");
	await ensureColumn('reseller_requests', 'settled_amount_toman', 'INTEGER NOT NULL DEFAULT 0');
	await ensureColumn('reseller_charges', 'reversed_amount_toman', 'INTEGER NOT NULL DEFAULT 0');
	await ensureColumn('reseller_charges', 'reversed_at', 'INTEGER');
	await ensureColumn('reseller_tickets', 'status', "TEXT NOT NULL DEFAULT 'open'");
	await ensureColumn('reseller_tickets', 'closed_at', 'INTEGER');
	await ensureColumn('reseller_credit_requests', 'manager_note', "TEXT NOT NULL DEFAULT ''");
	await ensureColumn('reseller_credit_requests', 'reviewed_at', 'INTEGER');
	await ensureColumn('reseller_accounts', 'parent_reseller_id', 'INTEGER');
	await ensureColumn('reseller_accounts', 'can_manage_sub_resellers', 'INTEGER NOT NULL DEFAULT 0');
	await ensureColumn('reseller_accounts', 'sub_reseller_limit', 'INTEGER NOT NULL DEFAULT 10');
	await ensureColumn('reseller_accounts', 'group_id', 'INTEGER');
	await ensureColumn('reseller_accounts', 'client_tickets_enabled', 'INTEGER NOT NULL DEFAULT 0');
	await ensureColumn('reseller_accounts', 'telegram_bot_allowed', 'INTEGER NOT NULL DEFAULT 0');
	await ensureColumn('reseller_accounts', 'payment_card_number', "TEXT NOT NULL DEFAULT ''");
	await ensureColumn('reseller_accounts', 'payment_card_owner_name', "TEXT NOT NULL DEFAULT ''");
	await ensureColumn('reseller_accounts', 'is_system_manager', 'INTEGER NOT NULL DEFAULT 0');
	await ensureColumn('reseller_sessions', 'created_at', 'INTEGER NOT NULL DEFAULT 0');
	await ensureColumn('reseller_sessions', 'last_used_at', 'INTEGER NOT NULL DEFAULT 0');
	await ensureColumn('reseller_sessions', 'user_agent', "TEXT NOT NULL DEFAULT ''");
	await ensureColumn('reseller_plans', 'is_public', 'INTEGER NOT NULL DEFAULT 1');
	// Email unique partial index — allows multiple empty emails but enforces uniqueness for non-empty
	await run(
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_accounts_email
		 ON reseller_accounts(email) WHERE email != '' AND email IS NOT NULL`
	);
	await run(`
		INSERT INTO reseller_ticket_messages (
			ticket_id,
			sender_type,
			message,
			created_at
		)
		SELECT
			reseller_tickets.id,
			'reseller',
			reseller_tickets.message,
			reseller_tickets.created_at
		FROM reseller_tickets
		WHERE NOT EXISTS (
			SELECT 1
			FROM reseller_ticket_messages
			WHERE reseller_ticket_messages.ticket_id = reseller_tickets.id
		)
	`);
	await run(`
		UPDATE reseller_requests
		SET settled_amount_toman = price_toman_snapshot
		WHERE settled_payment_id IS NOT NULL AND settled_amount_toman = 0
	`);
	await run(`
		INSERT INTO reseller_charges (
			reseller_id,
			request_id,
			type,
			amount_toman,
			settled_amount_toman,
			reversed_amount_toman,
			reversed_at,
			created_at
		)
		SELECT
			reseller_id,
			id,
			'create',
			price_toman_snapshot,
			settled_amount_toman,
			CASE
				WHEN revoked_at IS NOT NULL THEN MAX(price_toman_snapshot - settled_amount_toman, 0)
				ELSE 0
			END,
			CASE
				WHEN revoked_at IS NOT NULL AND price_toman_snapshot > settled_amount_toman THEN revoked_at
				ELSE NULL
			END,
			created_at
		FROM reseller_requests
		WHERE NOT EXISTS (
			SELECT 1
			FROM reseller_charges
			WHERE reseller_charges.request_id = reseller_requests.id
				AND reseller_charges.type = 'create'
		)
	`);
}

async function purgeExpiredSessions() {
	await ensureResellerTables();
	await run('DELETE FROM reseller_sessions WHERE expires_at <= ?', [nowSeconds()]);
}

async function getResellerAccountById(id: number) {
	await ensureResellerTables();
	return queryFirst<ResellerAccountRow>(
		`
		SELECT
			id,
			username,
			username_normalized,
			password_hash,
			is_active,
			email,
			must_change_password,
			allowed_inbound_ids,
			custom_message,
			debt_cap_toman,
			parent_reseller_id,
			can_manage_sub_resellers,
			COALESCE(sub_reseller_limit, 10) AS sub_reseller_limit,
			COALESCE(group_id, NULL) AS group_id,
			COALESCE(client_tickets_enabled, 0) AS client_tickets_enabled,
			COALESCE(telegram_bot_allowed, 0) AS telegram_bot_allowed,
			COALESCE(payment_card_number, '') AS payment_card_number,
			COALESCE(payment_card_owner_name, '') AS payment_card_owner_name,
			COALESCE(is_system_manager, 0) AS is_system_manager,
			created_at,
			updated_at
		FROM reseller_accounts
		WHERE id = ?
		LIMIT 1
	`,
		[id]
	);
}

async function getResellerAccountByUsername(username: string) {
	await ensureResellerTables();
	return queryFirst<ResellerAccountRow>(
		`
		SELECT
			id,
			username,
			username_normalized,
			password_hash,
			is_active,
			email,
			must_change_password,
			allowed_inbound_ids,
			custom_message,
			debt_cap_toman,
			parent_reseller_id,
			can_manage_sub_resellers,
			COALESCE(sub_reseller_limit, 10) AS sub_reseller_limit,
			COALESCE(group_id, NULL) AS group_id,
			COALESCE(client_tickets_enabled, 0) AS client_tickets_enabled,
			COALESCE(telegram_bot_allowed, 0) AS telegram_bot_allowed,
			COALESCE(payment_card_number, '') AS payment_card_number,
			COALESCE(payment_card_owner_name, '') AS payment_card_owner_name,
			COALESCE(is_system_manager, 0) AS is_system_manager,
			created_at,
			updated_at
		FROM reseller_accounts
		WHERE username_normalized = ?
		LIMIT 1
	`,
		[normalizeUsername(username)]
	);
}

async function getResellerRequestsByResellerId(resellerId: number) {
	await ensureResellerTables();
	const rows = await queryAll<ResellerRequestRow>(
		`
		SELECT
			id,
			reseller_id,
			plan_id,
			template_id,
			customer_label,
			internal_note,
			xui_email,
			xui_client_uuid,
			xui_inbound_id,
			quota_gb_snapshot,
			duration_days_snapshot,
			price_toman_snapshot,
			created_at,
			revoked_at,
			settled_amount_toman,
			settled_payment_id
		FROM reseller_requests
		WHERE reseller_id = ?
		ORDER BY created_at DESC, id DESC
	`,
		[resellerId]
	);

	return rows.map(mapRequestRow);
}

async function getResellerPaymentsByResellerId(resellerId: number) {
	await ensureResellerTables();
	const rows = await queryAll<ResellerPaymentRow>(
		`
		SELECT id, reseller_id, amount_toman, created_at
		FROM reseller_payments
		WHERE reseller_id = ?
		ORDER BY created_at DESC, id DESC
	`,
		[resellerId]
	);

	return rows.map(mapPaymentRow);
}

async function getResellerChargesByResellerId(resellerId: number) {
	await ensureResellerTables();
	const rows = await queryAll<ResellerChargeRow>(
		`
		SELECT
			id,
			reseller_id,
			request_id,
			type,
			amount_toman,
			settled_amount_toman,
			reversed_amount_toman,
			reversed_at,
			created_at
		FROM reseller_charges
		WHERE reseller_id = ?
		ORDER BY created_at DESC, id DESC
	`,
		[resellerId]
	);

	return rows.map(mapChargeRow);
}

async function getResellerGbLedgerByResellerId(resellerId: number) {
	await ensureResellerTables();
	const rows = await queryAll<ResellerGbLedgerRow>(
		`
		SELECT id, reseller_id, request_id, credit_request_id, type, amount_gb, created_at
		FROM reseller_gb_ledger
		WHERE reseller_id = ?
		ORDER BY created_at DESC, id DESC
	`,
		[resellerId]
	);

	return rows.map(mapGbLedgerRow);
}

async function getResellerConfigTemplatesByResellerId(resellerId: number) {
	await ensureResellerTables();
	const rows = await queryAll<ResellerConfigTemplateRow>(
		`
		SELECT id, reseller_id, name, quota_gb, duration_days, price_toman, created_at, updated_at
		FROM reseller_config_templates
		WHERE reseller_id = ?
		ORDER BY updated_at DESC, id DESC
	`,
		[resellerId]
	);

	return rows.map(mapConfigTemplateRow);
}

async function getResellerConfigTemplateById(resellerId: number, templateId: number) {
	await ensureResellerTables();
	const row = await queryFirst<ResellerConfigTemplateRow>(
		`
		SELECT id, reseller_id, name, quota_gb, duration_days, price_toman, created_at, updated_at
		FROM reseller_config_templates
		WHERE reseller_id = ? AND id = ?
		LIMIT 1
	`,
		[resellerId, templateId]
	);

	return row ? mapConfigTemplateRow(row) : null;
}

async function insertGbLedger(input: {
	resellerId: number;
	requestId?: number | null;
	creditRequestId?: number | null;
	type: ResellerGbLedgerType;
	amountGb: number;
	createdAt?: number;
}) {
	if (!isFinite(input.amountGb) || input.amountGb === 0) {
		throw new Error('مقدار گیگابایت دفتر اعتبار نامعتبر است.');
	}

	await run(
		`
		INSERT INTO reseller_gb_ledger (
			reseller_id,
			request_id,
			credit_request_id,
			type,
			amount_gb,
			created_at
		)
		VALUES (?, ?, ?, ?, ?, ?)
	`,
		[
			input.resellerId,
			input.requestId ?? null,
			input.creditRequestId ?? null,
			input.type,
			input.amountGb,
			input.createdAt ?? nowSeconds()
		]
	);
}

export async function getResellerCreditPackages(options?: { onlyActive?: boolean }) {
	await ensureResellerTables();
	const [rows, access] = await Promise.all([
		queryAll<ResellerCreditPackageRow>(
			`
		SELECT id, quota_gb, price_toman, COALESCE(is_public, 1) AS is_public, is_active, created_at, updated_at
		FROM reseller_credit_packages
		${options?.onlyActive ? 'WHERE is_active = 1' : ''}
		ORDER BY is_active DESC, quota_gb ASC, price_toman ASC, id DESC
	`
		),
		queryAll<ResellerCreditPackageAccessRow>(
			'SELECT package_id, reseller_id, group_id FROM reseller_credit_package_access'
		)
	]);

	return rows.map((row) => mapCreditPackageRow(row, access));
}

async function getAccessibleResellerCreditPackages(account: ResellerAccountRow) {
	if (account.parent_reseller_id !== null || account.is_system_manager === 1) return [];
	const packages = await getResellerCreditPackages({ onlyActive: true });
	const group = account.group_id ? await getResellerGroupById(account.group_id) : null;
	return packages
		.filter(
			(pkg) =>
				pkg.isPublic ||
				pkg.resellerAccessIds.includes(account.id) ||
				(account.group_id !== null && pkg.groupAccessIds.includes(account.group_id))
		)
		.map((pkg) => {
			if (pkg.isPublic) return pkg;
			if (account.group_id !== null && pkg.groupAccessIds.includes(account.group_id)) {
				return {
					...pkg,
					accessKind: 'group' as const,
					eligibleGroupId: account.group_id,
					eligibleGroupName: group?.name ?? null
				};
			}
			return { ...pkg, accessKind: 'direct' as const };
		});
}

export async function getResellerCreditRequests(options?: {
	resellerId?: number;
	onlyPending?: boolean;
}) {
	await ensureResellerTables();
	const where: string[] = [];
	const args: (string | number)[] = [];

	if (options?.resellerId !== undefined) {
		where.push('reseller_credit_requests.reseller_id = ?');
		args.push(options.resellerId);
	}

	if (options?.onlyPending) {
		where.push("reseller_credit_requests.status = 'pending'");
	}

	const rows = await queryAll<ResellerCreditRequestRow>(
		`
		SELECT
			reseller_credit_requests.id,
			reseller_credit_requests.reseller_id,
			reseller_accounts.username AS reseller_username,
			reseller_credit_requests.package_id,
			reseller_credit_requests.quota_gb_snapshot,
			reseller_credit_requests.price_toman_snapshot,
			reseller_credit_requests.receipt_text,
			reseller_credit_requests.receipt_file_name,
			reseller_credit_requests.receipt_mime_type,
			reseller_credit_requests.receipt_data_base64,
			reseller_credit_requests.receipt_size_bytes,
			reseller_credit_requests.status,
			reseller_credit_requests.manager_note,
			reseller_credit_requests.created_at,
			reseller_credit_requests.reviewed_at
		FROM reseller_credit_requests
		LEFT JOIN reseller_accounts ON reseller_accounts.id = reseller_credit_requests.reseller_id
		${where.length ? `WHERE ${where.join(' AND ')}` : ''}
		ORDER BY reseller_credit_requests.created_at DESC, reseller_credit_requests.id DESC
	`,
		args
	);

	return rows.map(mapCreditRequestRow);
}

export async function getResellerTicketsByResellerId(resellerId: number) {
	await ensureResellerTables();
	const rows = await queryAll<ResellerTicketRow>(
		`
		SELECT
			reseller_tickets.id,
			reseller_tickets.reseller_id,
			reseller_accounts.username AS reseller_username,
			reseller_tickets.subject,
			reseller_tickets.message,
			reseller_tickets.status,
			reseller_tickets.created_at,
			reseller_tickets.closed_at
		FROM reseller_tickets
		LEFT JOIN reseller_accounts ON reseller_accounts.id = reseller_tickets.reseller_id
		WHERE reseller_tickets.reseller_id = ?
		ORDER BY reseller_tickets.created_at DESC, reseller_tickets.id DESC
	`,
		[resellerId]
	);

	return attachTicketMessages(rows.map(mapTicketRow));
}

export async function getResellerTicketsForAdmin(options?: { onlyOpen?: boolean }) {
	await ensureResellerTables();
	const rows = await queryAll<ResellerTicketRow>(
		`
		SELECT
			reseller_tickets.id,
			reseller_tickets.reseller_id,
			reseller_accounts.username AS reseller_username,
			reseller_tickets.subject,
			reseller_tickets.message,
			reseller_tickets.status,
			reseller_tickets.created_at,
			reseller_tickets.closed_at
		FROM reseller_tickets
		LEFT JOIN reseller_accounts ON reseller_accounts.id = reseller_tickets.reseller_id
		${options?.onlyOpen ? "WHERE reseller_tickets.status = 'open'" : ''}
		ORDER BY reseller_tickets.created_at DESC, reseller_tickets.id DESC
	`
	);

	return attachTicketMessages(rows.map(mapTicketRow));
}

async function insertTicketMessage(input: {
	ticketId: number;
	senderType: ResellerTicketSender;
	message: string;
	attachments?: NewTicketAttachmentInput[];
}) {
	const normalizedMessage = input.message.trim().slice(0, 5000);
	const attachments = validateTicketAttachments(input.attachments ?? []);

	if (!normalizedMessage && attachments.length === 0) {
		throw new Error('متن یا تصویر تیکت را وارد کنید.');
	}

	const createdAt = nowSeconds();
	const result = await insertAndReturnId(
		`
		INSERT INTO reseller_ticket_messages (
			ticket_id,
			sender_type,
			message,
			created_at
		)
		VALUES (?, ?, ?, ?)
	`,
		[input.ticketId, input.senderType, normalizedMessage, createdAt]
	);

	for (const attachment of attachments) {
		await run(
			`
			INSERT INTO reseller_ticket_attachments (
				message_id,
				file_name,
				mime_type,
				data_base64,
				size_bytes,
				created_at
			)
			VALUES (?, ?, ?, ?, ?, ?)
		`,
			[
				result.lastInsertRowid,
				attachment.fileName,
				attachment.mimeType,
				attachment.dataBase64,
				attachment.sizeBytes,
				createdAt
			]
		);
	}
}

async function insertAndReturnId(sql: string, args: (string | number | null)[]) {
	const database = await getDatabase();
	const result = await database.execute({ sql, args });
	return { lastInsertRowid: Number(result.lastInsertRowid) };
}

export async function createResellerTicket(
	resellerId: number,
	subject: string,
	message: string,
	attachments: NewTicketAttachmentInput[] = []
) {
	await ensureResellerTables();
	const normalizedSubject = subject.trim().replace(/\s+/g, ' ').slice(0, 120);
	const normalizedMessage = message.trim().slice(0, 5000);
	const normalizedAttachments = validateTicketAttachments(attachments);

	if (!normalizedMessage && normalizedAttachments.length === 0) {
		throw new Error('متن یا تصویر تیکت را وارد کنید.');
	}

	const result = await insertAndReturnId(
		`
		INSERT INTO reseller_tickets (
			reseller_id,
			subject,
			message,
			status,
			created_at,
			closed_at
		)
		VALUES (?, ?, ?, 'open', ?, NULL)
	`,
		[resellerId, normalizedSubject || 'بدون عنوان', normalizedMessage, nowSeconds()]
	);

	await insertTicketMessage({
		ticketId: result.lastInsertRowid,
		senderType: 'reseller',
		message: normalizedMessage,
		attachments: normalizedAttachments
	});
}

export async function addResellerTicketMessage(
	resellerId: number,
	ticketId: number,
	message: string,
	attachments: NewTicketAttachmentInput[] = []
) {
	await ensureResellerTables();
	const ticket = await queryFirst<ResellerTicketRow>(
		`
		SELECT
			reseller_tickets.id,
			reseller_tickets.reseller_id,
			reseller_accounts.username AS reseller_username,
			reseller_tickets.subject,
			reseller_tickets.message,
			reseller_tickets.status,
			reseller_tickets.created_at,
			reseller_tickets.closed_at
		FROM reseller_tickets
		LEFT JOIN reseller_accounts ON reseller_accounts.id = reseller_tickets.reseller_id
		WHERE reseller_tickets.id = ?
		LIMIT 1
	`,
		[ticketId]
	);

	if (!ticket || ticket.reseller_id !== resellerId) {
		resellerLogger.warn('Blocked reseller ticket ownership violation.', { resellerId, ticketId });
		throw new Error('تیکت پیدا نشد.');
	}

	if (ticket.status === 'closed') {
		throw new Error('این تیکت بسته شده است.');
	}

	await insertTicketMessage({
		ticketId,
		senderType: 'reseller',
		message,
		attachments
	});
}

export async function addManagerTicketMessage(ticketId: number, message: string) {
	await ensureResellerTables();
	const ticket = await queryFirst<ResellerTicketRow>(
		`
		SELECT
			reseller_tickets.id,
			reseller_tickets.reseller_id,
			reseller_accounts.username AS reseller_username,
			reseller_tickets.subject,
			reseller_tickets.message,
			reseller_tickets.status,
			reseller_tickets.created_at,
			reseller_tickets.closed_at
		FROM reseller_tickets
		LEFT JOIN reseller_accounts ON reseller_accounts.id = reseller_tickets.reseller_id
		WHERE reseller_tickets.id = ?
		LIMIT 1
	`,
		[ticketId]
	);

	if (!ticket) {
		throw new Error('تیکت پیدا نشد.');
	}

	if (ticket.status === 'closed') {
		throw new Error('این تیکت بسته شده است.');
	}

	await insertTicketMessage({
		ticketId,
		senderType: 'manager',
		message
	});
}

export async function closeResellerTicket(id: number, resellerId?: number) {
	await ensureResellerTables();
	await run(
		`
		UPDATE reseller_tickets
		SET status = 'closed',
			closed_at = ?
		WHERE id = ?
			AND status = 'open'
			${resellerId === undefined ? '' : 'AND reseller_id = ?'}
	`,
		resellerId === undefined ? [nowSeconds(), id] : [nowSeconds(), id, resellerId]
	);
}

async function insertResellerCharge(input: {
	resellerId: number;
	requestId: number;
	type: ResellerChargeType;
	amountToman: number;
	createdAt?: number;
}) {
	await run(
		`
		INSERT INTO reseller_charges (
			reseller_id,
			request_id,
			type,
			amount_toman,
			settled_amount_toman,
			reversed_amount_toman,
			reversed_at,
			created_at
		)
		VALUES (?, ?, ?, ?, 0, 0, NULL, ?)
	`,
		[
			input.resellerId,
			input.requestId,
			input.type,
			input.amountToman,
			input.createdAt ?? nowSeconds()
		]
	);
}

export async function getResellerPlans(options?: { onlyActive?: boolean }) {
	await ensureResellerTables();
	const rows = await queryAll<ResellerPlanRow>(
		`
		SELECT
			id,
			quota_gb,
			duration_days,
			price_toman,
			inbound_id,
			inbound_remark_snapshot,
			is_active,
			COALESCE(is_public, 1) AS is_public,
			created_at,
			updated_at
		FROM reseller_plans
		${options?.onlyActive ? 'WHERE is_active = 1' : ''}
		ORDER BY is_active DESC, price_toman ASC, duration_days ASC, id DESC
	`
	);

	return rows.map(mapPlanRow);
}

export async function getResellerCustomPricing() {
	await ensureResellerTables();
	const row = await queryFirst<ResellerCustomPricingRow>(
		`
		SELECT
			id,
			is_enabled,
			price_per_gb_toman,
			duration_days,
			inbound_id,
			inbound_remark_snapshot,
			updated_at
		FROM reseller_custom_pricing
		WHERE id = 1
		LIMIT 1
	`
	);

	return mapCustomPricingRow(row);
}

export async function updateResellerCustomPricing(input: {
	enabled: boolean;
	pricePerGbToman: number;
	inboundId: number;
}) {
	await ensureResellerTables();
	const inbound = (await getXuiInboundOptions()).find((item) => item.id === input.inboundId);

	if (!inbound) {
		throw new Error('ورودی انتخاب‌شده در 3x-ui پیدا نشد.');
	}

	const now = nowSeconds();
	await run(
		`
		INSERT INTO reseller_custom_pricing (
			id,
			is_enabled,
			price_per_gb_toman,
			duration_days,
			inbound_id,
			inbound_remark_snapshot,
			updated_at
		)
		VALUES (1, ?, ?, 30, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			is_enabled = excluded.is_enabled,
			price_per_gb_toman = excluded.price_per_gb_toman,
			duration_days = excluded.duration_days,
			inbound_id = excluded.inbound_id,
			inbound_remark_snapshot = excluded.inbound_remark_snapshot,
			updated_at = excluded.updated_at
	`,
		[input.enabled ? 1 : 0, input.pricePerGbToman, input.inboundId, inbound.remark, now]
	);
}

export async function createResellerCreditPackage(input: {
	quotaGb: number;
	priceToman: number;
	isPublic?: boolean;
}) {
	await ensureResellerTables();

	if (!isFinite(input.quotaGb) || input.quotaGb <= 0) {
		throw new Error('حجم بسته باید بیشتر از صفر باشد.');
	}

	if (!Number.isInteger(input.priceToman) || input.priceToman < 0) {
		throw new Error('قیمت بسته نامعتبر است.');
	}

	const now = nowSeconds();
	await run(
		`
		INSERT INTO reseller_credit_packages (quota_gb, price_toman, is_public, is_active, created_at, updated_at)
		VALUES (?, ?, ?, 1, ?, ?)
	`,
		[input.quotaGb, input.priceToman, input.isPublic === false ? 0 : 1, now, now]
	);
}

export async function updateResellerCreditPackage(
	id: number,
	input: { quotaGb: number; priceToman: number }
) {
	await ensureResellerTables();

	if (!isFinite(input.quotaGb) || input.quotaGb <= 0) {
		throw new Error('حجم بسته باید بیشتر از صفر باشد.');
	}

	if (!Number.isInteger(input.priceToman) || input.priceToman < 0) {
		throw new Error('قیمت بسته نامعتبر است.');
	}

	await run(
		`
		UPDATE reseller_credit_packages
		SET quota_gb = ?, price_toman = ?, updated_at = ?
		WHERE id = ?
	`,
		[input.quotaGb, input.priceToman, nowSeconds(), id]
	);
}

export async function setResellerCreditPackageActive(id: number, isActive: boolean) {
	await ensureResellerTables();
	await run('UPDATE reseller_credit_packages SET is_active = ?, updated_at = ? WHERE id = ?', [
		isActive ? 1 : 0,
		nowSeconds(),
		id
	]);
}

export async function setResellerCreditPackagePublic(id: number, isPublic: boolean) {
	await ensureResellerTables();
	await run('UPDATE reseller_credit_packages SET is_public = ?, updated_at = ? WHERE id = ?', [
		isPublic ? 1 : 0,
		nowSeconds(),
		id
	]);
	if (isPublic) {
		await run('DELETE FROM reseller_credit_package_access WHERE package_id = ?', [id]);
	}
}

export async function setResellerCreditPackageAccess(
	packageId: number,
	target: { resellerId: number | null; groupId: number | null },
	enabled: boolean
) {
	await ensureResellerTables();
	const pkg = await getCreditPackageById(packageId);
	if (!pkg || pkg.isPublic) throw new Error('دسترسی فقط برای بسته خصوصی قابل تنظیم است.');
	if ((target.resellerId === null) === (target.groupId === null)) {
		throw new Error('یک فروشنده یا گروه را انتخاب کنید.');
	}
	if (target.groupId !== null && !(await getResellerGroupById(target.groupId))) {
		throw new Error('گروه انتخابی وجود ندارد.');
	}
	if (target.resellerId !== null) {
		const account = await getResellerAccountById(target.resellerId);
		if (!account || account.parent_reseller_id !== null || account.is_system_manager === 1) {
			throw new Error('فقط فروشنده مستقیم می‌تواند دسترسی اختصاصی دریافت کند.');
		}
	}
	if (enabled) {
		await run(
			'INSERT OR IGNORE INTO reseller_credit_package_access (package_id, reseller_id, group_id) VALUES (?, ?, ?)',
			[packageId, target.resellerId, target.groupId]
		);
	} else {
		await run(
			'DELETE FROM reseller_credit_package_access WHERE package_id = ? AND (reseller_id IS ? OR reseller_id = ?) AND (group_id IS ? OR group_id = ?)',
			[packageId, target.resellerId, target.resellerId, target.groupId, target.groupId]
		);
	}
}

function validateTemplateValues(input: {
	name?: string;
	quotaGb: number;
	durationDays: number;
	priceToman: number;
}) {
	if (!Number.isFinite(input.quotaGb) || input.quotaGb < 0.01) {
		throw new Error('حجم قالب باید حداقل ۰.۰۱ گیگابایت باشد.');
	}

	if (!Number.isInteger(input.durationDays) || input.durationDays < 1 || input.durationDays > 365) {
		throw new Error('مدت قالب باید عدد صحیح بین ۱ تا ۳۶۵ روز باشد.');
	}

	if (!Number.isInteger(input.priceToman) || input.priceToman < 0) {
		throw new Error('قیمت فروش قالب نامعتبر است.');
	}

	const name = input.name?.trim().replace(/\s+/g, ' ').slice(0, 64);
	const quotaLabel = Number.isInteger(input.quotaGb)
		? `${input.quotaGb}GB`
		: `${input.quotaGb.toFixed(2).replace(/\.?0+$/, '')}GB`;

	return {
		name: name || `${quotaLabel} / ${input.durationDays}D`,
		quotaGb: input.quotaGb,
		durationDays: input.durationDays,
		priceToman: input.priceToman
	};
}

export async function createResellerConfigTemplate(
	resellerId: number,
	input: { name?: string; quotaGb: number; durationDays: number; priceToman: number }
) {
	await ensureResellerTables();
	const account = await getResellerAccountById(resellerId);

	if (!account || account.is_active !== 1) {
		throw new Error('حساب فروشنده فعال نیست.');
	}

	const values = validateTemplateValues(input);
	const now = nowSeconds();
	await run(
		`
		INSERT INTO reseller_config_templates (
			reseller_id,
			name,
			quota_gb,
			duration_days,
			price_toman,
			created_at,
			updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`,
		[resellerId, values.name, values.quotaGb, values.durationDays, values.priceToman, now, now]
	);
}

export async function deleteResellerConfigTemplate(resellerId: number, templateId: number) {
	await ensureResellerTables();
	await run('DELETE FROM reseller_config_templates WHERE reseller_id = ? AND id = ?', [
		resellerId,
		templateId
	]);
}

async function getCreditPackageById(id: number) {
	await ensureResellerTables();
	const row = await queryFirst<ResellerCreditPackageRow>(
		`
		SELECT id, quota_gb, price_toman, COALESCE(is_public, 1) AS is_public, is_active, created_at, updated_at
		FROM reseller_credit_packages
		WHERE id = ?
		LIMIT 1
	`,
		[id]
	);

	if (!row) return null;
	const access = await queryAll<ResellerCreditPackageAccessRow>(
		'SELECT package_id, reseller_id, group_id FROM reseller_credit_package_access WHERE package_id = ?',
		[id]
	);
	return mapCreditPackageRow(row, access);
}

function validateCreditReceipt(input: {
	receiptText: string;
	receiptFileName?: string | null;
	receiptMimeType?: string | null;
	receiptDataBase64?: string | null;
	receiptSizeBytes?: number | null;
}) {
	const receiptText = input.receiptText.trim().slice(0, 2000);
	const hasFile = Boolean(input.receiptDataBase64?.trim());

	if (!receiptText && !hasFile) {
		throw new Error('متن رسید یا تصویر رسید را وارد کنید.');
	}

	if (!hasFile) {
		return {
			receiptText,
			receiptFileName: null,
			receiptMimeType: null,
			receiptDataBase64: null,
			receiptSizeBytes: null
		};
	}

	const [attachment] = validateTicketAttachments([
		{
			fileName: input.receiptFileName ?? 'receipt',
			mimeType: input.receiptMimeType ?? '',
			dataBase64: input.receiptDataBase64 ?? '',
			sizeBytes: input.receiptSizeBytes ?? 0
		}
	]);

	return {
		receiptText,
		receiptFileName: attachment.fileName,
		receiptMimeType: attachment.mimeType,
		receiptDataBase64: attachment.dataBase64,
		receiptSizeBytes: attachment.sizeBytes
	};
}

export async function createResellerCreditRequest(input: {
	resellerId: number;
	packageId: number;
	receiptText: string;
	receiptFileName?: string | null;
	receiptMimeType?: string | null;
	receiptDataBase64?: string | null;
	receiptSizeBytes?: number | null;
}) {
	await ensureResellerTables();
	const account = await getResellerAccountById(input.resellerId);

	if (!account || account.is_active !== 1) {
		throw new Error('حساب فروشنده فعال نیست.');
	}

	if (account.parent_reseller_id !== null || account.is_system_manager === 1) {
		throw new Error('این بسته فقط برای فروشندگان مستقیم در دسترس است.');
	}

	const creditPackage = await getCreditPackageById(input.packageId);

	if (!creditPackage || !creditPackage.isActive) {
		throw new Error('بسته شارژ انتخاب‌شده در دسترس نیست.');
	}

	const accessiblePackages = await getAccessibleResellerCreditPackages(account);
	if (!accessiblePackages.some((pkg) => pkg.id === creditPackage.id)) {
		throw new Error('دسترسی به این بسته شارژ برای حساب شما فعال نیست.');
	}

	const receipt = validateCreditReceipt(input);
	const now = nowSeconds();
	await run(
		`
		INSERT INTO reseller_credit_requests (
			reseller_id,
			package_id,
			quota_gb_snapshot,
			price_toman_snapshot,
			receipt_text,
			receipt_file_name,
			receipt_mime_type,
			receipt_data_base64,
			receipt_size_bytes,
			status,
			manager_note,
			created_at,
			reviewed_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', ?, NULL)
	`,
		[
			input.resellerId,
			creditPackage.id,
			creditPackage.quotaGb,
			creditPackage.priceToman,
			receipt.receiptText,
			receipt.receiptFileName,
			receipt.receiptMimeType,
			receipt.receiptDataBase64,
			receipt.receiptSizeBytes,
			now
		]
	);
}

export async function reviewResellerCreditRequest(
	id: number,
	status: 'approved' | 'rejected',
	managerNote = ''
) {
	await ensureResellerTables();
	const request = (await getResellerCreditRequests()).find((item) => item.id === id);

	if (!request) {
		throw new Error('درخواست شارژ پیدا نشد.');
	}

	if (request.status !== 'pending') {
		throw new Error('این درخواست قبلاً بررسی شده است.');
	}

	const reviewedAt = nowSeconds();
	await run(
		`
		UPDATE reseller_credit_requests
		SET status = ?, manager_note = ?, reviewed_at = ?
		WHERE id = ?
	`,
		[status, managerNote.trim().slice(0, 500), reviewedAt, id]
	);

	if (status === 'approved') {
		await insertGbLedger({
			resellerId: request.resellerId,
			creditRequestId: request.id,
			type: 'purchase',
			amountGb: request.quotaGbSnapshot,
			createdAt: reviewedAt
		});
	}
}

async function getResellerPlanById(id: number) {
	await ensureResellerTables();
	const row = await queryFirst<ResellerPlanRow>(
		`
		SELECT
			id,
			quota_gb,
			duration_days,
			price_toman,
			inbound_id,
			inbound_remark_snapshot,
			is_active,
			COALESCE(is_public, 1) AS is_public,
			created_at,
			updated_at
		FROM reseller_plans
		WHERE id = ?
		LIMIT 1
	`,
		[id]
	);

	return row ? mapPlanRow(row) : null;
}

async function getRequestById(id: number) {
	await ensureResellerTables();
	const row = await queryFirst<ResellerRequestRow>(
		`
		SELECT
			id,
			reseller_id,
			plan_id,
			template_id,
			customer_label,
			internal_note,
			xui_email,
			xui_client_uuid,
			xui_inbound_id,
			quota_gb_snapshot,
			duration_days_snapshot,
			price_toman_snapshot,
			created_at,
			revoked_at,
			settled_amount_toman,
			settled_payment_id
		FROM reseller_requests
		WHERE id = ?
		LIMIT 1
	`,
		[id]
	);

	return row ? mapRequestRow(row) : null;
}

async function getTelegramBotRowByResellerId(resellerId: number) {
	await ensureResellerTables();
	return queryFirst<ResellerTelegramBotRow>(
		`SELECT id, reseller_id, bot_id, username, display_name, token_encrypted, webhook_secret,
		        webhook_path_secret, status, webhook_url, last_error, last_update_at, created_at, updated_at
		 FROM reseller_telegram_bots WHERE reseller_id = ? LIMIT 1`,
		[resellerId]
	);
}

async function getTelegramBotRowByWebhookSecret(secret: string) {
	await ensureResellerTables();
	return queryFirst<ResellerTelegramBotRow>(
		`SELECT id, reseller_id, bot_id, username, display_name, token_encrypted, webhook_secret,
		        webhook_path_secret, status, webhook_url, last_error, last_update_at, created_at, updated_at
		 FROM reseller_telegram_bots WHERE webhook_path_secret = ? LIMIT 1`,
		[secret]
	);
}

async function getTelegramOrderById(id: number) {
	await ensureResellerTables();
	const row = await queryFirst<TelegramBotOrderRow>(
		`SELECT id, reseller_id, bot_id, telegram_user_id, telegram_username, customer_name,
		        quota_gb, duration_days, price_toman, inbound_id, receipt_text, receipt_file_id,
		        status, reseller_note, customer_note, xui_request_id, xui_client_uuid, config_url,
		        delivery_error, created_at, updated_at, reviewed_at, delivered_at
		 FROM telegram_bot_orders WHERE id = ? LIMIT 1`,
		[id]
	);
	return row ? mapTelegramOrderRow(row) : null;
}

export async function getResellerTelegramBot(resellerId: number) {
	const row = await getTelegramBotRowByResellerId(resellerId);
	return row ? mapTelegramBotRow(row) : null;
}

export async function getTelegramOrdersByResellerId(resellerId: number) {
	await ensureResellerTables();
	const settings = await getFeatureSettings();
	await run(
		`UPDATE telegram_bot_orders
		 SET status = 'expired', updated_at = ?
		 WHERE reseller_id = ?
		   AND status = 'awaiting_receipt'
		   AND created_at <= ?`,
		[nowSeconds(), resellerId, nowSeconds() - settings.telegramBotDraftExpiryMinutes * 60]
	);
	const rows = await queryAll<TelegramBotOrderRow>(
		`SELECT id, reseller_id, bot_id, telegram_user_id, telegram_username, customer_name,
		        quota_gb, duration_days, price_toman, inbound_id, receipt_text, receipt_file_id,
		        status, reseller_note, customer_note, xui_request_id, xui_client_uuid, config_url,
		        delivery_error, created_at, updated_at, reviewed_at, delivered_at
		 FROM telegram_bot_orders
		 WHERE reseller_id = ?
		 ORDER BY created_at DESC, id DESC
		 LIMIT 100`,
		[resellerId]
	);
	return rows.map(mapTelegramOrderRow);
}

async function buildResellerDashboard(
	account: ResellerAccountRow,
	origin: string,
	fallbackHost?: string,
	cookies?: Cookies
): Promise<ResellerDashboardState> {
	const [
		plans,
		allPlans,
		templates,
		creditPackages,
		creditRequests,
		gbLedger,
		requests,
		payments,
		charges,
		tickets,
		liveUsageMap,
		managerMessage,
		telegramBot,
		telegramOrders
	] = await Promise.all([
		getResellerPlans({ onlyActive: true }),
		getResellerPlans(),
		getResellerConfigTemplatesByResellerId(account.id),
		account.parent_reseller_id !== null
			? Promise.resolve([])
			: getAccessibleResellerCreditPackages(account),
		getResellerCreditRequests({ resellerId: account.id }),
		getResellerGbLedgerByResellerId(account.id),
		getResellerRequestsByResellerId(account.id),
		getResellerPaymentsByResellerId(account.id),
		getResellerChargesByResellerId(account.id),
		getResellerTicketsByResellerId(account.id),
		getVpnClientUsageMap(fallbackHost, {
			includeOnlineStatus: true
		}),
		getResellerPanelMessage(),
		getResellerTelegramBot(account.id),
		getTelegramOrdersByResellerId(account.id)
	]);
	const availableInbounds = (await getXuiInboundOptions()).filter(
		(inbound) => inbound.enable && isInboundAllowedForAccount(account, inbound.id)
	);
	const visiblePlans = plans.filter((plan) => isInboundAllowedForAccount(account, plan.inboundId));
	const salesEnabled = await isFeatureEnabled('reseller_sales');

	const requestViews = requests.map((request) =>
		buildRequestView(request, origin, liveUsageMap, account.username, charges, allPlans)
	);

	const isSubReseller =
		account.parent_reseller_id !== null && account.parent_reseller_id !== undefined;
	const canManageSubResellers = !isSubReseller && account.can_manage_sub_resellers === 1;

	// Reseller group info
	const resellerGroup = account.group_id ? await getResellerGroupById(account.group_id) : null;

	// Only load sub-reseller management data for parent resellers with permission
	const [
		subResellers,
		subPackages,
		subCreditRequests,
		subResellerTickets,
		clientTickets,
		parentSubPackages
	] = canManageSubResellers
		? await Promise.all([
				getSubResellersByParent(account.id),
				getSubPackagesByOwner(account.id),
				getSubCreditRequestsByParent(account.id),
				getSubResellerTicketsByParent(account.id),
				getClientTicketsByOwner(account.id),
				Promise.resolve([])
			])
		: isSubReseller && account.parent_reseller_id
			? await Promise.all([
					Promise.resolve([]),
					Promise.resolve([]),
					getSubCreditRequestsBySubReseller(account.id),
					getSubResellerTicketsBySubReseller(account.id),
					getClientTicketsByOwner(account.id),
					// sub-reseller sees parent's active sub-packages as their "credit packages"
					getSubPackagesByOwner(account.parent_reseller_id)
				])
			: [[], [], [], [], await getClientTicketsByOwner(account.id), []];

	// Private plans: if the plan is not public, only show it if the reseller has access
	const visiblePublicPlans = visiblePlans.filter((plan) => plan.isPublic);
	const privatePlanAccess = await queryAll<Row & { plan_id: number }>(
		`SELECT plan_id FROM reseller_plan_access WHERE reseller_id = ? OR group_id = COALESCE(?, -1)`,
		[account.id, account.group_id ?? null]
	);
	const accessiblePrivatePlanIds = new Set(privatePlanAccess.map((r) => r.plan_id));
	const accessiblePrivatePlans = visiblePlans.filter(
		(plan) => !plan.isPublic && accessiblePrivatePlanIds.has(plan.id)
	);
	const combinedVisiblePlans = [...visiblePublicPlans, ...accessiblePrivatePlans];
	const sessions = await getResellerSessions(account.id, cookies ?? null);
	const telegramBotFeatureEnabled = await isFeatureEnabled('telegram_sales_bot');
	const parentAccount =
		isSubReseller && account.parent_reseller_id
			? await getResellerAccountById(account.parent_reseller_id)
			: null;
	const paymentCard = isSubReseller
		? normalizePaymentCardInput({
				cardNumber: parentAccount?.payment_card_number ?? '',
				cardOwnerName: parentAccount?.payment_card_owner_name ?? ''
			})
		: await getPaymentCardSettings();
	const ownPaymentCard = normalizePaymentCardInput({
		cardNumber: account.payment_card_number ?? '',
		cardOwnerName: account.payment_card_owner_name ?? ''
	});

	return {
		authenticated: true,
		isSubReseller,
		canManageSubResellers,
		parentResellerId: account.parent_reseller_id ?? null,
		reseller: {
			id: account.id,
			username: account.username,
			email: account.email ?? '',
			mustChangePassword: account.must_change_password === 1,
			customMessage: account.custom_message ?? '',
			managerMessage,
			allowedInboundIds: parseAllowedInboundIds(account.allowed_inbound_ids),
			debtCapToman: account.debt_cap_toman ?? null,
			clientTicketsEnabled: account.client_tickets_enabled === 1,
			telegramBotAllowed: account.telegram_bot_allowed === 1,
			paymentCard: ownPaymentCard,
			subResellerLimit: account.sub_reseller_limit ?? 10,
			group: resellerGroup
		},
		stats: buildResellerStats(
			requests,
			payments,
			account.debt_cap_toman ?? null,
			charges,
			gbLedger
		),
		dailySummary: buildDailySummary(requests, charges, gbLedger),
		paymentCard,
		salesEnabled,
		availableInbounds,
		templates,
		creditPackages: isSubReseller
			? (parentSubPackages as unknown as typeof creditPackages).filter(
					(p: { isActive: boolean }) => p.isActive
				)
			: creditPackages,
		creditRequests: isSubReseller
			? (subCreditRequests as unknown as typeof creditRequests)
			: creditRequests,
		gbLedger,
		payments: isSubReseller ? [] : payments,
		charges: isSubReseller ? [] : charges,
		tickets,
		plans: combinedVisiblePlans,
		requests: requestViews,
		lastCreatedRequest: requestViews[0] ?? null,
		subResellers,
		subPackages,
		subCreditRequests,
		subResellerTickets: subResellerTickets as SubResellerTicket[],
		clientTickets: clientTickets as ClientTicket[],
		telegramBotFeatureEnabled,
		telegramBotAllowed: !isSubReseller && account.telegram_bot_allowed === 1,
		telegramBot,
		telegramOrders,
		sessions
	};
}

export async function createResellerAccount(
	username: string,
	password: string,
	options?: {
		debtCapToman?: number | null;
		allowedInboundIds?: number[] | null;
	}
) {
	await ensureResellerTables();
	const normalizedUsername = normalizeUsername(username);

	if (!normalizedUsername) {
		throw new Error('نام کاربری نامعتبر است.');
	}

	const now = nowSeconds();
	const passwordHash = await hashSecret(password.trim());

	try {
		await run(
			`
			INSERT INTO reseller_accounts (
				username,
				username_normalized,
				password_hash,
				is_active,
				email,
				must_change_password,
				allowed_inbound_ids,
				custom_message,
				debt_cap_toman,
				created_at,
				updated_at
			)
			VALUES (?, ?, ?, 1, '', 0, ?, '', ?, ?, ?)
		`,
			[
				username.trim(),
				normalizedUsername,
				passwordHash,
				stringifyAllowedInboundIds(options?.allowedInboundIds),
				options?.debtCapToman ?? null,
				now,
				now
			]
		);
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			throw new Error('این نام کاربری قبلاً ثبت شده است.');
		}

		throw error;
	}
}

export async function setResellerAccountActive(id: number, isActive: boolean) {
	await ensureResellerTables();
	const now = nowSeconds();
	await run(
		`
		UPDATE reseller_accounts
		SET is_active = ?, updated_at = ?
		WHERE id = ?
	`,
		[isActive ? 1 : 0, now, id]
	);
}

async function getResellerDeleteBlockReason(id: number) {
	await ensureResellerTables();
	const [requestRow, paymentRow, chargeRow, sessionRow] = await Promise.all([
		queryFirst<Row & { count: number }>(
			'SELECT COUNT(*) AS count FROM reseller_requests WHERE reseller_id = ?',
			[id]
		),
		queryFirst<Row & { count: number }>(
			'SELECT COUNT(*) AS count FROM reseller_payments WHERE reseller_id = ?',
			[id]
		),
		queryFirst<Row & { count: number }>(
			'SELECT COUNT(*) AS count FROM reseller_charges WHERE reseller_id = ?',
			[id]
		),
		queryFirst<Row & { count: number }>(
			'SELECT COUNT(*) AS count FROM reseller_sessions WHERE reseller_id = ?',
			[id]
		)
	]);

	if ((requestRow?.count ?? 0) > 0) {
		return 'این فروشنده کانفیگ ثبت‌شده دارد.';
	}

	if ((paymentRow?.count ?? 0) > 0) {
		return 'این فروشنده سابقه پرداخت دارد.';
	}

	if ((chargeRow?.count ?? 0) > 0) {
		return 'این فروشنده رویداد مالی دارد.';
	}

	if ((sessionRow?.count ?? 0) > 0) {
		return 'این فروشنده نشست فعال دارد.';
	}

	return null;
}

export async function deleteResellerAccount(id: number) {
	await ensureResellerTables();
	const account = await getResellerAccountById(id);

	if (!account) {
		throw new Error('حساب فروشنده پیدا نشد.');
	}

	const blockReason = await getResellerDeleteBlockReason(id);

	if (blockReason) {
		throw new Error(`حذف امن ممکن نیست: ${blockReason}`);
	}

	await run('DELETE FROM reseller_config_templates WHERE reseller_id = ?', [id]);
	await run('DELETE FROM reseller_accounts WHERE id = ?', [id]);
	await run('DELETE FROM reseller_credit_package_access WHERE reseller_id = ?', [id]);
}

export async function hardDeleteResellerAccount(id: number) {
	await ensureResellerTables();
	const account = await getResellerAccountById(id);

	if (!account) {
		throw new Error('حساب فروشنده پیدا نشد.');
	}

	// Remove all active xui configs for this reseller first
	const requests = await getResellerRequestsByResellerId(id);
	const activeRequests = requests.filter((r) => r.revokedAt === null);
	await Promise.allSettled(activeRequests.map((r) => deleteVpnClient(r.xuiEmail)));

	// Wipe all related DB records
	await run('DELETE FROM reseller_charges WHERE reseller_id = ?', [id]);
	await run('DELETE FROM reseller_gb_ledger WHERE reseller_id = ?', [id]);
	await run('DELETE FROM reseller_requests WHERE reseller_id = ?', [id]);
	await run('DELETE FROM reseller_payments WHERE reseller_id = ?', [id]);
	await run('DELETE FROM reseller_sessions WHERE reseller_id = ?', [id]);
	await run('DELETE FROM reseller_config_templates WHERE reseller_id = ?', [id]);
	await run('DELETE FROM reseller_credit_package_access WHERE reseller_id = ?', [id]);
	await run('DELETE FROM reseller_credit_requests WHERE reseller_id = ?', [id]);
	const ticketIds = await queryAll<Row & { id: number }>(
		'SELECT id FROM reseller_tickets WHERE reseller_id = ?',
		[id]
	);
	for (const t of ticketIds) {
		await run('DELETE FROM reseller_ticket_messages WHERE ticket_id = ?', [t.id]);
	}
	await run('DELETE FROM reseller_tickets WHERE reseller_id = ?', [id]);
	await run('DELETE FROM reseller_plan_access WHERE reseller_id = ?', [id]);
	await run('DELETE FROM reseller_accounts WHERE id = ?', [id]);
}

export async function updateResellerDebtCap(id: number, debtCapToman: number | null) {
	await ensureResellerTables();
	await run('UPDATE reseller_accounts SET debt_cap_toman = ?, updated_at = ? WHERE id = ?', [
		debtCapToman,
		nowSeconds(),
		id
	]);
}

export async function updateResellerAllowedInbounds(
	id: number,
	allowedInboundIds: number[] | null
) {
	await ensureResellerTables();
	await run('UPDATE reseller_accounts SET allowed_inbound_ids = ?, updated_at = ? WHERE id = ?', [
		stringifyAllowedInboundIds(allowedInboundIds),
		nowSeconds(),
		id
	]);
}

export async function updateResellerSubResellerLimit(id: number, limit: number) {
	await ensureResellerTables();
	await run(
		'UPDATE reseller_accounts SET sub_reseller_limit = ?, updated_at = ? WHERE id = ? AND parent_reseller_id IS NULL',
		[limit, nowSeconds(), id]
	);
}

export async function updateResellerCustomMessage(resellerId: number, customMessage: string) {
	await ensureResellerTables();
	await run('UPDATE reseller_accounts SET custom_message = ?, updated_at = ? WHERE id = ?', [
		customMessage.trim(),
		nowSeconds(),
		resellerId
	]);
}

export async function getResellerMessageByUsername(username: string) {
	const account = await getResellerAccountByUsername(username);
	return account?.custom_message?.trim() || null;
}

export async function setResellerTelegramBotAllowed(resellerId: number, enabled: boolean) {
	await ensureResellerTables();
	const account = await getResellerAccountById(resellerId);
	if (!account) throw new Error('حساب فروشنده پیدا نشد.');
	if (account.parent_reseller_id !== null) {
		throw new Error('بات تلگرام فقط برای فروشندگان اصلی فعال می‌شود.');
	}
	const now = nowSeconds();
	await run('UPDATE reseller_accounts SET telegram_bot_allowed = ?, updated_at = ? WHERE id = ?', [
		enabled ? 1 : 0,
		now,
		resellerId
	]);
	if (!enabled) {
		await run(
			`UPDATE reseller_telegram_bots SET status = 'disabled', updated_at = ? WHERE reseller_id = ?`,
			[now, resellerId]
		);
	}
}

export async function connectResellerTelegramBot(
	resellerId: number,
	token: string,
	origin: string
) {
	await ensureResellerTables();
	const account = await getResellerAccountById(resellerId);
	if (!account || account.is_active !== 1) throw new Error('حساب فروشنده فعال نیست.');
	if (account.parent_reseller_id !== null)
		throw new Error('زیرفروشنده نمی‌تواند بات تلگرام وصل کند.');
	if (account.telegram_bot_allowed !== 1)
		throw new Error('مجوز بات تلگرام برای این فروشنده فعال نیست.');
	if (!(await isFeatureEnabled('telegram_sales_bot')))
		throw new Error('قابلیت بات تلگرام غیرفعال است.');
	if (!hasTelegramTokenSecret()) {
		throw new Error('TELEGRAM_BOT_TOKEN_SECRET باید قبل از اتصال بات تنظیم شود.');
	}

	const cleanToken = token.trim();
	if (!/^\d+:[\w-]{20,}$/i.test(cleanToken)) throw new Error('توکن بات تلگرام نامعتبر است.');

	const settings = await getFeatureSettings();
	const identity = await getTelegramBotIdentity(cleanToken, settings.telegramBotSocksProxyUrl);
	const pathSecret = crypto.randomUUID().replace(/-/g, '');
	const webhookSecret = crypto.randomUUID().replace(/-/g, '');
	const webhookUrl = `${origin.replace(/\/+$/, '')}/api/telegram/${pathSecret}`;
	await setTelegramWebhook(
		cleanToken,
		webhookUrl,
		webhookSecret,
		settings.telegramBotSocksProxyUrl
	);
	const webhookInfo = await getTelegramWebhookInfo(cleanToken, settings.telegramBotSocksProxyUrl);
	const webhookError = webhookInfo.last_error_message ?? '';

	const now = nowSeconds();
	await run(
		`INSERT INTO reseller_telegram_bots (
			reseller_id, bot_id, username, display_name, token_encrypted, webhook_secret,
			webhook_path_secret, status, webhook_url, last_error, last_update_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL, ?, ?)
		ON CONFLICT(reseller_id) DO UPDATE SET
			bot_id = excluded.bot_id,
			username = excluded.username,
			display_name = excluded.display_name,
			token_encrypted = excluded.token_encrypted,
			webhook_secret = excluded.webhook_secret,
			webhook_path_secret = excluded.webhook_path_secret,
			status = 'active',
			webhook_url = excluded.webhook_url,
			last_error = excluded.last_error,
			updated_at = excluded.updated_at`,
		[
			resellerId,
			identity.id,
			identity.username,
			identity.displayName,
			encryptTelegramToken(cleanToken),
			webhookSecret,
			pathSecret,
			webhookUrl,
			webhookError,
			now,
			now
		]
	);

	return getResellerTelegramBot(resellerId);
}

export async function pauseResellerTelegramBot(resellerId: number, paused: boolean) {
	await ensureResellerTables();
	const now = nowSeconds();
	await run(
		`UPDATE reseller_telegram_bots
		 SET status = ?, updated_at = ?
		 WHERE reseller_id = ? AND status != 'disabled'`,
		[paused ? 'paused' : 'active', now, resellerId]
	);
}

export async function disconnectResellerTelegramBot(resellerId: number) {
	await ensureResellerTables();
	const row = await getTelegramBotRowByResellerId(resellerId);
	if (!row) return;
	try {
		const settings = await getFeatureSettings();
		await deleteTelegramWebhook(
			decryptTelegramToken(row.token_encrypted),
			settings.telegramBotSocksProxyUrl
		);
	} catch (error) {
		resellerLogger.warn('Failed to delete Telegram webhook while disconnecting bot.', {
			resellerId,
			error: error instanceof Error ? error : undefined
		});
	}
	await run('DELETE FROM reseller_telegram_bots WHERE reseller_id = ?', [resellerId]);
}

export async function syncResellerTelegramBotStatus(resellerId: number) {
	await ensureResellerTables();
	const row = await getTelegramBotRowByResellerId(resellerId);
	if (!row) throw new Error('بات تلگرام وصل نیست.');
	const settings = await getFeatureSettings();
	const info = await getTelegramWebhookInfo(
		decryptTelegramToken(row.token_encrypted),
		settings.telegramBotSocksProxyUrl
	);
	const issue =
		info.url !== row.webhook_url
			? 'وبهوک ثبت‌شده در تلگرام با آدرس ذخیره‌شده Skyline یکی نیست. بات را دوباره متصل کنید.'
			: (info.last_error_message ?? (row.status === 'error' ? (row.last_error ?? '') : ''));
	const nextStatus: TelegramBotStatus =
		row.status === 'paused' || row.status === 'disabled' ? row.status : issue ? 'error' : 'active';
	await run(
		`UPDATE reseller_telegram_bots
		 SET status = ?, last_error = ?, updated_at = ?
		 WHERE id = ?`,
		[nextStatus, issue.slice(0, 500), nowSeconds(), row.id]
	);
	return {
		...info,
		status: nextStatus,
		issue
	};
}

async function getDefaultTelegramInbound(account: ResellerAccountRow) {
	const inbound = (await getXuiInboundOptions()).find(
		(item) => item.enable && isInboundAllowedForAccount(account, item.id)
	);
	return inbound?.id ?? 0;
}

async function assertTelegramOrderLimits(
	quotaGb: number,
	durationDays: number,
	priceToman: number
) {
	const settings = await getFeatureSettings();
	if (quotaGb <= 0 || quotaGb > settings.telegramBotMaxCustomQuotaGb) {
		throw new Error(`حجم سفارش باید بین ۱ تا ${settings.telegramBotMaxCustomQuotaGb} گیگ باشد.`);
	}
	if (durationDays < 1 || durationDays > settings.telegramBotMaxCustomDurationDays) {
		throw new Error(
			`مدت سفارش باید بین ۱ تا ${settings.telegramBotMaxCustomDurationDays} روز باشد.`
		);
	}
	if (priceToman < settings.telegramBotMinCustomPriceToman) {
		throw new Error('قیمت سفارش از حداقل تعیین‌شده مدیر کمتر است.');
	}
}

export async function getTelegramWebhookContext(secret: string, secretToken: string | null) {
	const bot = await getTelegramBotRowByWebhookSecret(secret);
	if (!bot) {
		resellerLogger.warn('Rejected Telegram webhook with unknown path secret.');
		return null;
	}
	if (bot.webhook_secret !== secretToken) {
		const reason =
			'درخواست تلگرام رسید، اما هدر امنیتی X-Telegram-Bot-Api-Secret-Token حذف یا اشتباه بود. تنظیمات reverse proxy را بررسی کنید.';
		await run(
			`UPDATE reseller_telegram_bots SET status = 'error', last_error = ?, updated_at = ? WHERE id = ?`,
			[reason, nowSeconds(), bot.id]
		);
		resellerLogger.warn('Rejected Telegram webhook due to missing or invalid secret header.', {
			botId: bot.id,
			resellerId: bot.reseller_id,
			hasSecretToken: Boolean(secretToken)
		});
		return null;
	}
	const account = await getResellerAccountById(bot.reseller_id);
	if (!account || account.is_active !== 1 || account.telegram_bot_allowed !== 1) {
		resellerLogger.warn('Rejected Telegram webhook because reseller is inactive or not allowed.', {
			botId: bot.id,
			resellerId: bot.reseller_id
		});
		return null;
	}
	if (account.parent_reseller_id !== null) {
		resellerLogger.warn('Rejected Telegram webhook for sub-reseller account.', {
			botId: bot.id,
			resellerId: bot.reseller_id
		});
		return null;
	}
	if (!(await isFeatureEnabled('telegram_sales_bot'))) {
		resellerLogger.warn('Rejected Telegram webhook because feature flag is disabled.', {
			botId: bot.id,
			resellerId: bot.reseller_id
		});
		return null;
	}
	if (bot.status === 'paused' || bot.status === 'disabled') return null;
	return { bot, account, token: decryptTelegramToken(bot.token_encrypted) };
}

export async function touchTelegramBotUpdate(botId: number) {
	await ensureResellerTables();
	await run(
		`UPDATE reseller_telegram_bots SET status = 'active', last_update_at = ?, last_error = '', updated_at = ? WHERE id = ?`,
		[nowSeconds(), nowSeconds(), botId]
	);
}

export async function recordTelegramBotError(botId: number, message: string) {
	await ensureResellerTables();
	const detail = `خطای پردازش یا پاسخ‌دهی بات: ${message}`;
	await run(
		`UPDATE reseller_telegram_bots SET status = 'error', last_error = ?, updated_at = ? WHERE id = ?`,
		[detail.slice(0, 500), nowSeconds(), botId]
	);
}

export async function createTelegramBotOrderFromCommand(input: {
	resellerId: number;
	botId: number;
	telegramUserId: number;
	telegramUsername: string;
	customerName: string;
	quotaGb: number;
	durationDays: number;
	priceToman: number;
	customerNote?: string;
}) {
	await ensureResellerTables();
	const account = await getResellerAccountById(input.resellerId);
	if (!account) throw new Error('فروشنده پیدا نشد.');
	await assertTelegramOrderLimits(input.quotaGb, input.durationDays, input.priceToman);
	const inboundId = await getDefaultTelegramInbound(account);
	if (!inboundId) throw new Error('برای این فروشنده سرور مجاز فعال پیدا نشد.');
	const now = nowSeconds();
	await run(
		`INSERT INTO telegram_bot_orders (
			reseller_id, bot_id, telegram_user_id, telegram_username, customer_name,
			quota_gb, duration_days, price_toman, inbound_id, customer_note,
			status, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_receipt', ?, ?)`,
		[
			input.resellerId,
			input.botId,
			input.telegramUserId,
			input.telegramUsername.slice(0, 64),
			input.customerName.trim().slice(0, 64) || 'مشتری تلگرام',
			input.quotaGb,
			input.durationDays,
			input.priceToman,
			inboundId,
			input.customerNote?.trim().slice(0, 500) ?? '',
			now,
			now
		]
	);
	const row = await queryFirst<Row & { id: number }>('SELECT last_insert_rowid() AS id');
	return row ? getTelegramOrderById(row.id) : null;
}

export async function attachReceiptToLatestTelegramOrder(input: {
	resellerId: number;
	botId: number;
	telegramUserId: number;
	receiptText?: string;
	receiptFileId?: string;
}) {
	await ensureResellerTables();
	const order = await queryFirst<TelegramBotOrderRow>(
		`SELECT id, reseller_id, bot_id, telegram_user_id, telegram_username, customer_name,
		        quota_gb, duration_days, price_toman, inbound_id, receipt_text, receipt_file_id,
		        status, reseller_note, customer_note, xui_request_id, xui_client_uuid, config_url,
		        delivery_error, created_at, updated_at, reviewed_at, delivered_at
		 FROM telegram_bot_orders
		 WHERE reseller_id = ? AND bot_id = ? AND telegram_user_id = ? AND status = 'awaiting_receipt'
		 ORDER BY created_at DESC, id DESC LIMIT 1`,
		[input.resellerId, input.botId, input.telegramUserId]
	);
	if (!order) return null;
	await run(
		`UPDATE telegram_bot_orders
		 SET receipt_text = ?, receipt_file_id = ?, status = 'pending_review', updated_at = ?
		 WHERE id = ?`,
		[
			input.receiptText?.trim().slice(0, 1000) ?? '',
			input.receiptFileId?.trim().slice(0, 200) ?? '',
			nowSeconds(),
			order.id
		]
	);
	return getTelegramOrderById(order.id);
}

export async function reviewTelegramBotOrder(
	resellerId: number,
	orderId: number,
	action: 'approve' | 'reject' | 'retry',
	note: string,
	origin: string,
	fallbackHost?: string
) {
	await ensureResellerTables();
	const order = await getTelegramOrderById(orderId);
	if (!order || order.resellerId !== resellerId) throw new Error('سفارش پیدا نشد.');
	const botRow = await getTelegramBotRowByResellerId(resellerId);
	if (!botRow) throw new Error('بات تلگرام وصل نیست.');
	const settings = await getFeatureSettings();
	const token = decryptTelegramToken(botRow.token_encrypted);

	if (action === 'reject') {
		const now = nowSeconds();
		await run(
			`UPDATE telegram_bot_orders SET status = 'rejected', reseller_note = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`,
			[note.trim().slice(0, 500), now, now, order.id]
		);
		await sendTelegramMessage(
			token,
			order.telegramUserId,
			'سفارش شما توسط فروشنده رد شد.',
			settings.telegramBotSocksProxyUrl
		).catch(() => undefined);
		return;
	}

	if (action === 'approve' && order.status !== 'pending_review') {
		throw new Error('فقط سفارش‌های در انتظار بررسی قابل تایید هستند.');
	}
	if (action === 'retry' && order.status !== 'delivery_failed' && order.status !== 'approved') {
		throw new Error('ارسال دوباره فقط برای سفارش ساخته‌شده امکان‌پذیر است.');
	}

	let configUrl = order.configUrl;
	let uuid = order.xuiClientUuid;
	let requestId = order.xuiRequestId;

	if (action === 'approve') {
		const created = await createCustomResellerRequest(
			resellerId,
			{
				inboundId: order.inboundId,
				quotaGb: order.quotaGb,
				durationDays: order.durationDays,
				priceToman: order.priceToman
			},
			order.customerName,
			`Telegram order #${order.id}${note.trim() ? ` - ${note.trim()}` : ''}`,
			origin,
			fallbackHost
		);
		configUrl = created.configUrl;
		uuid = created.xuiClientUuid;
		requestId = created.id;
		const now = nowSeconds();
		await run(
			`UPDATE telegram_bot_orders
			 SET status = 'approved', reseller_note = ?, xui_request_id = ?, xui_client_uuid = ?,
			     config_url = ?, reviewed_at = ?, updated_at = ?, delivery_error = ''
			 WHERE id = ?`,
			[note.trim().slice(0, 500), requestId, uuid, configUrl, now, now, order.id]
		);
	}

	const userPageUrl = uuid ? `${origin.replace(/\/+$/, '')}/user/${uuid}` : '';
	const message = [
		'سفارش شما تایید و کانفیگ ساخته شد.',
		configUrl ? `<code>${configUrl}</code>` : '',
		userPageUrl ? `پنل کاربر: ${userPageUrl}` : ''
	]
		.filter(Boolean)
		.join('\n\n');

	try {
		await sendTelegramMessage(
			token,
			order.telegramUserId,
			message,
			settings.telegramBotSocksProxyUrl
		);
		await run(
			`UPDATE telegram_bot_orders SET status = 'approved', delivered_at = ?, delivery_error = '', updated_at = ? WHERE id = ?`,
			[nowSeconds(), nowSeconds(), order.id]
		);
	} catch (error) {
		await run(
			`UPDATE telegram_bot_orders SET status = 'delivery_failed', delivery_error = ?, updated_at = ? WHERE id = ?`,
			[
				error instanceof Error ? error.message.slice(0, 500) : 'ارسال تلگرام ناموفق بود.',
				nowSeconds(),
				order.id
			]
		);
	}
}

export async function createResellerPlan(input: {
	quotaGb: number;
	durationDays: number;
	priceToman: number;
	inboundId: number;
}) {
	await ensureResellerTables();
	const inbound = (await getXuiInboundOptions()).find((item) => item.id === input.inboundId);

	if (!inbound) {
		throw new Error('ورودی انتخاب‌شده در 3x-ui پیدا نشد.');
	}

	const now = nowSeconds();
	await run(
		`
		INSERT INTO reseller_plans (
			quota_gb,
			duration_days,
			price_toman,
			inbound_id,
			inbound_remark_snapshot,
			is_active,
			created_at,
			updated_at
		)
		VALUES (?, ?, ?, ?, ?, 1, ?, ?)
	`,
		[input.quotaGb, input.durationDays, input.priceToman, input.inboundId, inbound.remark, now, now]
	);
}

export async function updateResellerPlan(
	id: number,
	input: {
		quotaGb: number;
		durationDays: number;
		priceToman: number;
		inboundId: number;
	}
) {
	await ensureResellerTables();
	const inbound = (await getXuiInboundOptions()).find((item) => item.id === input.inboundId);

	if (!inbound) {
		throw new Error('ورودی انتخاب‌شده در 3x-ui پیدا نشد.');
	}

	const now = nowSeconds();
	await run(
		`
		UPDATE reseller_plans
		SET
			quota_gb = ?,
			duration_days = ?,
			price_toman = ?,
			inbound_id = ?,
			inbound_remark_snapshot = ?,
			updated_at = ?
		WHERE id = ?
	`,
		[input.quotaGb, input.durationDays, input.priceToman, input.inboundId, inbound.remark, now, id]
	);
}

export async function setResellerPlanActive(id: number, isActive: boolean) {
	await ensureResellerTables();
	const now = nowSeconds();
	await run(
		`
		UPDATE reseller_plans
		SET is_active = ?, updated_at = ?
		WHERE id = ?
	`,
		[isActive ? 1 : 0, now, id]
	);
}

export async function getAdminResellerOverview() {
	await ensureResellerTables();
	const [
		accountRows,
		requestRows,
		paymentRows,
		chargeRows,
		gbLedgerRows,
		creditRequestRows,
		sessionRows,
		groupRows,
		telegramBotRows
	] = await Promise.all([
		queryAll<ResellerAccountRow>(
			`
			SELECT
				id,
				username,
				username_normalized,
				password_hash,
				is_active,
				email,
				must_change_password,
				allowed_inbound_ids,
				custom_message,
				debt_cap_toman,
				parent_reseller_id,
				can_manage_sub_resellers,
				COALESCE(sub_reseller_limit, 10) AS sub_reseller_limit,
				COALESCE(group_id, NULL) AS group_id,
				COALESCE(client_tickets_enabled, 0) AS client_tickets_enabled,
				COALESCE(telegram_bot_allowed, 0) AS telegram_bot_allowed,
				COALESCE(payment_card_number, '') AS payment_card_number,
				COALESCE(payment_card_owner_name, '') AS payment_card_owner_name,
				COALESCE(is_system_manager, 0) AS is_system_manager,
				created_at,
				updated_at
			FROM reseller_accounts
			WHERE COALESCE(is_system_manager, 0) = 0
			ORDER BY is_active DESC, username COLLATE NOCASE ASC
		`
		),
		queryAll<ResellerRequestRow>(
			`
			SELECT
				id,
				reseller_id,
				plan_id,
				template_id,
				customer_label,
				internal_note,
				xui_email,
				xui_client_uuid,
				xui_inbound_id,
				quota_gb_snapshot,
				duration_days_snapshot,
				price_toman_snapshot,
				created_at,
				revoked_at,
				settled_amount_toman,
				settled_payment_id
			FROM reseller_requests
			ORDER BY created_at DESC, id DESC
		`
		),
		queryAll<ResellerPaymentRow>(
			`
			SELECT id, reseller_id, amount_toman, created_at
			FROM reseller_payments
			ORDER BY created_at DESC, id DESC
		`
		),
		queryAll<ResellerChargeRow>(
			`
			SELECT
				id,
				reseller_id,
				request_id,
				type,
				amount_toman,
				settled_amount_toman,
				reversed_amount_toman,
				reversed_at,
				created_at
			FROM reseller_charges
			ORDER BY created_at DESC, id DESC
		`
		),
		queryAll<ResellerGbLedgerRow>(
			`
			SELECT id, reseller_id, request_id, credit_request_id, type, amount_gb, created_at
			FROM reseller_gb_ledger
			ORDER BY created_at DESC, id DESC
		`
		),
		queryAll<ResellerCreditRequestRow>(
			`
			SELECT
				reseller_credit_requests.id,
				reseller_credit_requests.reseller_id,
				reseller_accounts.username AS reseller_username,
				reseller_credit_requests.package_id,
				reseller_credit_requests.quota_gb_snapshot,
				reseller_credit_requests.price_toman_snapshot,
				reseller_credit_requests.receipt_text,
				reseller_credit_requests.receipt_file_name,
				reseller_credit_requests.receipt_mime_type,
				reseller_credit_requests.receipt_data_base64,
				reseller_credit_requests.receipt_size_bytes,
				reseller_credit_requests.status,
				reseller_credit_requests.manager_note,
				reseller_credit_requests.created_at,
				reseller_credit_requests.reviewed_at
			FROM reseller_credit_requests
			LEFT JOIN reseller_accounts ON reseller_accounts.id = reseller_credit_requests.reseller_id
			ORDER BY reseller_credit_requests.created_at DESC, reseller_credit_requests.id DESC
		`
		),
		queryAll<ResellerSessionRow>(
			`
			SELECT id, token_hash, reseller_id, expires_at, created_at, last_used_at, user_agent
			FROM reseller_sessions
		`
		),
		queryAll<ResellerGroupRow>(
			`SELECT id, name, color, badge_icon, description, created_at, updated_at FROM reseller_groups ORDER BY name ASC`
		),
		queryAll<ResellerTelegramBotRow>(
			`SELECT id, reseller_id, bot_id, username, display_name, token_encrypted, webhook_secret,
			        webhook_path_secret, status, webhook_url, last_error, last_update_at, created_at, updated_at
			 FROM reseller_telegram_bots`
		)
	]);

	return accountRows.map<ResellerAccountSummary>((account) => {
		const requests = requestRows
			.filter((request) => request.reseller_id === account.id)
			.map(mapRequestRow);
		const payments = paymentRows
			.filter((payment) => payment.reseller_id === account.id)
			.map(mapPaymentRow);
		const charges = chargeRows
			.filter((charge) => charge.reseller_id === account.id)
			.map(mapChargeRow);
		const gbLedger = gbLedgerRows
			.filter((entry) => entry.reseller_id === account.id)
			.map(mapGbLedgerRow);
		const creditRequests = creditRequestRows
			.filter((request) => request.reseller_id === account.id)
			.map(mapCreditRequestRow);
		const hasSession = sessionRows.some((session) => session.reseller_id === account.id);
		const sessions = sessionRows
			.filter((session) => session.reseller_id === account.id)
			.map((session) => ({
				id: session.id,
				createdAt: session.created_at,
				lastUsedAt: session.last_used_at,
				expiresAt: session.expires_at,
				userAgent: session.user_agent
			}));
		const telegramBotRow = telegramBotRows.find((bot) => bot.reseller_id === account.id) ?? null;
		let deleteBlockedReason: string | null = null;
		if (requests.length > 0) deleteBlockedReason = 'این فروشنده کانفیگ ثبت‌شده دارد.';
		else if (creditRequests.length > 0) deleteBlockedReason = 'این فروشنده درخواست شارژ دارد.';
		else if (gbLedger.length > 0) deleteBlockedReason = 'این فروشنده دفتر اعتبار گیگابایت دارد.';
		else if (payments.length > 0) deleteBlockedReason = 'این فروشنده سابقه پرداخت دارد.';
		else if (charges.length > 0) deleteBlockedReason = 'این فروشنده رویداد مالی دارد.';
		else if (hasSession) deleteBlockedReason = 'این فروشنده نشست فعال دارد.';

		const groupRow = groupRows.find((g) => g.id === account.group_id) ?? null;
		return {
			id: account.id,
			username: account.username,
			email: account.email ?? '',
			mustChangePassword: account.must_change_password === 1,
			allowedInboundIds: parseAllowedInboundIds(account.allowed_inbound_ids),
			isActive: account.is_active === 1,
			customMessage: account.custom_message ?? '',
			debtCapToman: account.debt_cap_toman ?? null,
			parentResellerId: account.parent_reseller_id ?? null,
			canManageSubResellers: account.can_manage_sub_resellers === 1,
			subResellerLimit: account.sub_reseller_limit ?? 10,
			groupId: account.group_id ?? null,
			groupName: groupRow?.name ?? null,
			groupColor: groupRow?.color ?? null,
			groupBadgeIcon: groupRow?.badge_icon ?? null,
			clientTicketsEnabled: account.client_tickets_enabled === 1,
			telegramBotAllowed: account.telegram_bot_allowed === 1,
			telegramBot: telegramBotRow ? mapTelegramBotRow(telegramBotRow) : null,
			isSystemManager: account.is_system_manager === 1,
			createdAt: account.created_at,
			updatedAt: account.updated_at,
			stats: buildResellerStats(
				requests,
				payments,
				account.debt_cap_toman ?? null,
				charges,
				gbLedger
			),
			payments,
			charges,
			gbLedger,
			creditRequests,
			sessions,
			canDelete: deleteBlockedReason === null,
			deleteBlockedReason
		};
	});
}

export function buildAdminFinancialReport(
	resellers: ResellerAccountSummary[]
): ResellerFinancialReport {
	return {
		totalOutstandingToman: resellers.reduce(
			(total, reseller) => total + reseller.stats.walletBalanceToman,
			0
		),
		totalPaidToman: resellers.reduce((total, reseller) => total + reseller.stats.totalPaidToman, 0),
		totalGrossSalesToman: resellers.reduce(
			(total, reseller) => total + reseller.stats.grossSalesToman,
			0
		),
		totalRevokedValueToman: resellers.reduce(
			(total, reseller) => total + reseller.stats.revokedValueToman,
			0
		),
		totalActiveRequests: resellers.reduce(
			(total, reseller) => total + reseller.stats.activeRequests,
			0
		),
		totalRevokedRequests: resellers.reduce(
			(total, reseller) => total + reseller.stats.revokedRequests,
			0
		),
		blockedResellers: resellers.filter((reseller) => reseller.stats.walletBalanceToman <= 0).length,
		cappedResellers: resellers.filter((reseller) => reseller.stats.debtCapToman !== null).length,
		totalRemainingCapToman: resellers.reduce(
			(total, reseller) => total + reseller.stats.walletBalanceToman,
			0
		),
		totalGbBalance: resellers.reduce((total, reseller) => total + reseller.stats.gbBalance, 0),
		totalGbSold: resellers.reduce((total, reseller) => total + reseller.stats.totalGbSold, 0),
		pendingCreditRequests: resellers.reduce(
			(total, reseller) =>
				total + reseller.creditRequests.filter((request) => request.status === 'pending').length,
			0
		)
	};
}

export async function authenticateReseller(username: string, password: string) {
	const account = await getResellerAccountByUsername(username);

	if (!account || account.is_active !== 1 || account.is_system_manager === 1) {
		return null;
	}

	const valid = await verifySecret(password, account.password_hash);

	if (!valid) {
		return null;
	}

	return account;
}

export async function createResellerSession(cookies: Cookies, resellerId: number, userAgent = '') {
	await ensureResellerTables();
	await purgeExpiredSessions();
	const token = crypto.randomUUID();
	const createdAt = nowSeconds();
	const expiresAt = createdAt + resellerSessionLifetimeSeconds;
	await run(
		'INSERT INTO reseller_sessions (token_hash, reseller_id, expires_at, created_at, last_used_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
		[
			createSessionTokenHash(token),
			resellerId,
			expiresAt,
			createdAt,
			createdAt,
			userAgent.slice(0, 255)
		]
	);
	setResellerSessionCookie(cookies, token);
}

export async function destroyResellerSession(cookies: Cookies) {
	await ensureResellerTables();
	const token = cookies.get(resellerSessionCookieName);

	if (token) {
		await run('DELETE FROM reseller_sessions WHERE token_hash = ?', [
			createSessionTokenHash(token)
		]);
	}

	cookies.delete(resellerSessionCookieName, { path: '/' });
}

export async function getAuthenticatedReseller(
	cookies: Cookies,
	options?: { refreshCookie?: boolean; mutateCookies?: boolean }
) {
	await ensureResellerTables();
	await purgeExpiredSessions();
	const token = cookies.get(resellerSessionCookieName);

	if (!token) {
		return null;
	}

	const session = await queryFirst<ResellerSessionRow>(
		`
		SELECT id, token_hash, reseller_id, expires_at, created_at, last_used_at, user_agent
		FROM reseller_sessions
		WHERE token_hash = ?
		LIMIT 1
	`,
		[createSessionTokenHash(token)]
	);

	if (!session) {
		if (options?.mutateCookies) {
			cookies.delete(resellerSessionCookieName, { path: '/' });
		}

		return null;
	}

	if (session.expires_at <= nowSeconds()) {
		await run('DELETE FROM reseller_sessions WHERE id = ?', [session.id]);

		if (options?.mutateCookies) {
			cookies.delete(resellerSessionCookieName, { path: '/' });
		}

		return null;
	}

	const account = await getResellerAccountById(session.reseller_id);

	if (!account || account.is_active !== 1) {
		await run('DELETE FROM reseller_sessions WHERE id = ?', [session.id]);

		if (options?.mutateCookies) {
			cookies.delete(resellerSessionCookieName, { path: '/' });
		}

		return null;
	}

	if (options?.refreshCookie && options?.mutateCookies) {
		await run('UPDATE reseller_sessions SET last_used_at = ? WHERE id = ?', [
			nowSeconds(),
			session.id
		]);
		setResellerSessionCookie(cookies, token);
	}

	return account;
}

export async function getResellerSessions(resellerId: number, cookies: Cookies | null) {
	await ensureResellerTables();
	await purgeExpiredSessions();
	const token = cookies?.get(resellerSessionCookieName);
	const tokenHash = token ? createSessionTokenHash(token) : null;
	const rows = await queryAll<ResellerSessionRow>(
		`SELECT id, token_hash, reseller_id, expires_at, created_at, last_used_at, user_agent
		 FROM reseller_sessions WHERE reseller_id = ? ORDER BY last_used_at DESC, id DESC`,
		[resellerId]
	);
	return rows.map((row) => ({
		id: row.id,
		createdAt: row.created_at,
		lastUsedAt: row.last_used_at,
		expiresAt: row.expires_at,
		userAgent: row.user_agent,
		isCurrent: tokenHash === row.token_hash
	}));
}

export async function revokeOwnResellerSession(resellerId: number, sessionId: number) {
	await ensureResellerTables();
	await run('DELETE FROM reseller_sessions WHERE id = ? AND reseller_id = ?', [
		sessionId,
		resellerId
	]);
}

export async function getResellerDashboardState(
	cookies: Cookies,
	origin: string,
	fallbackHost?: string
): Promise<ResellerDashboardState> {
	const account = await getAuthenticatedReseller(cookies);

	if (!account) {
		return {
			authenticated: false,
			isSubReseller: false,
			canManageSubResellers: false,
			parentResellerId: null,
			reseller: {
				id: 0,
				username: '',
				email: '',
				mustChangePassword: false,
				allowedInboundIds: null,
				customMessage: '',
				managerMessage: '',
				debtCapToman: null,
				clientTicketsEnabled: false,
				telegramBotAllowed: false,
				paymentCard: { cardNumber: '', cardOwnerName: '' },
				subResellerLimit: 10,
				group: null
			},
			stats: {
				gbBalance: 0,
				totalGbAdded: 0,
				totalGbSold: 0,
				totalGbRefunded: 0,
				walletBalanceToman: 0,
				totalSpentToman: 0,
				currentDebtToman: 0,
				debtCapToman: null,
				remainingCapToman: null,
				totalPaidToman: 0,
				grossSalesToman: 0,
				revokedValueToman: 0,
				unpaidRequests: 0,
				totalRequests: 0,
				activeRequests: 0,
				revokedRequests: 0,
				settledRequests: 0,
				lastPaymentAt: null
			},
			dailySummary: {
				createdToday: 0,
				rechargedToday: 0,
				revokedToday: 0,
				debtAddedTodayToman: 0,
				gbSoldToday: 0
			},
			paymentCard: { cardNumber: '', cardOwnerName: '' },
			salesEnabled: false,
			availableInbounds: [],
			templates: [],
			creditPackages: [],
			creditRequests: [],
			gbLedger: [],
			payments: [],
			charges: [],
			tickets: [],
			plans: [],
			requests: [],
			lastCreatedRequest: null,
			subResellers: [],
			subPackages: [],
			subCreditRequests: [],
			subResellerTickets: [],
			clientTickets: [],
			telegramBotFeatureEnabled: false,
			telegramBotAllowed: false,
			telegramBot: null,
			telegramOrders: [],
			sessions: []
		};
	}

	return buildResellerDashboard(account, origin, fallbackHost, cookies);
}

export async function updateResellerPassword(
	resellerId: number,
	currentPassword: string,
	nextPassword: string,
	email?: string
) {
	const account = await getResellerAccountById(resellerId);

	if (!account) {
		throw new Error('حساب فروشنده پیدا نشد.');
	}

	const valid = await verifySecret(currentPassword, account.password_hash);

	if (!valid) {
		throw new Error('گذرواژه فعلی نادرست است.');
	}

	await run(
		`
		UPDATE reseller_accounts
		SET password_hash = ?,
			email = COALESCE(?, email),
			must_change_password = 0,
			updated_at = ?
		WHERE id = ?
	`,
		[
			await hashSecret(nextPassword),
			email === undefined ? null : normalizeOptionalEmail(email),
			nowSeconds(),
			resellerId
		]
	);
}

export async function updateResellerProfile(resellerId: number, email: string) {
	await ensureResellerTables();
	await run('UPDATE reseller_accounts SET email = ?, updated_at = ? WHERE id = ?', [
		normalizeOptionalEmail(email),
		nowSeconds(),
		resellerId
	]);
}

export async function updateResellerPaymentCard(
	resellerId: number,
	input: { cardNumber: string; cardOwnerName: string }
) {
	await ensureResellerTables();
	const account = await getResellerAccountById(resellerId);
	if (!account || account.parent_reseller_id !== null || account.can_manage_sub_resellers !== 1) {
		throw new Error('فقط فروشنده والد می‌تواند کارت پرداخت زیرفروشندگان را تنظیم کند.');
	}
	const normalized = normalizePaymentCardInput(input);
	await run(
		'UPDATE reseller_accounts SET payment_card_number = ?, payment_card_owner_name = ?, updated_at = ? WHERE id = ?',
		[normalized.cardNumber, normalized.cardOwnerName, nowSeconds(), resellerId]
	);
}

export async function updateResellerUsername(id: number, username: string) {
	await ensureResellerTables();
	const normalizedUsername = normalizeUsername(username);

	if (!normalizedUsername) {
		throw new Error('نام کاربری نامعتبر است.');
	}

	try {
		await run(
			`
			UPDATE reseller_accounts
			SET username = ?,
				username_normalized = ?,
				updated_at = ?
			WHERE id = ?
		`,
			[username.trim(), normalizedUsername, nowSeconds(), id]
		);
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			throw new Error('این نام کاربری قبلاً ثبت شده است.');
		}
		throw error;
	}
}

export async function resetResellerPasswordToDefault(id: number) {
	await ensureResellerTables();
	const newPassword = randomBytes(5).toString('hex');
	await run(
		`
		UPDATE reseller_accounts
		SET password_hash = ?,
			must_change_password = 1,
			updated_at = ?
		WHERE id = ?
	`,
		[await hashSecret(newPassword), nowSeconds(), id]
	);
	return newPassword;
}

export async function createResellerRequest(
	resellerId: number,
	planId: number,
	customerLabel: string,
	internalNote: string,
	origin: string,
	fallbackHost?: string
) {
	await ensureResellerTables();
	const account = await getResellerAccountById(resellerId);

	if (!account || account.is_active !== 1) {
		throw new Error('حساب فروشنده فعال نیست.');
	}

	if (account.must_change_password === 1) {
		throw new Error('قبل از فروش، گذرواژه موقت حساب را تغییر دهید.');
	}

	if (!(await isFeatureEnabled('reseller_sales'))) {
		throw new Error('فروش توسط مدیر متوقف شده است.');
	}

	const plan = await getResellerPlanById(planId);

	if (!plan || !plan.isActive) {
		throw new Error('پلن انتخاب‌شده در دسترس نیست.');
	}

	if (!isInboundAllowedForAccount(account, plan.inboundId)) {
		resellerLogger.warn('Blocked reseller create because inbound is not allowed.', {
			resellerId,
			planId,
			inboundId: plan.inboundId
		});
		throw new Error('دسترسی شما به این سرور توسط مدیر محدود شده است.');
	}

	const normalizedLabel = normalizeCustomerLabel(customerLabel);
	const displayLabel = normalizedLabel || 'مشتری بدون نام';

	const gbBalance = buildResellerStats(
		await getResellerRequestsByResellerId(resellerId),
		await getResellerPaymentsByResellerId(resellerId),
		account.debt_cap_toman ?? null,
		await getResellerChargesByResellerId(resellerId),
		await getResellerGbLedgerByResellerId(resellerId)
	).gbBalance;

	if (gbBalance < plan.quotaGb) {
		throw new Error(
			'اعتبار گیگابایت شما کافی نیست. ابتدا یک بسته شارژ بخرید و منتظر تایید مدیر بمانید.'
		);
	}

	const uuid = crypto.randomUUID();
	const xuiEmail = buildUniqueXuiEmail(normalizedLabel);
	const expiresAtMs = Date.now() + plan.durationDays * 24 * 60 * 60 * 1000;

	await createVpnClient({
		inboundId: plan.inboundId,
		uuid,
		email: xuiEmail,
		totalBytes: Math.round(plan.quotaGb * 1024 ** 3),
		expiryTime: expiresAtMs,
		enable: true
	});

	try {
		const liveUsageMap = await getVpnClientUsageMap(fallbackHost, {
			includeOnlineStatus: true
		});
		const liveUsage = liveUsageMap.get(uuid);

		if (!liveUsage) {
			throw new Error('کانفیگ در 3x-ui ساخته شد اما بازیابی جزئیات آن انجام نشد.');
		}

		const now = nowSeconds();
		await run(
			`
			INSERT INTO reseller_requests (
				reseller_id,
				plan_id,
				template_id,
				customer_label,
				internal_note,
				xui_email,
				xui_client_uuid,
				xui_inbound_id,
				quota_gb_snapshot,
				duration_days_snapshot,
				price_toman_snapshot,
				created_at,
				revoked_at,
				settled_amount_toman,
				settled_payment_id
			)
			VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL)
		`,
			[
				resellerId,
				plan.id,
				displayLabel,
				internalNote.trim().slice(0, 500),
				xuiEmail,
				uuid,
				plan.inboundId,
				plan.quotaGb,
				plan.durationDays,
				plan.priceToman,
				now
			]
		);

		const row = await queryFirst<Row & { id: number }>('SELECT last_insert_rowid() AS id');
		const saved = row ? await getRequestById(row.id) : null;

		if (!saved) {
			throw new Error('در ذخیره اطلاعات درخواست فروشنده مشکل پیش آمد.');
		}

		await insertResellerCharge({
			resellerId,
			requestId: saved.id,
			type: 'create',
			amountToman: 0,
			createdAt: now
		});
		await insertGbLedger({
			resellerId,
			requestId: saved.id,
			type: 'create',
			amountGb: -plan.quotaGb,
			createdAt: now
		});

		const charges = await getResellerChargesByResellerId(resellerId);

		return buildRequestView(
			saved,
			origin,
			liveUsageMap,
			account.username,
			charges,
			await getResellerPlans()
		);
	} catch (error) {
		try {
			await deleteVpnClient(xuiEmail);
			await run(
				'DELETE FROM reseller_charges WHERE reseller_id = ? AND request_id IN (SELECT id FROM reseller_requests WHERE xui_client_uuid = ?)',
				[resellerId, uuid]
			);
			await run(
				'DELETE FROM reseller_gb_ledger WHERE reseller_id = ? AND request_id IN (SELECT id FROM reseller_requests WHERE xui_client_uuid = ?)',
				[resellerId, uuid]
			);
			await run('DELETE FROM reseller_requests WHERE reseller_id = ? AND xui_client_uuid = ?', [
				resellerId,
				uuid
			]);
		} catch (cleanupError) {
			resellerLogger.error('Failed to clean up reseller x-ui client after local create failure.', {
				uuid,
				inboundId: plan.inboundId,
				error: cleanupError instanceof Error ? cleanupError : undefined
			});
		}

		throw error;
	}
}

export async function createCustomResellerRequest(
	resellerId: number,
	input: {
		quotaGb: number;
		durationDays: number;
		priceToman: number;
		inboundId: number;
		templateId?: number | null;
	},
	customerLabel: string,
	internalNote: string,
	origin: string,
	fallbackHost?: string
) {
	await ensureResellerTables();
	const account = await getResellerAccountById(resellerId);

	if (!account || account.is_active !== 1) {
		throw new Error('حساب فروشنده فعال نیست.');
	}

	if (account.must_change_password === 1) {
		throw new Error('قبل از فروش، گذرواژه موقت حساب را تغییر دهید.');
	}

	if (!(await isFeatureEnabled('reseller_sales'))) {
		throw new Error('فروش توسط مدیر متوقف شده است.');
	}

	const inbound = (await getXuiInboundOptions()).find(
		(item) => item.id === input.inboundId && item.enable
	);

	if (!inbound) {
		throw new Error('سرور انتخاب‌شده در دسترس نیست.');
	}

	if (!isInboundAllowedForAccount(account, input.inboundId)) {
		throw new Error('دسترسی شما به این سرور توسط مدیر محدود شده است.');
	}

	const selectedTemplate = input.templateId
		? await getResellerConfigTemplateById(resellerId, input.templateId)
		: null;

	if (input.templateId && !selectedTemplate) {
		throw new Error('قالب انتخاب‌شده پیدا نشد.');
	}

	const templateValues = selectedTemplate
		? {
				quotaGb: selectedTemplate.quotaGb,
				durationDays: selectedTemplate.durationDays,
				priceToman: selectedTemplate.priceToman
			}
		: validateTemplateValues(input);

	const normalizedQuotaGb = templateValues.quotaGb;
	const normalizedDurationDays = templateValues.durationDays;
	const normalizedPriceToman = templateValues.priceToman;
	const normalizedLabel = normalizeCustomerLabel(customerLabel);
	const displayLabel = normalizedLabel || 'مشتری بدون نام';
	const gbBalance = buildResellerStats(
		await getResellerRequestsByResellerId(resellerId),
		await getResellerPaymentsByResellerId(resellerId),
		account.debt_cap_toman ?? null,
		await getResellerChargesByResellerId(resellerId),
		await getResellerGbLedgerByResellerId(resellerId)
	).gbBalance;

	if (gbBalance < normalizedQuotaGb) {
		throw new Error(
			'اعتبار گیگابایت شما کافی نیست. ابتدا یک بسته شارژ بخرید و منتظر تایید مدیر بمانید.'
		);
	}

	const uuid = crypto.randomUUID();
	const xuiEmail = buildUniqueXuiEmail(normalizedLabel);
	const expiresAtMs = Date.now() + normalizedDurationDays * 24 * 60 * 60 * 1000;

	await createVpnClient({
		inboundId: input.inboundId,
		uuid,
		email: xuiEmail,
		totalBytes: Math.round(normalizedQuotaGb * 1024 ** 3),
		expiryTime: expiresAtMs,
		enable: true
	});

	try {
		const liveUsageMap = await getVpnClientUsageMap(fallbackHost, {
			includeOnlineStatus: true
		});
		const liveUsage = liveUsageMap.get(uuid);

		if (!liveUsage) {
			throw new Error('کانفیگ در 3x-ui ساخته شد اما بازیابی جزئیات آن انجام نشد.');
		}

		const now = nowSeconds();
		await run(
			`
			INSERT INTO reseller_requests (
				reseller_id,
				plan_id,
				template_id,
				customer_label,
				internal_note,
				xui_email,
				xui_client_uuid,
				xui_inbound_id,
				quota_gb_snapshot,
				duration_days_snapshot,
				price_toman_snapshot,
				created_at,
				revoked_at,
				settled_amount_toman,
				settled_payment_id
			)
			VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL)
		`,
			[
				resellerId,
				selectedTemplate?.id ?? null,
				displayLabel,
				internalNote.trim().slice(0, 500),
				xuiEmail,
				uuid,
				input.inboundId,
				normalizedQuotaGb,
				normalizedDurationDays,
				normalizedPriceToman,
				now
			]
		);

		const row = await queryFirst<Row & { id: number }>('SELECT last_insert_rowid() AS id');
		const saved = row ? await getRequestById(row.id) : null;

		if (!saved) {
			throw new Error('در ذخیره اطلاعات درخواست فروشنده مشکل پیش آمد.');
		}

		await insertResellerCharge({
			resellerId,
			requestId: saved.id,
			type: 'create',
			amountToman: 0,
			createdAt: now
		});
		await insertGbLedger({
			resellerId,
			requestId: saved.id,
			type: 'create',
			amountGb: -normalizedQuotaGb,
			createdAt: now
		});

		return buildRequestView(
			saved,
			origin,
			liveUsageMap,
			account.username,
			await getResellerChargesByResellerId(resellerId),
			await getResellerPlans()
		);
	} catch (error) {
		try {
			await deleteVpnClient(xuiEmail);
			await run(
				'DELETE FROM reseller_charges WHERE reseller_id = ? AND request_id IN (SELECT id FROM reseller_requests WHERE xui_client_uuid = ?)',
				[resellerId, uuid]
			);
			await run(
				'DELETE FROM reseller_gb_ledger WHERE reseller_id = ? AND request_id IN (SELECT id FROM reseller_requests WHERE xui_client_uuid = ?)',
				[resellerId, uuid]
			);
			await run('DELETE FROM reseller_requests WHERE reseller_id = ? AND xui_client_uuid = ?', [
				resellerId,
				uuid
			]);
		} catch (cleanupError) {
			resellerLogger.error(
				'Failed to clean up custom reseller x-ui client after local create failure.',
				{
					uuid,
					inboundId: input.inboundId,
					error: cleanupError instanceof Error ? cleanupError : undefined
				}
			);
		}

		throw error;
	}
}

async function getOrCreateManagerSystemAccount() {
	await ensureResellerTables();
	const existing = await queryFirst<ResellerAccountRow>(
		`SELECT id, username, username_normalized, password_hash, is_active, email,
		 must_change_password, allowed_inbound_ids, custom_message, debt_cap_toman,
		 parent_reseller_id, can_manage_sub_resellers, COALESCE(sub_reseller_limit, 10) AS sub_reseller_limit,
		 COALESCE(group_id, NULL) AS group_id,
		 COALESCE(client_tickets_enabled, 0) AS client_tickets_enabled,
		 COALESCE(telegram_bot_allowed, 0) AS telegram_bot_allowed,
		 COALESCE(payment_card_number, '') AS payment_card_number,
		 COALESCE(payment_card_owner_name, '') AS payment_card_owner_name,
		 COALESCE(is_system_manager, 0) AS is_system_manager, created_at, updated_at
		 FROM reseller_accounts WHERE COALESCE(is_system_manager, 0) = 1 LIMIT 1`
	);
	if (existing) return existing;

	const now = nowSeconds();
	const passwordHash = await hashSecret(randomBytes(32).toString('hex'));
	await run(
		`INSERT INTO reseller_accounts (
			username, username_normalized, password_hash, is_active, email,
			must_change_password, allowed_inbound_ids, custom_message, debt_cap_toman,
			parent_reseller_id, can_manage_sub_resellers, client_tickets_enabled,
			sub_reseller_limit, is_system_manager, created_at, updated_at
		) VALUES (?, ?, ?, 1, '', 0, '', '', NULL, NULL, 0, 0, 10, 1, ?, ?)`,
		['__manager__', '__manager__', passwordHash, now, now]
	);
	const created = await queryFirst<Row & { id: number }>('SELECT last_insert_rowid() AS id');
	if (!created) throw new Error('ساخت حساب داخلی مدیر انجام نشد.');
	const account = await getResellerAccountById(created.id);
	if (!account) throw new Error('حساب داخلی مدیر پیدا نشد.');
	return account;
}

export async function getManagerConfigViews(origin: string, fallbackHost?: string) {
	const manager = await getOrCreateManagerSystemAccount();
	const [requests, charges, plans, liveUsageMap] = await Promise.all([
		getResellerRequestsByResellerId(manager.id),
		getResellerChargesByResellerId(manager.id),
		getResellerPlans(),
		getVpnClientUsageMap(fallbackHost, { includeOnlineStatus: true })
	]);
	return requests.map((request) =>
		buildRequestView(request, origin, liveUsageMap, null, charges, plans)
	);
}

export async function getManagerConfigTemplates() {
	const manager = await getOrCreateManagerSystemAccount();
	return getResellerConfigTemplatesByResellerId(manager.id);
}

export async function createManagerConfigTemplate(input: {
	name?: string;
	quotaGb: number;
	durationDays: number;
	priceToman: number;
}) {
	const manager = await getOrCreateManagerSystemAccount();
	await createResellerConfigTemplate(manager.id, input);
}

export async function deleteManagerConfigTemplate(templateId: number) {
	const manager = await getOrCreateManagerSystemAccount();
	await deleteResellerConfigTemplate(manager.id, templateId);
}

export async function revokeManagerConfig(requestId: number, fallbackHost?: string) {
	const manager = await getOrCreateManagerSystemAccount();
	await revokeResellerRequest(manager.id, requestId, fallbackHost);
}

/**
 * Create a VPN config directly for the manager's internal seller account.
 */
export async function createAdminVpnConfig(
	input: {
		inboundId: number;
		quotaGb: number;
		durationDays: number;
		priceToman: number;
		templateId?: number | null;
		customerLabel: string;
		internalNote?: string;
	},
	origin: string,
	fallbackHost?: string
) {
	await ensureResellerTables();

	const { inboundId, quotaGb, durationDays, priceToman, templateId, customerLabel, internalNote } =
		input;
	const manager = await getOrCreateManagerSystemAccount();
	const inbound = (await getXuiInboundOptions()).find(
		(item) => item.id === inboundId && item.enable
	);

	if (!inbound) {
		throw new Error('سرور انتخاب‌شده در دسترس نیست.');
	}

	const selectedTemplate = templateId
		? await getResellerConfigTemplateById(manager.id, templateId)
		: null;

	if (templateId && !selectedTemplate) {
		throw new Error('قالب انتخاب‌شده پیدا نشد.');
	}

	const values = selectedTemplate
		? {
				quotaGb: selectedTemplate.quotaGb,
				durationDays: selectedTemplate.durationDays,
				priceToman: selectedTemplate.priceToman
			}
		: validateTemplateValues({ quotaGb, durationDays, priceToman });
	const normalizedLabel = normalizeCustomerLabel(customerLabel);
	const displayLabel = normalizedLabel || 'کانفیگ مدیر';
	const uuid = crypto.randomUUID();
	const xuiEmail = buildUniqueXuiEmail(displayLabel);
	const expiresAtMs = Date.now() + values.durationDays * 24 * 60 * 60 * 1000;

	await createVpnClient({
		inboundId,
		uuid,
		email: xuiEmail,
		totalBytes: Math.round(values.quotaGb * 1024 ** 3),
		expiryTime: expiresAtMs,
		enable: true
	});

	try {
		const liveUsageMap = await getVpnClientUsageMap(fallbackHost, { includeOnlineStatus: true });
		const liveUsage = liveUsageMap.get(uuid);

		if (!liveUsage) {
			throw new Error('کانفیگ در 3x-ui ساخته شد اما بازیابی جزئیات آن ممکن نشد.');
		}

		const now = nowSeconds();
		// Use plan_id=0 as sentinel (admin-created, no specific plan)
		await run(
			`INSERT INTO reseller_requests (
				reseller_id, plan_id, template_id, customer_label, internal_note,
				xui_email, xui_client_uuid, xui_inbound_id,
				quota_gb_snapshot, duration_days_snapshot, price_toman_snapshot,
				created_at, revoked_at, settled_amount_toman, settled_payment_id
			) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL)`,
			[
				manager.id,
				selectedTemplate?.id ?? null,
				displayLabel,
				internalNote ?? '',
				xuiEmail,
				uuid,
				inboundId,
				values.quotaGb,
				values.durationDays,
				values.priceToman,
				now
			]
		);

		const row = await queryFirst<Row & { id: number }>('SELECT last_insert_rowid() AS id');
		const saved = row ? await getRequestById(row.id) : null;

		if (!saved) {
			throw new Error('در ذخیره کانفیگ مدیر مشکل پیش آمد.');
		}

		// Insert a zero-cost charge so financial tracking is consistent
		await insertResellerCharge({
			resellerId: manager.id,
			requestId: saved.id,
			type: 'create',
			amountToman: 0,
			createdAt: now
		});

		return buildRequestView(
			saved,
			origin,
			liveUsageMap,
			'admin',
			await getResellerChargesByResellerId(manager.id),
			await getResellerPlans()
		);
	} catch (error) {
		try {
			await deleteVpnClient(xuiEmail);
			await run('DELETE FROM reseller_requests WHERE xui_client_uuid = ?', [uuid]);
		} catch (cleanupError) {
			resellerLogger.error('Failed to clean up admin-created x-ui client after DB failure.', {
				uuid,
				inboundId,
				error: cleanupError instanceof Error ? cleanupError : undefined
			});
		}
		throw error;
	}
}

export async function revokeResellerRequest(
	resellerId: number,
	requestId: number,
	fallbackHost?: string
) {
	await ensureResellerTables();
	const request = await getRequestById(requestId);

	if (!request || request.resellerId !== resellerId) {
		resellerLogger.warn('Blocked reseller revoke ownership mismatch.', { resellerId, requestId });
		throw new Error('درخواست موردنظر پیدا نشد.');
	}

	if (request.revokedAt) {
		throw new Error('این کانفیگ قبلاً لغو شده است.');
	}

	const liveUsage = (await getVpnClientUsageMap(fallbackHost, { includeOnlineStatus: false })).get(
		request.xuiClientUuid
	);

	if (!liveUsage) {
		resellerLogger.warn('Blocked reseller revoke because x-ui client is missing.', {
			resellerId,
			requestId,
			uuid: request.xuiClientUuid
		});
		throw new Error('کانفیگ در x-ui پیدا نشد؛ برای لغو و برگشت اعتبار با مدیر تماس بگیرید.');
	}

	if (liveUsage.usedBytes > 0) {
		throw new Error(
			'این کانفیگ قبلاً مصرف شده است؛ کانفیگ مصرف‌شده قابل لغو برای برگشت اعتبار نیست.'
		);
	}

	await deleteVpnClient(request.xuiEmail);
	await run('UPDATE reseller_requests SET revoked_at = ? WHERE id = ?', [nowSeconds(), requestId]);
	await reverseOutstandingChargesForRequest(resellerId, requestId);
	await refundGbLedgerForRequest(resellerId, requestId);
}

export async function deleteResellerRequest(resellerId: number, requestId: number) {
	await ensureResellerTables();
	const request = await getRequestById(requestId);

	if (!request || request.resellerId !== resellerId) {
		resellerLogger.warn('Blocked reseller delete ownership mismatch.', { resellerId, requestId });
		throw new Error('درخواست موردنظر پیدا نشد.');
	}

	if (!request.revokedAt) {
		throw new Error('فقط کانفیگ‌های لغوشده را می‌توان از لیست حذف کرد.');
	}

	await run('DELETE FROM reseller_charges WHERE reseller_id = ? AND request_id = ?', [resellerId, requestId]);
	await run('DELETE FROM reseller_gb_ledger WHERE reseller_id = ? AND request_id = ?', [resellerId, requestId]);
	await run('DELETE FROM reseller_requests WHERE id = ? AND reseller_id = ?', [requestId, resellerId]);

	resellerLogger.info('Reseller deleted revoked request.', { resellerId, requestId });
}

export async function setResellerRequestEnabled(
	resellerId: number,
	requestId: number,
	enabled: boolean
) {
	await ensureResellerTables();
	const request = await getRequestById(requestId);

	if (!request || request.resellerId !== resellerId) {
		resellerLogger.warn('Blocked reseller enable toggle ownership mismatch.', {
			resellerId,
			requestId
		});
		throw new Error('درخواست موردنظر پیدا نشد.');
	}

	if (request.revokedAt) {
		throw new Error('کانفیگ لغوشده قابل تغییر وضعیت نیست.');
	}

	await setVpnClientEnabled(request.xuiInboundId, request.xuiClientUuid, enabled);
}

export async function setAllResellerRequestsEnabled(resellerId: number, enabled: boolean) {
	await ensureResellerTables();
	const account = await getResellerAccountById(resellerId);

	if (!account) {
		throw new Error('فروشنده پیدا نشد.');
	}

	const requests = (await getResellerRequestsByResellerId(resellerId)).filter(
		(request) => request.revokedAt === null
	);
	let updated = 0;
	let failed = 0;

	for (const request of requests) {
		try {
			await setVpnClientEnabled(request.xuiInboundId, request.xuiClientUuid, enabled);
			updated += 1;
		} catch (error) {
			failed += 1;
			resellerLogger.warn('Failed to bulk-toggle reseller x-ui client.', {
				resellerId,
				requestId: request.id,
				uuid: request.xuiClientUuid,
				enabled,
				error: error instanceof Error ? error : undefined
			});
		}
	}

	return {
		updated,
		failed,
		total: requests.length
	};
}

export async function rechargeResellerRequest(
	resellerId: number,
	requestId: number,
	origin: string,
	fallbackHost?: string
) {
	await ensureResellerTables();

	if (rechargeLocks.has(requestId)) {
		throw new Error('شارژ این کانفیگ در حال انجام است. چند لحظه دیگر دوباره بررسی کنید.');
	}

	rechargeLocks.add(requestId);

	try {
		const account = await getResellerAccountById(resellerId);

		if (!account || account.is_active !== 1) {
			throw new Error('حساب فروشنده فعال نیست.');
		}

		if (account.must_change_password === 1) {
			throw new Error('قبل از فروش، گذرواژه موقت حساب را تغییر دهید.');
		}

		if (!(await isFeatureEnabled('reseller_sales'))) {
			throw new Error('فروش توسط مدیر متوقف شده است.');
		}

		const request = await getRequestById(requestId);

		if (!request || request.resellerId !== resellerId) {
			resellerLogger.warn('Blocked reseller recharge ownership mismatch.', {
				resellerId,
				requestId
			});
			throw new Error('درخواست موردنظر پیدا نشد.');
		}

		if (request.revokedAt) {
			throw new Error('کانفیگ لغوشده قابل شارژ مجدد نیست.');
		}

		if (!isInboundAllowedForAccount(account, request.xuiInboundId)) {
			throw new Error('دسترسی شما به سرور این کانفیگ توسط مدیر محدود شده است.');
		}

		const rechargeQuotaGb = request.quotaGbSnapshot;
		const rechargeDurationDays = request.durationDaysSnapshot;

		const charges = await getResellerChargesByResellerId(resellerId);
		const gbBalance = buildResellerStats(
			await getResellerRequestsByResellerId(resellerId),
			await getResellerPaymentsByResellerId(resellerId),
			account.debt_cap_toman ?? null,
			charges,
			await getResellerGbLedgerByResellerId(resellerId)
		).gbBalance;

		if (gbBalance < rechargeQuotaGb) {
			resellerLogger.warn('Blocked reseller recharge because GB balance is insufficient.', {
				resellerId,
				requestId,
				gbBalance,
				rechargeQuotaGb
			});
			throw new Error('اعتبار گیگابایت شما برای شارژ مجدد کافی نیست.');
		}

		const liveBefore = await getVpnClientUsageMap(fallbackHost, {
			includeOnlineStatus: true
		});
		const liveUsage = liveBefore.get(request.xuiClientUuid);

		if (!liveUsage) {
			resellerLogger.warn('Blocked reseller recharge because x-ui client is missing.', {
				resellerId,
				requestId,
				uuid: request.xuiClientUuid
			});
			throw new Error('کانفیگ در x-ui پیدا نشد و قابل شارژ مجدد نیست.');
		}

		if (liveUsage.status === 'disabled') {
			throw new Error('کانفیگ غیرفعال قابل شارژ مجدد نیست.');
		}

		const expiresAtMs = Date.now() + rechargeDurationDays * 24 * 60 * 60 * 1000;
		const email = await updateVpnClient({
			inboundId: request.xuiInboundId,
			uuid: request.xuiClientUuid,
			totalBytes: Math.round(rechargeQuotaGb * 1024 ** 3),
			expiryTime: expiresAtMs,
			enable: true
		});
		await resetVpnClientTraffic(email);

		const liveAfter = await getVpnClientUsageMap(fallbackHost, {
			includeOnlineStatus: true
		});

		if (!liveAfter.get(request.xuiClientUuid)) {
			throw new Error('شارژ در x-ui انجام شد اما بازیابی کانفیگ انجام نشد. با مدیر تماس بگیرید.');
		}

		try {
			await insertResellerCharge({
				resellerId,
				requestId,
				type: 'recharge',
				amountToman: 0
			});
			await insertGbLedger({
				resellerId,
				requestId,
				type: 'recharge',
				amountGb: -rechargeQuotaGb
			});
		} catch (billingError) {
			resellerLogger.error(
				'Recharge succeeded in x-ui but local billing failed. Disabling client to prevent unpaid service.',
				{
					resellerId,
					requestId,
					uuid: request.xuiClientUuid,
					error: billingError instanceof Error ? billingError : undefined
				}
			);

			try {
				await updateVpnClient({
					inboundId: request.xuiInboundId,
					uuid: request.xuiClientUuid,
					totalBytes: Math.round(rechargeQuotaGb * 1024 ** 3),
					expiryTime: expiresAtMs,
					enable: false
				});
			} catch (disableError) {
				resellerLogger.error('Failed to disable x-ui client after recharge billing failure.', {
					resellerId,
					requestId,
					uuid: request.xuiClientUuid,
					error: disableError instanceof Error ? disableError : undefined
				});
			}

			throw new Error(
				'شارژ در x-ui انجام شد اما ثبت مالی ناموفق بود. کانفیگ برای جلوگیری از سرویس رایگان غیرفعال شد؛ با مدیر تماس بگیرید.'
			);
		}

		const updatedCharges = await getResellerChargesByResellerId(resellerId);
		return buildRequestView(
			request,
			origin,
			liveAfter,
			account.username,
			updatedCharges,
			await getResellerPlans()
		);
	} finally {
		rechargeLocks.delete(requestId);
	}
}

export async function addQuotaToResellerRequest(
	resellerId: number,
	requestId: number,
	addGb: number,
	origin: string,
	fallbackHost?: string
) {
	await ensureResellerTables();

	if (!isFinite(addGb) || addGb <= 0) {
		throw new Error('مقدار افزایش حجم نامعتبر است.');
	}

	if (rechargeLocks.has(requestId)) {
		throw new Error('عملیات روی این کانفیگ در حال انجام است. چند لحظه دیگر دوباره بررسی کنید.');
	}

	rechargeLocks.add(requestId);

	try {
		const account = await getResellerAccountById(resellerId);

		if (!account || account.is_active !== 1) {
			throw new Error('حساب فروشنده فعال نیست.');
		}

		if (account.must_change_password === 1) {
			throw new Error('قبل از فروش، گذرواژه موقت حساب را تغییر دهید.');
		}

		if (!(await isFeatureEnabled('reseller_sales'))) {
			throw new Error('فروش توسط مدیر متوقف شده است.');
		}

		const request = await getRequestById(requestId);

		if (!request || request.resellerId !== resellerId) {
			throw new Error('درخواست موردنظر پیدا نشد.');
		}

		if (request.revokedAt) {
			throw new Error('کانفیگ لغوشده قابل افزایش حجم نیست.');
		}

		if (!isInboundAllowedForAccount(account, request.xuiInboundId)) {
			throw new Error('دسترسی شما به سرور این کانفیگ توسط مدیر محدود شده است.');
		}

		const charges = await getResellerChargesByResellerId(resellerId);
		const gbBalance = buildResellerStats(
			await getResellerRequestsByResellerId(resellerId),
			await getResellerPaymentsByResellerId(resellerId),
			account.debt_cap_toman ?? null,
			charges,
			await getResellerGbLedgerByResellerId(resellerId)
		).gbBalance;

		if (gbBalance < addGb) {
			throw new Error('اعتبار گیگابایت شما برای افزایش حجم کافی نیست.');
		}

		const liveMap = await getVpnClientUsageMap(fallbackHost, { includeOnlineStatus: true });
		const liveUsage = liveMap.get(request.xuiClientUuid);

		if (!liveUsage) {
			throw new Error('کانفیگ در x-ui پیدا نشد و قابل افزایش حجم نیست.');
		}

		if (liveUsage.status === 'disabled') {
			throw new Error('کانفیگ غیرفعال قابل افزایش حجم نیست.');
		}

		const currentTotalBytes = liveUsage.totalBytes ?? 0;
		const addBytes = Math.round(addGb * 1024 ** 3);
		const newTotalBytes = currentTotalBytes + addBytes;

		const currentExpiryTime = liveUsage.expiresAt
			? new Date(liveUsage.expiresAt).getTime()
			: Date.now() + 30 * 24 * 60 * 60 * 1000;

		await updateVpnClient({
			inboundId: request.xuiInboundId,
			uuid: request.xuiClientUuid,
			totalBytes: newTotalBytes,
			expiryTime: currentExpiryTime,
			enable: true
		});

		const liveAfter = await getVpnClientUsageMap(fallbackHost, { includeOnlineStatus: true });

		if (!liveAfter.get(request.xuiClientUuid)) {
			throw new Error(
				'افزایش حجم در x-ui انجام شد اما بازیابی کانفیگ ناموفق بود. با مدیر تماس بگیرید.'
			);
		}

		try {
			await insertResellerCharge({
				resellerId,
				requestId,
				type: 'recharge',
				amountToman: 0
			});
			await insertGbLedger({
				resellerId,
				requestId,
				type: 'recharge',
				amountGb: -addGb
			});
		} catch (billingError) {
			resellerLogger.error(
				'Add-quota succeeded in x-ui but local billing failed. Disabling client to prevent unpaid service.',
				{
					resellerId,
					requestId,
					uuid: request.xuiClientUuid,
					error: billingError instanceof Error ? billingError : undefined
				}
			);

			try {
				await updateVpnClient({
					inboundId: request.xuiInboundId,
					uuid: request.xuiClientUuid,
					totalBytes: currentTotalBytes,
					expiryTime: currentExpiryTime,
					enable: false
				});
			} catch (disableError) {
				resellerLogger.error('Failed to revert x-ui client after add-quota billing failure.', {
					resellerId,
					requestId,
					uuid: request.xuiClientUuid,
					error: disableError instanceof Error ? disableError : undefined
				});
			}

			throw new Error(
				'افزایش حجم در x-ui انجام شد اما ثبت مالی ناموفق بود. کانفیگ غیرفعال شد؛ با مدیر تماس بگیرید.'
			);
		}

		const updatedCharges = await getResellerChargesByResellerId(resellerId);
		return buildRequestView(
			request,
			origin,
			liveAfter,
			account.username,
			updatedCharges,
			await getResellerPlans()
		);
	} finally {
		rechargeLocks.delete(requestId);
	}
}

async function reverseOutstandingChargesForRequest(resellerId: number, requestId: number) {
	const charges = (await getResellerChargesByResellerId(resellerId)).filter(
		(charge) => charge.requestId === requestId
	);
	const reversedAt = nowSeconds();

	for (const charge of charges) {
		const outstanding = getChargeNetAmount(charge);

		if (outstanding <= 0) {
			continue;
		}

		await run(
			`
			UPDATE reseller_charges
			SET
				reversed_amount_toman = reversed_amount_toman + ?,
				reversed_at = COALESCE(reversed_at, ?)
			WHERE id = ?
		`,
			[outstanding, reversedAt, charge.id]
		);
	}
}

async function refundGbLedgerForRequest(resellerId: number, requestId: number) {
	const ledger = (await getResellerGbLedgerByResellerId(resellerId)).filter(
		(entry) => entry.requestId === requestId
	);
	const consumedGb = Math.abs(
		ledger.filter((entry) => entry.amountGb < 0).reduce((total, entry) => total + entry.amountGb, 0)
	);
	const alreadyRefundedGb = ledger
		.filter((entry) => entry.type === 'refund' && entry.amountGb > 0)
		.reduce((total, entry) => total + entry.amountGb, 0);
	const refundGb = consumedGb - alreadyRefundedGb;

	if (refundGb <= 0) {
		return;
	}

	await insertGbLedger({
		resellerId,
		requestId,
		type: 'refund',
		amountGb: refundGb
	});
}

export async function recordResellerPayment(resellerId: number, amountToman: number) {
	await ensureResellerTables();
	const account = await getResellerAccountById(resellerId);

	if (!account) {
		throw new Error('فروشنده پیدا نشد.');
	}

	if (amountToman <= 0) {
		throw new Error('مبلغ شارژ باید بیشتر از صفر باشد.');
	}

	await run(
		'INSERT INTO reseller_payments (reseller_id, amount_toman, created_at) VALUES (?, ?, ?)',
		[resellerId, amountToman, nowSeconds()]
	);

	return amountToman;
}

export async function clearResellerDebt(resellerId: number) {
	await ensureResellerTables();
	const stats = buildResellerStats(
		await getResellerRequestsByResellerId(resellerId),
		await getResellerPaymentsByResellerId(resellerId),
		null,
		await getResellerChargesByResellerId(resellerId),
		await getResellerGbLedgerByResellerId(resellerId)
	);

	return stats.walletBalanceToman;
}

// ── Sub-reseller management ───────────────────────────────────────────────────

export async function getSubPackagesByOwner(
	ownerResellerId: number
): Promise<ResellerSubPackage[]> {
	await ensureResellerTables();
	const rows = await queryAll<ResellerSubPackageRow>(
		`SELECT id, owner_reseller_id, quota_gb, price_toman, is_active, created_at, updated_at
		 FROM reseller_sub_packages
		 WHERE owner_reseller_id = ?
		 ORDER BY is_active DESC, quota_gb ASC, id DESC`,
		[ownerResellerId]
	);
	return rows.map(mapSubPackageRow);
}

export async function createSubPackage(
	ownerResellerId: number,
	quotaGb: number,
	priceToman: number
) {
	await ensureResellerTables();
	if (!Number.isInteger(quotaGb) || quotaGb <= 0) throw new Error('حجم بسته نامعتبر است.');
	if (!Number.isInteger(priceToman) || priceToman < 0) throw new Error('قیمت نامعتبر است.');
	const now = nowSeconds();
	await run(
		`INSERT INTO reseller_sub_packages (owner_reseller_id, quota_gb, price_toman, is_active, created_at, updated_at)
		 VALUES (?, ?, ?, 1, ?, ?)`,
		[ownerResellerId, quotaGb, priceToman, now, now]
	);
}

export async function updateSubPackage(
	id: number,
	ownerResellerId: number,
	quotaGb: number,
	priceToman: number
) {
	await ensureResellerTables();
	if (!Number.isInteger(quotaGb) || quotaGb <= 0) throw new Error('حجم بسته نامعتبر است.');
	if (!Number.isInteger(priceToman) || priceToman < 0) throw new Error('قیمت نامعتبر است.');
	const now = nowSeconds();
	await run(
		`UPDATE reseller_sub_packages SET quota_gb = ?, price_toman = ?, updated_at = ?
		 WHERE id = ? AND owner_reseller_id = ?`,
		[quotaGb, priceToman, now, id, ownerResellerId]
	);
}

export async function setSubPackageActive(id: number, ownerResellerId: number, isActive: boolean) {
	await ensureResellerTables();
	await run(
		`UPDATE reseller_sub_packages SET is_active = ?, updated_at = ?
		 WHERE id = ? AND owner_reseller_id = ?`,
		[isActive ? 1 : 0, nowSeconds(), id, ownerResellerId]
	);
}

export async function deleteSubPackage(id: number, ownerResellerId: number) {
	await ensureResellerTables();
	await run(`DELETE FROM reseller_sub_packages WHERE id = ? AND owner_reseller_id = ?`, [
		id,
		ownerResellerId
	]);
}

export async function getSubResellersByParent(
	parentResellerId: number
): Promise<SubResellerSummary[]> {
	await ensureResellerTables();
	const accounts = await queryAll<ResellerAccountRow>(
		`SELECT id, username, username_normalized, password_hash, is_active, email,
		        must_change_password, allowed_inbound_ids, custom_message, debt_cap_toman,
		        parent_reseller_id, can_manage_sub_resellers,
		        COALESCE(sub_reseller_limit, 10) AS sub_reseller_limit,
		        COALESCE(group_id, NULL) AS group_id,
		        COALESCE(client_tickets_enabled, 0) AS client_tickets_enabled,
		        COALESCE(telegram_bot_allowed, 0) AS telegram_bot_allowed,
		        COALESCE(payment_card_number, '') AS payment_card_number,
		        COALESCE(payment_card_owner_name, '') AS payment_card_owner_name,
		        COALESCE(is_system_manager, 0) AS is_system_manager,
		        created_at, updated_at
		 FROM reseller_accounts
		 WHERE parent_reseller_id = ?
		 ORDER BY username COLLATE NOCASE ASC`,
		[parentResellerId]
	);

	if (accounts.length === 0) return [];

	const subIds = accounts.map((a) => a.id);
	const placeholders = subIds.map(() => '?').join(',');

	const requestRows = await queryAll<Row & { reseller_id: number; revoked_at: number | null }>(
		`SELECT reseller_id, revoked_at FROM reseller_requests WHERE reseller_id IN (${placeholders})`,
		subIds
	);
	const gbLedgerRows = await queryAll<ResellerGbLedgerRow>(
		`SELECT id, reseller_id, request_id, credit_request_id, type, amount_gb, created_at
		 FROM reseller_gb_ledger WHERE reseller_id IN (${placeholders})`,
		subIds
	);

	return accounts.map((account) => {
		const ledger = gbLedgerRows.filter((e) => e.reseller_id === account.id).map(mapGbLedgerRow);
		const gbBalance = ledger.reduce((sum, e) => sum + e.amountGb, 0);
		const reqs = requestRows.filter((r) => r.reseller_id === account.id);
		return {
			id: account.id,
			username: account.username,
			email: account.email ?? '',
			isActive: account.is_active === 1,
			gbBalance,
			totalConfigs: reqs.length,
			activeConfigs: reqs.filter((r) => r.revoked_at === null).length,
			createdAt: account.created_at
		};
	});
}

export async function setResellerSubResellerPermission(resellerId: number, canManage: boolean) {
	await ensureResellerTables();
	await run(
		`UPDATE reseller_accounts SET can_manage_sub_resellers = ?, updated_at = ? WHERE id = ? AND parent_reseller_id IS NULL`,
		[canManage ? 1 : 0, nowSeconds(), resellerId]
	);
}

export async function createSubResellerAccount(
	parentResellerId: number,
	username: string,
	password: string
) {
	await ensureResellerTables();
	const parent = await getResellerAccountById(parentResellerId);
	if (!parent || parent.is_active !== 1) throw new Error('حساب فروشنده والد فعال نیست.');
	if (!parent.can_manage_sub_resellers) throw new Error('مجوز ساخت زیرفروشنده ندارید.');
	const subResellerCount = await queryFirst<Row & { count: number }>(
		'SELECT COUNT(*) AS count FROM reseller_accounts WHERE parent_reseller_id = ?',
		[parentResellerId]
	);
	const limit = parent.sub_reseller_limit ?? 10;
	if ((subResellerCount?.count ?? 0) >= limit) {
		throw new Error(
			`سقف تعداد زیرفروشندگان شما (${limit.toLocaleString('fa-IR-u-nu-latn')}) تکمیل شده است.`
		);
	}

	const normalizedUsername = normalizeUsername(username);
	if (!normalizedUsername) throw new Error('نام کاربری نامعتبر است.');

	const now = nowSeconds();
	const passwordHash = await hashSecret(password.trim());

	try {
		await run(
			`INSERT INTO reseller_accounts
			 (username, username_normalized, password_hash, is_active, email, must_change_password,
			  allowed_inbound_ids, custom_message, debt_cap_toman, parent_reseller_id, created_at, updated_at)
			 VALUES (?, ?, ?, 1, '', 1, ?, '', NULL, ?, ?, ?)`,
			[
				username.trim(),
				normalizedUsername,
				passwordHash,
				parent.allowed_inbound_ids ?? '',
				parentResellerId,
				now,
				now
			]
		);
	} catch (error) {
		if (isUniqueConstraintError(error)) throw new Error('این نام کاربری قبلاً ثبت شده است.');
		throw error;
	}
}

export async function setSubResellerActive(
	subResellerId: number,
	parentResellerId: number,
	isActive: boolean
) {
	await ensureResellerTables();
	const account = await getResellerAccountById(subResellerId);
	if (!account || account.parent_reseller_id !== parentResellerId)
		throw new Error('زیرفروشنده پیدا نشد.');
	await run(`UPDATE reseller_accounts SET is_active = ?, updated_at = ? WHERE id = ?`, [
		isActive ? 1 : 0,
		nowSeconds(),
		subResellerId
	]);
}

export async function resetSubResellerPassword(subResellerId: number, parentResellerId: number) {
	await ensureResellerTables();
	const account = await getResellerAccountById(subResellerId);
	if (!account || account.parent_reseller_id !== parentResellerId)
		throw new Error('زیرفروشنده پیدا نشد.');
	const newPassword = randomBytes(5).toString('hex');
	await run(
		`UPDATE reseller_accounts SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?`,
		[await hashSecret(newPassword), nowSeconds(), subResellerId]
	);
	return newPassword;
}

export async function transferGbToSubReseller(
	parentResellerId: number,
	subResellerId: number,
	amountGb: number
) {
	await ensureResellerTables();
	if (!Number.isInteger(amountGb) || amountGb <= 0) throw new Error('مقدار گیگابایت نامعتبر است.');

	const sub = await getResellerAccountById(subResellerId);
	if (!sub || sub.parent_reseller_id !== parentResellerId) throw new Error('زیرفروشنده پیدا نشد.');

	const parentLedger = await getResellerGbLedgerByResellerId(parentResellerId);
	const parentBalance = parentLedger.reduce((sum, e) => sum + e.amountGb, 0);
	if (parentBalance < amountGb) throw new Error('موجودی گیگابایت کافی نیست.');

	const now = nowSeconds();
	await insertGbLedger({
		resellerId: parentResellerId,
		type: 'transfer',
		amountGb: -amountGb,
		createdAt: now
	});
	await insertGbLedger({
		resellerId: subResellerId,
		type: 'transfer',
		amountGb: amountGb,
		createdAt: now
	});
}

async function getSubPackageById(id: number, ownerResellerId: number) {
	await ensureResellerTables();
	const row = await queryFirst<ResellerSubPackageRow>(
		`SELECT id, owner_reseller_id, quota_gb, price_toman, is_active, created_at, updated_at
		 FROM reseller_sub_packages WHERE id = ? AND owner_reseller_id = ? LIMIT 1`,
		[id, ownerResellerId]
	);
	return row ? mapSubPackageRow(row) : null;
}

export async function getSubCreditRequestsBySubReseller(
	subResellerId: number
): Promise<SubResellerCreditRequest[]> {
	await ensureResellerTables();
	const rows = await queryAll<SubResellerCreditRequestRow>(
		`SELECT scr.id, scr.sub_reseller_id, ra.username AS sub_reseller_username,
		        scr.parent_reseller_id, scr.package_id, scr.quota_gb_snapshot, scr.price_toman_snapshot,
		        scr.receipt_text, scr.receipt_file_name, scr.receipt_mime_type, scr.receipt_data_base64,
		        scr.receipt_size_bytes, scr.status, scr.parent_note, scr.created_at, scr.reviewed_at
		 FROM sub_reseller_credit_requests scr
		 LEFT JOIN reseller_accounts ra ON ra.id = scr.sub_reseller_id
		 WHERE scr.sub_reseller_id = ?
		 ORDER BY scr.created_at DESC, scr.id DESC`,
		[subResellerId]
	);
	return rows.map(mapSubCreditRequestRow);
}

export async function getSubCreditRequestsByParent(
	parentResellerId: number
): Promise<SubResellerCreditRequest[]> {
	await ensureResellerTables();
	const rows = await queryAll<SubResellerCreditRequestRow>(
		`SELECT scr.id, scr.sub_reseller_id, ra.username AS sub_reseller_username,
		        scr.parent_reseller_id, scr.package_id, scr.quota_gb_snapshot, scr.price_toman_snapshot,
		        scr.receipt_text, scr.receipt_file_name, scr.receipt_mime_type, scr.receipt_data_base64,
		        scr.receipt_size_bytes, scr.status, scr.parent_note, scr.created_at, scr.reviewed_at
		 FROM sub_reseller_credit_requests scr
		 LEFT JOIN reseller_accounts ra ON ra.id = scr.sub_reseller_id
		 WHERE scr.parent_reseller_id = ?
		 ORDER BY scr.created_at DESC, scr.id DESC`,
		[parentResellerId]
	);
	return rows.map(mapSubCreditRequestRow);
}

export async function createSubResellerCreditRequest(input: {
	subResellerId: number;
	packageId: number;
	receiptText: string;
	receiptFileName?: string | null;
	receiptMimeType?: string | null;
	receiptDataBase64?: string | null;
	receiptSizeBytes?: number | null;
}) {
	await ensureResellerTables();
	const sub = await getResellerAccountById(input.subResellerId);
	if (!sub || sub.is_active !== 1) throw new Error('حساب فروشنده فعال نیست.');
	if (!sub.parent_reseller_id) throw new Error('این حساب زیرفروشنده نیست.');

	const pkg = await getSubPackageById(input.packageId, sub.parent_reseller_id);
	if (!pkg || !pkg.isActive) throw new Error('بسته شارژ انتخاب‌شده در دسترس نیست.');

	const receipt = validateCreditReceipt(input);
	const now = nowSeconds();

	await run(
		`INSERT INTO sub_reseller_credit_requests
		 (sub_reseller_id, parent_reseller_id, package_id, quota_gb_snapshot, price_toman_snapshot,
		  receipt_text, receipt_file_name, receipt_mime_type, receipt_data_base64, receipt_size_bytes,
		  status, parent_note, created_at, reviewed_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', ?, NULL)`,
		[
			input.subResellerId,
			sub.parent_reseller_id,
			pkg.id,
			pkg.quotaGb,
			pkg.priceToman,
			receipt.receiptText,
			receipt.receiptFileName,
			receipt.receiptMimeType,
			receipt.receiptDataBase64,
			receipt.receiptSizeBytes,
			now
		]
	);
}

export async function reviewSubResellerCreditRequest(
	id: number,
	parentResellerId: number,
	status: 'approved' | 'rejected',
	parentNote = ''
) {
	await ensureResellerTables();
	const row = await queryFirst<SubResellerCreditRequestRow>(
		`SELECT scr.id, scr.sub_reseller_id, ra.username AS sub_reseller_username,
		        scr.parent_reseller_id, scr.package_id, scr.quota_gb_snapshot, scr.price_toman_snapshot,
		        scr.receipt_text, scr.receipt_file_name, scr.receipt_mime_type, scr.receipt_data_base64,
		        scr.receipt_size_bytes, scr.status, scr.parent_note, scr.created_at, scr.reviewed_at
		 FROM sub_reseller_credit_requests scr
		 LEFT JOIN reseller_accounts ra ON ra.id = scr.sub_reseller_id
		 WHERE scr.id = ? AND scr.parent_reseller_id = ? LIMIT 1`,
		[id, parentResellerId]
	);

	if (!row) throw new Error('درخواست شارژ پیدا نشد.');
	const request = mapSubCreditRequestRow(row);
	if (request.status !== 'pending') throw new Error('این درخواست قبلاً بررسی شده است.');

	const reviewedAt = nowSeconds();
	await run(
		`UPDATE sub_reseller_credit_requests SET status = ?, parent_note = ?, reviewed_at = ? WHERE id = ?`,
		[status, parentNote.trim().slice(0, 500), reviewedAt, id]
	);

	if (status === 'approved') {
		// Check parent has enough GB
		const parentLedger = await getResellerGbLedgerByResellerId(parentResellerId);
		const parentBalance = parentLedger.reduce((sum, e) => sum + e.amountGb, 0);
		if (parentBalance < request.quotaGbSnapshot) {
			// Rollback the review
			await run(
				`UPDATE sub_reseller_credit_requests SET status = 'pending', parent_note = '', reviewed_at = NULL WHERE id = ?`,
				[id]
			);
			throw new Error('موجودی گیگابایت کافی برای تأیید این درخواست وجود ندارد.');
		}
		const now = nowSeconds();
		await insertGbLedger({
			resellerId: parentResellerId,
			type: 'transfer',
			amountGb: -request.quotaGbSnapshot,
			createdAt: now
		});
		await insertGbLedger({
			resellerId: request.subResellerId,
			type: 'purchase',
			amountGb: request.quotaGbSnapshot,
			createdAt: now
		});
	}
}

// ── Mapper functions for new types ─────────────────────────────────────────────

function mapGroupRow(row: ResellerGroupRow): ResellerGroup {
	return {
		id: row.id,
		name: row.name,
		color: row.color,
		badgeIcon: row.badge_icon,
		description: row.description,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

function mapSubResellerTicketAttachmentRow(
	row: SubResellerTicketAttachmentRow
): SubResellerTicketAttachment {
	return {
		id: row.id,
		messageId: row.message_id,
		fileName: row.file_name,
		mimeType: row.mime_type,
		sizeBytes: row.size_bytes,
		dataUrl: `data:${row.mime_type};base64,${row.data_base64}`,
		createdAt: row.created_at
	};
}

function mapSubResellerTicketMessageRow(
	row: SubResellerTicketMessageRow,
	attachmentsByMessageId: Map<number, SubResellerTicketAttachment[]>
): SubResellerTicketMessage {
	return {
		id: row.id,
		ticketId: row.ticket_id,
		senderType: row.sender_type,
		message: row.message,
		createdAt: row.created_at,
		attachments: attachmentsByMessageId.get(row.id) ?? []
	};
}

function mapSubResellerTicketRow(row: SubResellerTicketRow): SubResellerTicket {
	return {
		id: row.id,
		subResellerId: row.sub_reseller_id,
		subResellerUsername: row.sub_reseller_username ?? '',
		parentResellerId: row.parent_reseller_id,
		parentResellerUsername: row.parent_reseller_username ?? '',
		subject: row.subject,
		message: row.message,
		status: row.status,
		createdAt: row.created_at,
		closedAt: row.closed_at,
		messages: []
	};
}

function mapClientTicketAttachmentRow(row: ClientTicketAttachmentRow): ClientTicketAttachment {
	return {
		id: row.id,
		messageId: row.message_id,
		fileName: row.file_name,
		mimeType: row.mime_type,
		sizeBytes: row.size_bytes,
		dataUrl: `data:${row.mime_type};base64,${row.data_base64}`,
		createdAt: row.created_at
	};
}

function mapClientTicketMessageRow(
	row: ClientTicketMessageRow,
	attachmentsByMessageId: Map<number, ClientTicketAttachment[]>
): ClientTicketMessage {
	return {
		id: row.id,
		ticketId: row.ticket_id,
		senderType: row.sender_type,
		message: row.message,
		createdAt: row.created_at,
		attachments: attachmentsByMessageId.get(row.id) ?? []
	};
}

function mapClientTicketRow(row: ClientTicketRow): ClientTicket {
	return {
		id: row.id,
		clientUuid: row.client_uuid,
		clientEmail: row.client_email ?? '',
		clientLabel: row.client_label ?? '',
		ownerResellerId: row.owner_reseller_id,
		subject: row.subject,
		status: row.status,
		createdAt: row.created_at,
		closedAt: row.closed_at,
		messages: []
	};
}

// ── Attachment message helpers ─────────────────────────────────────────────────

async function attachSubResellerTicketMessages(tickets: SubResellerTicket[]) {
	if (tickets.length === 0) return tickets;
	const ticketIds = tickets.map((t) => t.id);
	const placeholders = ticketIds.map(() => '?').join(', ');
	const messageRows = await queryAll<SubResellerTicketMessageRow>(
		`SELECT id, ticket_id, sender_type, message, created_at
		 FROM sub_reseller_ticket_messages
		 WHERE ticket_id IN (${placeholders})
		 ORDER BY created_at ASC, id ASC`,
		ticketIds
	);
	const messageIds = messageRows.map((m) => m.id);
	const attachmentRows =
		messageIds.length === 0
			? []
			: await queryAll<SubResellerTicketAttachmentRow>(
					`SELECT id, message_id, file_name, mime_type, data_base64, size_bytes, created_at
		 FROM sub_reseller_ticket_attachments
		 WHERE message_id IN (${messageIds.map(() => '?').join(', ')})
		 ORDER BY id ASC`,
					messageIds
				);
	const attachmentsByMessageId = new Map<number, SubResellerTicketAttachment[]>();
	for (const a of attachmentRows.map(mapSubResellerTicketAttachmentRow)) {
		const arr = attachmentsByMessageId.get(a.messageId) ?? [];
		arr.push(a);
		attachmentsByMessageId.set(a.messageId, arr);
	}
	const messagesByTicketId = new Map<number, SubResellerTicketMessage[]>();
	for (const row of messageRows) {
		const msg = mapSubResellerTicketMessageRow(row, attachmentsByMessageId);
		const arr = messagesByTicketId.get(msg.ticketId) ?? [];
		arr.push(msg);
		messagesByTicketId.set(msg.ticketId, arr);
	}
	return tickets.map((t) => ({ ...t, messages: messagesByTicketId.get(t.id) ?? [] }));
}

// ── Feature 12: Reseller Groups ────────────────────────────────────────────────

export async function getResellerGroups(): Promise<ResellerGroup[]> {
	await ensureResellerTables();
	const rows = await queryAll<ResellerGroupRow>(
		`SELECT id, name, color, badge_icon, description, created_at, updated_at
		 FROM reseller_groups ORDER BY name ASC`
	);
	return rows.map(mapGroupRow);
}

export async function getResellerGroupById(id: number): Promise<ResellerGroup | null> {
	await ensureResellerTables();
	const row = await queryFirst<ResellerGroupRow>(
		`SELECT id, name, color, badge_icon, description, created_at, updated_at
		 FROM reseller_groups WHERE id = ? LIMIT 1`,
		[id]
	);
	return row ? mapGroupRow(row) : null;
}

export async function createResellerGroup(input: {
	name: string;
	color: string;
	badgeIcon: string;
	description: string;
}) {
	await ensureResellerTables();
	const name = input.name.trim().slice(0, 64);
	if (!name) throw new Error('نام گروه نمی‌تواند خالی باشد.');
	const existing = await queryFirst<Row & { id: number }>(
		'SELECT id FROM reseller_groups WHERE lower(name) = lower(?) LIMIT 1',
		[name]
	);
	if (existing) throw new Error('گروهی با این نام قبلاً ثبت شده است.');
	const color = input.color.trim().slice(0, 32) || '#6366f1';
	const badgeIcon = input.badgeIcon.trim().slice(0, 64) || 'sparkle';
	const description = input.description.trim().slice(0, 256);
	const now = nowSeconds();
	const result = await insertAndReturnId(
		`INSERT INTO reseller_groups (name, color, badge_icon, description, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		[name, color, badgeIcon, description, now, now]
	);
	return result.lastInsertRowid;
}

export async function updateResellerGroup(
	id: number,
	input: { name: string; color: string; badgeIcon: string; description: string }
) {
	await ensureResellerTables();
	const name = input.name.trim().slice(0, 64);
	if (!name) throw new Error('نام گروه نمی‌تواند خالی باشد.');
	const existing = await queryFirst<Row & { id: number }>(
		'SELECT id FROM reseller_groups WHERE lower(name) = lower(?) AND id <> ? LIMIT 1',
		[name, id]
	);
	if (existing) throw new Error('گروهی با این نام قبلاً ثبت شده است.');
	const color = input.color.trim().slice(0, 32) || '#6366f1';
	const badgeIcon = input.badgeIcon.trim().slice(0, 64) || 'sparkle';
	const description = input.description.trim().slice(0, 256);
	const now = nowSeconds();
	await run(
		`UPDATE reseller_groups SET name = ?, color = ?, badge_icon = ?, description = ?, updated_at = ? WHERE id = ?`,
		[name, color, badgeIcon, description, now, id]
	);
}

export async function deleteResellerGroup(id: number) {
	await ensureResellerTables();
	await run(`UPDATE reseller_accounts SET group_id = NULL WHERE group_id = ?`, [id]);
	await run(`DELETE FROM reseller_credit_package_access WHERE group_id = ?`, [id]);
	await run(`DELETE FROM reseller_groups WHERE id = ?`, [id]);
}

export async function assignResellerToGroup(resellerId: number, groupId: number | null) {
	await ensureResellerTables();
	const account = await getResellerAccountById(resellerId);
	if (!account || account.parent_reseller_id !== null || account.is_system_manager === 1) {
		throw new Error('فقط فروشنده مستقیم می‌تواند عضو گروه باشد.');
	}
	if (groupId !== null) {
		const group = await queryFirst<ResellerGroupRow>(
			`SELECT id FROM reseller_groups WHERE id = ? LIMIT 1`,
			[groupId]
		);
		if (!group) throw new Error('گروه انتخابی وجود ندارد.');
	}
	const now = nowSeconds();
	await run(`UPDATE reseller_accounts SET group_id = ?, updated_at = ? WHERE id = ?`, [
		groupId,
		now,
		resellerId
	]);
}

// ── Feature 11: Private plan access ───────────────────────────────────────────

export async function setResellerPlanPublic(planId: number, isPublic: boolean) {
	await ensureResellerTables();
	const now = nowSeconds();
	await run(`UPDATE reseller_plans SET is_public = ?, updated_at = ? WHERE id = ?`, [
		isPublic ? 1 : 0,
		now,
		planId
	]);
	// If plan becomes public, remove all individual access entries (not needed)
	if (isPublic) {
		await run(`DELETE FROM reseller_plan_access WHERE plan_id = ?`, [planId]);
	}
}

export async function getResellerPlanAccessList(planId: number): Promise<
	{
		resellerId: number | null;
		groupId: number | null;
	}[]
> {
	await ensureResellerTables();
	type PlanAccessRow = Row & {
		plan_id: number;
		reseller_id: number | null;
		group_id: number | null;
	};
	const rows = await queryAll<PlanAccessRow>(
		`SELECT plan_id, reseller_id, group_id FROM reseller_plan_access WHERE plan_id = ?`,
		[planId]
	);
	return rows.map((r) => ({ resellerId: r.reseller_id, groupId: r.group_id }));
}

export async function getAllResellerPlanAccess(): Promise<
	{
		planId: number;
		resellerId: number | null;
		groupId: number | null;
	}[]
> {
	await ensureResellerTables();
	type PlanAccessAllRow = Row & {
		plan_id: number;
		reseller_id: number | null;
		group_id: number | null;
	};
	const rows = await queryAll<PlanAccessAllRow>(
		`SELECT plan_id, reseller_id, group_id FROM reseller_plan_access`
	);
	return rows.map((r) => ({ planId: r.plan_id, resellerId: r.reseller_id, groupId: r.group_id }));
}

export async function addResellerPlanAccess(
	planId: number,
	resellerId: number | null,
	groupId: number | null
) {
	await ensureResellerTables();
	if (resellerId === null && groupId === null) throw new Error('باید فروشنده یا گروه مشخص شود.');
	// Upsert-like: ignore if already exists
	await run(
		`INSERT OR IGNORE INTO reseller_plan_access (plan_id, reseller_id, group_id) VALUES (?, ?, ?)`,
		[planId, resellerId, groupId]
	);
}

export async function removeResellerPlanAccess(
	planId: number,
	resellerId: number | null,
	groupId: number | null
) {
	await ensureResellerTables();
	await run(
		`DELETE FROM reseller_plan_access WHERE plan_id = ? AND (reseller_id IS ? OR reseller_id = ?) AND (group_id IS ? OR group_id = ?)`,
		[planId, resellerId, resellerId, groupId, groupId]
	);
}

// ── Feature 9: Sub-reseller ↔ Reseller Ticket System ─────────────────────────

export async function getSubResellerTicketsBySubReseller(
	subResellerId: number
): Promise<SubResellerTicket[]> {
	await ensureResellerTables();
	const rows = await queryAll<SubResellerTicketRow>(
		`SELECT t.id, t.sub_reseller_id, child.username AS sub_reseller_username,
		        t.parent_reseller_id, parent.username AS parent_reseller_username,
		        t.subject, t.message, t.status, t.created_at, t.closed_at
		 FROM sub_reseller_tickets t
		 LEFT JOIN reseller_accounts child ON child.id = t.sub_reseller_id
		 LEFT JOIN reseller_accounts parent ON parent.id = t.parent_reseller_id
		 WHERE t.sub_reseller_id = ?
		 ORDER BY t.created_at DESC, t.id DESC`,
		[subResellerId]
	);
	const tickets = rows.map(mapSubResellerTicketRow);
	return attachSubResellerTicketMessages(tickets);
}

export async function getSubResellerTicketsByParent(
	parentResellerId: number
): Promise<SubResellerTicket[]> {
	await ensureResellerTables();
	const rows = await queryAll<SubResellerTicketRow>(
		`SELECT t.id, t.sub_reseller_id, child.username AS sub_reseller_username,
		        t.parent_reseller_id, parent.username AS parent_reseller_username,
		        t.subject, t.message, t.status, t.created_at, t.closed_at
		 FROM sub_reseller_tickets t
		 LEFT JOIN reseller_accounts child ON child.id = t.sub_reseller_id
		 LEFT JOIN reseller_accounts parent ON parent.id = t.parent_reseller_id
		 WHERE t.parent_reseller_id = ?
		 ORDER BY t.created_at DESC, t.id DESC`,
		[parentResellerId]
	);
	const tickets = rows.map(mapSubResellerTicketRow);
	return attachSubResellerTicketMessages(tickets);
}

export async function createSubResellerTicket(
	subResellerId: number,
	subject: string,
	message: string,
	attachments: NewTicketAttachmentInput[] = []
) {
	await ensureResellerTables();
	const sub = await queryFirst<ResellerAccountRow>(
		`SELECT id, parent_reseller_id FROM reseller_accounts WHERE id = ? LIMIT 1`,
		[subResellerId]
	);
	if (!sub || !sub.parent_reseller_id) throw new Error('حساب زیرفروشنده یا رابطه والد پیدا نشد.');
	const parentResellerId = sub.parent_reseller_id;
	const trimmedSubject = subject.trim().slice(0, 128);
	const trimmedMessage = message.trim().slice(0, 2000);
	if (!trimmedSubject) throw new Error('موضوع تیکت نمی‌تواند خالی باشد.');
	if (!trimmedMessage) throw new Error('متن تیکت نمی‌تواند خالی باشد.');
	const validAttachments = validateTicketAttachments(attachments);
	const now = nowSeconds();
	const ticketResult = await insertAndReturnId(
		`INSERT INTO sub_reseller_tickets (sub_reseller_id, parent_reseller_id, subject, message, status, created_at, closed_at)
		 VALUES (?, ?, ?, ?, 'open', ?, NULL)`,
		[subResellerId, parentResellerId, trimmedSubject, trimmedMessage, now]
	);
	const ticketId = ticketResult.lastInsertRowid;
	const msgResult = await insertAndReturnId(
		`INSERT INTO sub_reseller_ticket_messages (ticket_id, sender_type, message, created_at)
		 VALUES (?, 'sub_reseller', ?, ?)`,
		[ticketId, trimmedMessage, now]
	);
	for (const att of validAttachments) {
		await run(
			`INSERT INTO sub_reseller_ticket_attachments (message_id, file_name, mime_type, data_base64, size_bytes, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[msgResult.lastInsertRowid, att.fileName, att.mimeType, att.dataBase64, att.sizeBytes, now]
		);
	}
	return ticketId;
}

export async function addSubResellerTicketMessage(
	ticketId: number,
	subResellerId: number,
	message: string,
	attachments: NewTicketAttachmentInput[] = []
) {
	await ensureResellerTables();
	const ticket = await queryFirst<SubResellerTicketRow>(
		`SELECT id, sub_reseller_id, parent_reseller_id, status FROM sub_reseller_tickets WHERE id = ? LIMIT 1`,
		[ticketId]
	);
	if (!ticket || ticket.sub_reseller_id !== subResellerId) throw new Error('تیکت پیدا نشد.');
	if (ticket.status === 'closed') throw new Error('تیکت بسته است.');
	const trimmed = message.trim().slice(0, 2000);
	if (!trimmed) throw new Error('متن پیام نمی‌تواند خالی باشد.');
	const validAttachments = validateTicketAttachments(attachments);
	const now = nowSeconds();
	const msgResult = await insertAndReturnId(
		`INSERT INTO sub_reseller_ticket_messages (ticket_id, sender_type, message, created_at)
		 VALUES (?, 'sub_reseller', ?, ?)`,
		[ticketId, trimmed, now]
	);
	for (const att of validAttachments) {
		await run(
			`INSERT INTO sub_reseller_ticket_attachments (message_id, file_name, mime_type, data_base64, size_bytes, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[msgResult.lastInsertRowid, att.fileName, att.mimeType, att.dataBase64, att.sizeBytes, now]
		);
	}
}

export async function addParentResellerTicketMessage(
	ticketId: number,
	parentResellerId: number,
	message: string,
	attachments: NewTicketAttachmentInput[] = []
) {
	await ensureResellerTables();
	const ticket = await queryFirst<SubResellerTicketRow>(
		`SELECT id, sub_reseller_id, parent_reseller_id, status FROM sub_reseller_tickets WHERE id = ? LIMIT 1`,
		[ticketId]
	);
	if (!ticket || ticket.parent_reseller_id !== parentResellerId) throw new Error('تیکت پیدا نشد.');
	if (ticket.status === 'closed') throw new Error('تیکت بسته است.');
	const trimmed = message.trim().slice(0, 2000);
	if (!trimmed) throw new Error('متن پیام نمی‌تواند خالی باشد.');
	const validAttachments = validateTicketAttachments(attachments);
	const now = nowSeconds();
	const msgResult = await insertAndReturnId(
		`INSERT INTO sub_reseller_ticket_messages (ticket_id, sender_type, message, created_at)
		 VALUES (?, 'parent_reseller', ?, ?)`,
		[ticketId, trimmed, now]
	);
	for (const att of validAttachments) {
		await run(
			`INSERT INTO sub_reseller_ticket_attachments (message_id, file_name, mime_type, data_base64, size_bytes, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[msgResult.lastInsertRowid, att.fileName, att.mimeType, att.dataBase64, att.sizeBytes, now]
		);
	}
}

export async function closeSubResellerTicket(ticketId: number, closerResellerId: number) {
	await ensureResellerTables();
	const ticket = await queryFirst<SubResellerTicketRow>(
		`SELECT id, sub_reseller_id, parent_reseller_id, status FROM sub_reseller_tickets WHERE id = ? LIMIT 1`,
		[ticketId]
	);
	if (
		!ticket ||
		(ticket.sub_reseller_id !== closerResellerId && ticket.parent_reseller_id !== closerResellerId)
	) {
		throw new Error('تیکت پیدا نشد.');
	}
	if (ticket.status === 'closed') throw new Error('تیکت قبلاً بسته شده است.');
	await run(`UPDATE sub_reseller_tickets SET status = 'closed', closed_at = ? WHERE id = ?`, [
		nowSeconds(),
		ticketId
	]);
}

export async function deleteSubResellerTicket(ticketId: number, closerResellerId: number) {
	await ensureResellerTables();
	const ticket = await queryFirst<SubResellerTicketRow>(
		`SELECT id, sub_reseller_id, parent_reseller_id, status FROM sub_reseller_tickets WHERE id = ? LIMIT 1`,
		[ticketId]
	);
	if (
		!ticket ||
		(ticket.sub_reseller_id !== closerResellerId && ticket.parent_reseller_id !== closerResellerId)
	) {
		throw new Error('تیکت پیدا نشد.');
	}
	if (ticket.status !== 'closed') throw new Error('فقط تیکت‌های بسته‌شده قابل حذف هستند.');
	// Cascade delete
	const msgRows = await queryAll<Row & { id: number }>(
		`SELECT id FROM sub_reseller_ticket_messages WHERE ticket_id = ?`,
		[ticketId]
	);
	if (msgRows.length > 0) {
		const ids = msgRows.map((r) => r.id);
		await run(
			`DELETE FROM sub_reseller_ticket_attachments WHERE message_id IN (${ids.map(() => '?').join(',')})`,
			ids
		);
	}
	await run(`DELETE FROM sub_reseller_ticket_messages WHERE ticket_id = ?`, [ticketId]);
	await run(`DELETE FROM sub_reseller_tickets WHERE id = ?`, [ticketId]);
}

// ── Feature 14: Delete closed reseller↔manager tickets ────────────────────────

export async function deleteResellerTicket(ticketId: number, resellerId: number) {
	await ensureResellerTables();
	const ticket = await queryFirst<ResellerTicketRow>(
		`SELECT id, reseller_id, status FROM reseller_tickets WHERE id = ? LIMIT 1`,
		[ticketId]
	);
	if (!ticket || ticket.reseller_id !== resellerId) throw new Error('تیکت پیدا نشد.');
	if (ticket.status !== 'closed') throw new Error('فقط تیکت‌های بسته‌شده قابل حذف هستند.');
	const msgRows = await queryAll<Row & { id: number }>(
		`SELECT id FROM reseller_ticket_messages WHERE ticket_id = ?`,
		[ticketId]
	);
	if (msgRows.length > 0) {
		const ids = msgRows.map((r) => r.id);
		await run(
			`DELETE FROM reseller_ticket_attachments WHERE message_id IN (${ids.map(() => '?').join(',')})`,
			ids
		);
	}
	await run(`DELETE FROM reseller_ticket_messages WHERE ticket_id = ?`, [ticketId]);
	await run(`DELETE FROM reseller_tickets WHERE id = ?`, [ticketId]);
}

export async function deleteResellerTicketAsManager(ticketId: number) {
	await ensureResellerTables();
	const ticket = await queryFirst<ResellerTicketRow>(
		`SELECT id, status FROM reseller_tickets WHERE id = ? LIMIT 1`,
		[ticketId]
	);
	if (!ticket) throw new Error('تیکت پیدا نشد.');
	if (ticket.status !== 'closed') throw new Error('فقط تیکت‌های بسته‌شده قابل حذف هستند.');
	const msgRows = await queryAll<Row & { id: number }>(
		`SELECT id FROM reseller_ticket_messages WHERE ticket_id = ?`,
		[ticketId]
	);
	if (msgRows.length > 0) {
		const ids = msgRows.map((r) => r.id);
		await run(
			`DELETE FROM reseller_ticket_attachments WHERE message_id IN (${ids.map(() => '?').join(',')})`,
			ids
		);
	}
	await run(`DELETE FROM reseller_ticket_messages WHERE ticket_id = ?`, [ticketId]);
	await run(`DELETE FROM reseller_tickets WHERE id = ?`, [ticketId]);
}

// ── Feature 10: Client ↔ Seller Ticket System ─────────────────────────────────

export async function setResellerClientTicketsEnabled(resellerId: number, enabled: boolean) {
	await ensureResellerTables();
	await run(
		`UPDATE reseller_accounts SET client_tickets_enabled = ?, updated_at = ? WHERE id = ?`,
		[enabled ? 1 : 0, nowSeconds(), resellerId]
	);
}

export async function getClientTicketsByOwner(ownerResellerId: number): Promise<ClientTicket[]> {
	await ensureResellerTables();
	const rows = await queryAll<ClientTicketRow>(
		`SELECT t.id, t.client_uuid, t.owner_reseller_id, t.subject, t.status, t.created_at, t.closed_at,
		        request.xui_email AS client_email, request.customer_label AS client_label
		 FROM client_tickets t
		 LEFT JOIN reseller_requests request ON request.xui_client_uuid = t.client_uuid
		 WHERE t.owner_reseller_id = ?
		 ORDER BY t.created_at DESC, t.id DESC`,
		[ownerResellerId]
	);
	const tickets = rows.map(mapClientTicketRow);
	return attachClientTicketMessages(tickets);
}

export async function getClientTicketsByClientUuid(clientUuid: string): Promise<ClientTicket[]> {
	await ensureResellerTables();
	const rows = await queryAll<ClientTicketRow>(
		`SELECT t.id, t.client_uuid, t.owner_reseller_id, t.subject, t.status, t.created_at, t.closed_at,
		        request.xui_email AS client_email, request.customer_label AS client_label
		 FROM client_tickets t
		 LEFT JOIN reseller_requests request ON request.xui_client_uuid = t.client_uuid
		 WHERE t.client_uuid = ?
		 ORDER BY t.created_at DESC, t.id DESC`,
		[clientUuid]
	);
	const tickets = rows.map(mapClientTicketRow);
	return attachClientTicketMessages(tickets);
}

export async function createClientTicket(
	clientUuid: string,
	ownerResellerId: number | null,
	subject: string,
	message: string,
	attachments: NewTicketAttachmentInput[] = []
) {
	await ensureResellerTables();

	// Check global feature flag
	if (!(await isFeatureEnabled('client_tickets'))) {
		throw new Error('سیستم تیکت مشتریان در حال حاضر غیرفعال است.');
	}

	// Check per-reseller flag
	if (ownerResellerId !== null) {
		const owner = await queryFirst<ResellerAccountRow>(
			`SELECT client_tickets_enabled FROM reseller_accounts WHERE id = ? LIMIT 1`,
			[ownerResellerId]
		);
		if (!owner || owner.client_tickets_enabled !== 1) {
			throw new Error('سیستم تیکت توسط فروشنده فعال نشده است.');
		}
	}

	// Max 1 active ticket per client
	const existing = await queryFirst<Row & { id: number }>(
		`SELECT id FROM client_tickets WHERE client_uuid = ? AND status = 'open' LIMIT 1`,
		[clientUuid]
	);
	if (existing) throw new Error('شما یک تیکت باز دارید. لطفاً ابتدا تیکت قبلی را پیگیری کنید.');

	const trimmedSubject = subject.trim().slice(0, 128);
	const trimmedMessage = message.trim().slice(0, 2000);
	if (!trimmedSubject) throw new Error('موضوع تیکت نمی‌تواند خالی باشد.');
	if (!trimmedMessage) throw new Error('متن تیکت نمی‌تواند خالی باشد.');

	// Max 1 attachment for client tickets, max 2MB
	const clientMaxAttachmentBytes = 2 * 1024 * 1024;
	const clientAttachments = (attachments ?? []).slice(0, 1).map((att) => {
		const base64 = att.dataBase64.replace(/^data:[^;]+;base64,/, '').trim();
		const buffer = Buffer.from(base64, 'base64');
		if (buffer.length > clientMaxAttachmentBytes)
			throw new Error('حجم فایل پیوست باید کمتر از ۲ مگابایت باشد.');
		if (!isAllowedImagePayload(att.mimeType, buffer))
			throw new Error('فقط فایل تصویر معتبر قابل ارسال است.');
		return {
			fileName: sanitizeAttachmentFileName(att.fileName),
			mimeType: att.mimeType.trim().toLowerCase(),
			dataBase64: buffer.toString('base64'),
			sizeBytes: buffer.length
		};
	});

	const now = nowSeconds();
	const ticketResult = await insertAndReturnId(
		`INSERT INTO client_tickets (client_uuid, owner_reseller_id, subject, status, created_at, closed_at)
		 VALUES (?, ?, ?, 'open', ?, NULL)`,
		[clientUuid, ownerResellerId, trimmedSubject, now]
	);
	const ticketId = ticketResult.lastInsertRowid;
	const msgResult = await insertAndReturnId(
		`INSERT INTO client_ticket_messages (ticket_id, sender_type, message, created_at)
		 VALUES (?, 'client', ?, ?)`,
		[ticketId, trimmedMessage, now]
	);
	for (const att of clientAttachments) {
		await run(
			`INSERT INTO client_ticket_attachments (message_id, file_name, mime_type, data_base64, size_bytes, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[msgResult.lastInsertRowid, att.fileName, att.mimeType, att.dataBase64, att.sizeBytes, now]
		);
	}
	return ticketId;
}

export async function addClientTicketMessage(
	ticketId: number,
	clientUuid: string,
	message: string,
	attachments: NewTicketAttachmentInput[] = []
) {
	await ensureResellerTables();
	const ticket = await queryFirst<ClientTicketRow>(
		`SELECT id, client_uuid, owner_reseller_id, status FROM client_tickets WHERE id = ? LIMIT 1`,
		[ticketId]
	);
	if (!ticket || ticket.client_uuid !== clientUuid) throw new Error('تیکت پیدا نشد.');
	if (ticket.status === 'closed') throw new Error('این تیکت بسته شده است.');
	const trimmed = message.trim().slice(0, 2000);
	if (!trimmed) throw new Error('متن پیام نمی‌تواند خالی باشد.');
	const clientMaxAttachmentBytes = 2 * 1024 * 1024;
	const clientAttachments = (attachments ?? []).slice(0, 1).map((att) => {
		const base64 = att.dataBase64.replace(/^data:[^;]+;base64,/, '').trim();
		const buffer = Buffer.from(base64, 'base64');
		if (buffer.length > clientMaxAttachmentBytes)
			throw new Error('حجم فایل پیوست باید کمتر از ۲ مگابایت باشد.');
		if (!isAllowedImagePayload(att.mimeType, buffer))
			throw new Error('فقط فایل تصویر معتبر قابل ارسال است.');
		return {
			fileName: sanitizeAttachmentFileName(att.fileName),
			mimeType: att.mimeType.trim().toLowerCase(),
			dataBase64: buffer.toString('base64'),
			sizeBytes: buffer.length
		};
	});
	const now = nowSeconds();
	const msgResult = await insertAndReturnId(
		`INSERT INTO client_ticket_messages (ticket_id, sender_type, message, created_at)
		 VALUES (?, 'client', ?, ?)`,
		[ticketId, trimmed, now]
	);
	for (const att of clientAttachments) {
		await run(
			`INSERT INTO client_ticket_attachments (message_id, file_name, mime_type, data_base64, size_bytes, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[msgResult.lastInsertRowid, att.fileName, att.mimeType, att.dataBase64, att.sizeBytes, now]
		);
	}
}

export async function addSellerClientTicketMessage(
	ticketId: number,
	ownerResellerId: number,
	message: string,
	attachments: NewTicketAttachmentInput[] = []
) {
	await ensureResellerTables();
	const ticket = await queryFirst<ClientTicketRow>(
		`SELECT id, owner_reseller_id, status FROM client_tickets WHERE id = ? LIMIT 1`,
		[ticketId]
	);
	if (!ticket || ticket.owner_reseller_id !== ownerResellerId) throw new Error('تیکت پیدا نشد.');
	if (ticket.status === 'closed') throw new Error('این تیکت بسته شده است.');
	const trimmed = message.trim().slice(0, 2000);
	if (!trimmed) throw new Error('متن پیام نمی‌تواند خالی باشد.');
	const validAttachments = validateTicketAttachments(attachments);
	const now = nowSeconds();
	const msgResult = await insertAndReturnId(
		`INSERT INTO client_ticket_messages (ticket_id, sender_type, message, created_at)
		 VALUES (?, 'seller', ?, ?)`,
		[ticketId, trimmed, now]
	);
	for (const att of validAttachments) {
		await run(
			`INSERT INTO client_ticket_attachments (message_id, file_name, mime_type, data_base64, size_bytes, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[msgResult.lastInsertRowid, att.fileName, att.mimeType, att.dataBase64, att.sizeBytes, now]
		);
	}
}

export async function closeClientTicket(ticketId: number, ownerResellerId: number) {
	await ensureResellerTables();
	const ticket = await queryFirst<ClientTicketRow>(
		`SELECT id, owner_reseller_id, status FROM client_tickets WHERE id = ? LIMIT 1`,
		[ticketId]
	);
	if (!ticket || ticket.owner_reseller_id !== ownerResellerId) throw new Error('تیکت پیدا نشد.');
	if (ticket.status === 'closed') throw new Error('تیکت قبلاً بسته شده است.');
	await run(`UPDATE client_tickets SET status = 'closed', closed_at = ? WHERE id = ?`, [
		nowSeconds(),
		ticketId
	]);
}

export async function deleteClientTicket(ticketId: number, ownerResellerId: number) {
	await ensureResellerTables();
	const ticket = await queryFirst<ClientTicketRow>(
		`SELECT id, owner_reseller_id, status FROM client_tickets WHERE id = ? LIMIT 1`,
		[ticketId]
	);
	if (!ticket || ticket.owner_reseller_id !== ownerResellerId) throw new Error('تیکت پیدا نشد.');
	if (ticket.status !== 'closed') throw new Error('فقط تیکت‌های بسته‌شده قابل حذف هستند.');
	const msgRows = await queryAll<Row & { id: number }>(
		`SELECT id FROM client_ticket_messages WHERE ticket_id = ?`,
		[ticketId]
	);
	if (msgRows.length > 0) {
		const ids = msgRows.map((r) => r.id);
		await run(
			`DELETE FROM client_ticket_attachments WHERE message_id IN (${ids.map(() => '?').join(',')})`,
			ids
		);
	}
	await run(`DELETE FROM client_ticket_messages WHERE ticket_id = ?`, [ticketId]);
	await run(`DELETE FROM client_tickets WHERE id = ?`, [ticketId]);
}

// ── Feature 5: DB-based owner attribution ─────────────────────────────────────

/** Returns the reseller who owns the request for a given client UUID (or null). */
export async function getResellerOwnerByClientUuid(clientUuid: string): Promise<{
	resellerId: number;
	resellerUsername: string;
	clientTicketsEnabled: boolean;
} | null> {
	await ensureResellerTables();
	type OwnerRow = Row & { reseller_id: number; username: string; client_tickets_enabled: number };
	const row = await queryFirst<OwnerRow>(
		`SELECT r.reseller_id, ra.username, COALESCE(ra.client_tickets_enabled, 0) AS client_tickets_enabled
		 FROM reseller_requests r
		 LEFT JOIN reseller_accounts ra ON ra.id = r.reseller_id
		 WHERE r.xui_client_uuid = ? AND r.revoked_at IS NULL
		 LIMIT 1`,
		[clientUuid]
	);
	if (!row) return null;
	return {
		resellerId: row.reseller_id,
		resellerUsername: row.username ?? '',
		clientTicketsEnabled: row.client_tickets_enabled === 1
	};
}

/** Returns the reseller request snapshot for a given client UUID (or null). */
export async function getRequestByClientUuid(
	clientUuid: string
): Promise<ResellerRequestSnapshot | null> {
	await ensureResellerTables();
	const row = await queryFirst<ResellerRequestRow>(
		`SELECT id, reseller_id, plan_id, template_id, customer_label, internal_note,
		        xui_email, xui_client_uuid, xui_inbound_id,
		        quota_gb_snapshot, duration_days_snapshot, price_toman_snapshot,
		        created_at, revoked_at, settled_amount_toman, settled_payment_id
		 FROM reseller_requests WHERE xui_client_uuid = ? LIMIT 1`,
		[clientUuid]
	);
	return row ? mapRequestRow(row) : null;
}

// ── Feature 1: Password reset via email ───────────────────────────────────────

/** Creates a one-time password reset token for a reseller found by email. Returns the raw token. */
export async function createPasswordResetToken(email: string): Promise<{
	token: string;
	resellerId: number;
	username: string;
} | null> {
	await ensureResellerTables();
	const normalizedEmail = email.trim().toLowerCase();
	if (!normalizedEmail) return null;

	const account = await queryFirst<ResellerAccountRow>(
		`SELECT id, username, email FROM reseller_accounts
		 WHERE email = ? AND is_active = 1 LIMIT 1`,
		[normalizedEmail]
	);
	if (!account || !account.email) return null;

	// Expire any existing tokens for this reseller
	await run(
		`UPDATE reseller_password_reset_tokens SET used_at = ? WHERE reseller_id = ? AND used_at IS NULL`,
		[nowSeconds(), account.id]
	);

	const rawToken = randomBytes(32).toString('hex');
	const tokenHash = createHash('sha256').update(rawToken).digest('hex');
	const expiresAt = nowSeconds() + 60 * 60; // 1 hour

	await run(
		`INSERT INTO reseller_password_reset_tokens (reseller_id, token_hash, expires_at, used_at)
		 VALUES (?, ?, ?, NULL)`,
		[account.id, tokenHash, expiresAt]
	);

	return { token: rawToken, resellerId: account.id, username: account.username };
}

type PasswordResetTokenRow = Row & {
	id: number;
	reseller_id: number;
	token_hash: string;
	expires_at: number;
	used_at: number | null;
};

/** Validates a raw token and returns the associated reseller if valid. */
export async function validatePasswordResetToken(rawToken: string): Promise<{
	resellerId: number;
	tokenId: number;
} | null> {
	await ensureResellerTables();
	const tokenHash = createHash('sha256').update(rawToken).digest('hex');
	const now = nowSeconds();
	const row = await queryFirst<PasswordResetTokenRow>(
		`SELECT id, reseller_id, token_hash, expires_at, used_at
		 FROM reseller_password_reset_tokens
		 WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
		 LIMIT 1`,
		[tokenHash, now]
	);
	if (!row) return null;
	return { resellerId: row.reseller_id, tokenId: row.id };
}

/** Marks the token as used and updates the reseller's password. */
export async function consumePasswordResetToken(
	rawToken: string,
	newPassword: string
): Promise<void> {
	await ensureResellerTables();
	const validation = await validatePasswordResetToken(rawToken);
	if (!validation) throw new Error('لینک بازیابی رمز عبور نامعتبر یا منقضی شده است.');

	const { resellerId, tokenId } = validation;
	const trimmedPassword = newPassword.trim();
	if (trimmedPassword.length < 6) throw new Error('رمز عبور باید حداقل ۶ کاراکتر باشد.');

	const passwordHash = await hashSecret(trimmedPassword);
	const now = nowSeconds();

	await run(
		`UPDATE reseller_accounts SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?`,
		[passwordHash, now, resellerId]
	);
	await run(`UPDATE reseller_password_reset_tokens SET used_at = ? WHERE id = ?`, [now, tokenId]);
	await run('DELETE FROM reseller_sessions WHERE reseller_id = ?', [resellerId]);
}

// ── Feature 4: Manager/reseller manage configs from user panel ─────────────────

/** Manager renews (recharges) any config without GB balance requirement. */
export async function managerRenewConfig(requestId: number, fallbackHost?: string) {
	await ensureResellerTables();
	const request = await getRequestById(requestId);
	if (!request) throw new Error('درخواست موردنظر پیدا نشد.');
	if (request.revokedAt) throw new Error('کانفیگ لغوشده قابل تمدید نیست.');

	const expiresAtMs = Date.now() + request.durationDaysSnapshot * 24 * 60 * 60 * 1000;
	const email = await updateVpnClient({
		inboundId: request.xuiInboundId,
		uuid: request.xuiClientUuid,
		totalBytes: Math.round(request.quotaGbSnapshot * 1024 ** 3),
		expiryTime: expiresAtMs,
		enable: true
	});
	await resetVpnClientTraffic(email);

	const liveAfter = await getVpnClientUsageMap(fallbackHost, { includeOnlineStatus: true });
	return liveAfter.get(request.xuiClientUuid) ?? null;
}

/** Manager enables or disables any config. */
export async function managerToggleConfig(requestId: number, enabled: boolean) {
	await ensureResellerTables();
	const request = await getRequestById(requestId);
	if (!request) throw new Error('درخواست موردنظر پیدا نشد.');
	if (request.revokedAt) throw new Error('کانفیگ لغوشده قابل تغییر وضعیت نیست.');
	await setVpnClientEnabled(request.xuiInboundId, request.xuiClientUuid, enabled);
}

/** Manager adds quota (GB) to an existing config without resetting traffic. */
export async function managerAddQuota(requestId: number, addGb: number, fallbackHost?: string) {
	await ensureResellerTables();
	if (!Number.isFinite(addGb) || addGb <= 0)
		throw new Error('مقدار گیگابایت اضافه‌شده نامعتبر است.');
	const request = await getRequestById(requestId);
	if (!request) throw new Error('درخواست موردنظر پیدا نشد.');
	if (request.revokedAt) throw new Error('کانفیگ لغوشده قابل تغییر نیست.');

	const liveMap = await getVpnClientUsageMap(fallbackHost, { includeOnlineStatus: false });
	const liveUsage = liveMap.get(request.xuiClientUuid);
	if (!liveUsage) throw new Error('کانفیگ در x-ui پیدا نشد.');

	const currentTotalBytes = liveUsage.totalBytes ?? 0;
	const newTotalBytes = currentTotalBytes + Math.round(addGb * 1024 ** 3);

	await updateVpnClient({
		inboundId: request.xuiInboundId,
		uuid: request.xuiClientUuid,
		totalBytes: newTotalBytes,
		expiryTime: liveUsage.expiresAt
			? new Date(liveUsage.expiresAt).getTime()
			: Date.now() + 30 * 24 * 60 * 60 * 1000
	});
}

/** Manager extends expiry duration of an existing config. */
export async function managerExtendDuration(
	requestId: number,
	addDays: number,
	fallbackHost?: string
) {
	await ensureResellerTables();
	if (!Number.isFinite(addDays) || addDays <= 0)
		throw new Error('تعداد روزهای افزوده‌شده نامعتبر است.');
	const request = await getRequestById(requestId);
	if (!request) throw new Error('درخواست موردنظر پیدا نشد.');
	if (request.revokedAt) throw new Error('کانفیگ لغوشده قابل تغییر نیست.');

	const liveMap = await getVpnClientUsageMap(fallbackHost, { includeOnlineStatus: false });
	const liveUsage = liveMap.get(request.xuiClientUuid);
	if (!liveUsage) throw new Error('کانفیگ در x-ui پیدا نشد.');

	const currentExpiresAtMs = liveUsage.expiresAt
		? new Date(liveUsage.expiresAt).getTime()
		: Date.now();
	const newExpiresAtMs = currentExpiresAtMs + addDays * 24 * 60 * 60 * 1000;

	await updateVpnClient({
		inboundId: request.xuiInboundId,
		uuid: request.xuiClientUuid,
		totalBytes: liveUsage.totalBytes ?? 0,
		expiryTime: newExpiresAtMs
	});
}

/** Reseller renews their own config (uses GB balance). */
export async function resellerRenewConfig(
	resellerId: number,
	requestId: number,
	origin: string,
	fallbackHost?: string
) {
	// Delegates to existing rechargeResellerRequest
	return rechargeResellerRequest(resellerId, requestId, origin, fallbackHost);
}

/** Reseller enables or disables their own config. */
export async function resellerToggleConfig(
	resellerId: number,
	requestId: number,
	enabled: boolean
) {
	await ensureResellerTables();
	const request = await getRequestById(requestId);
	if (!request || request.resellerId !== resellerId) throw new Error('درخواست موردنظر پیدا نشد.');
	if (request.revokedAt) throw new Error('کانفیگ لغوشده قابل تغییر وضعیت نیست.');
	await setVpnClientEnabled(request.xuiInboundId, request.xuiClientUuid, enabled);
}

async function attachClientTicketMessages(tickets: ClientTicket[]) {
	if (tickets.length === 0) return tickets;
	const ticketIds = tickets.map((t) => t.id);
	const placeholders = ticketIds.map(() => '?').join(', ');
	const messageRows = await queryAll<ClientTicketMessageRow>(
		`SELECT id, ticket_id, sender_type, message, created_at
		 FROM client_ticket_messages
		 WHERE ticket_id IN (${placeholders})
		 ORDER BY created_at ASC, id ASC`,
		ticketIds
	);
	const messageIds = messageRows.map((m) => m.id);
	const attachmentRows =
		messageIds.length === 0
			? []
			: await queryAll<ClientTicketAttachmentRow>(
					`SELECT id, message_id, file_name, mime_type, data_base64, size_bytes, created_at
		 FROM client_ticket_attachments
		 WHERE message_id IN (${messageIds.map(() => '?').join(', ')})
		 ORDER BY id ASC`,
					messageIds
				);
	const attachmentsByMessageId = new Map<number, ClientTicketAttachment[]>();
	for (const a of attachmentRows.map(mapClientTicketAttachmentRow)) {
		const arr = attachmentsByMessageId.get(a.messageId) ?? [];
		arr.push(a);
		attachmentsByMessageId.set(a.messageId, arr);
	}
	const messagesByTicketId = new Map<number, ClientTicketMessage[]>();
	for (const row of messageRows) {
		const msg = mapClientTicketMessageRow(row, attachmentsByMessageId);
		const arr = messagesByTicketId.get(msg.ticketId) ?? [];
		arr.push(msg);
		messagesByTicketId.set(msg.ticketId, arr);
	}
	return tickets.map((t) => ({ ...t, messages: messagesByTicketId.get(t.id) ?? [] }));
}
