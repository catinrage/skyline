import { createClient, type Client, type InArgs, type Row } from '@libsql/client';
import { env } from '$env/dynamic/private';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { logger } from '$lib/server/logger';
import type { Cookies } from '@sveltejs/kit';

const databasePath = resolve(process.cwd(), 'data', 'skyline.sqlite');
const databaseUrl = pathToFileURL(databasePath).href;
const defaultAdminUsername = 'admin';
const sessionCookieName = 'skyline_admin_session';
const sessionLifetimeSeconds = 60 * 60 * 24 * 30;
const scrypt = promisify(scryptCallback);

type FeatureFlagDefinition = {
	key:
		| 'proxy_ping'
		| 'speed_test_widget'
		| 'config_issue_report'
		| 'client_apps_links'
		| 'online_status'
		| 'reseller_sales'
		| 'client_tickets';
	label: string;
	description: string;
	group: 'operation' | 'user_panel' | 'sales';
};

export type ClientAppOs = 'android' | 'ios' | 'windows' | 'linux';

const defaultClientAppLinks: Array<{ name: string; downloadUrl: string; os: ClientAppOs }> = [];

export type ClientAppLink = {
	name: string;
	downloadUrl: string;
	os: ClientAppOs;
	/** Filename on disk inside data/client-apps/. Set only for server-hosted uploads. */
	uploadedFileName?: string;
};

export type VlessRewriteFingerprint = 'firefox' | 'chrome' | 'safari' | 'ios' | 'android';

export type VlessRewriteRule = {
	targetInboundId: number | null;
	enabled: boolean;
	address: string;
	port: number;
	tlsEnabled: boolean;
	sni: string;
	fingerprint: VlessRewriteFingerprint;
};

export type PanelPathSettings = {
	managerBasePath: string;
	resellerBasePath: string;
};

export type FeatureSettings = {
	configIssueReportCooldownMinutes: number;
	latencyTestTargetUrl: string;
	speedTestTargetUrl: string;
};

export type RuntimeSettings = {
	xuiPanelUrl: string;
	xuiApiToken: string;
	xuiPublicHost: string;
	xrayBinaryPath: string;
	logLevel: 'debug' | 'info' | 'warning' | 'error';
	logFile: string;
};

const defaultFeatureSettings: FeatureSettings = {
	configIssueReportCooldownMinutes: 1,
	latencyTestTargetUrl: 'https://www.gstatic.com/generate_204',
	speedTestTargetUrl: 'http://ipv4.download.thinkbroadband.com/20MB.zip'
};

const defaultRuntimeSettings: RuntimeSettings = {
	xuiPanelUrl: env.XUI_PANEL_URL?.trim() ?? '',
	xuiApiToken: env.XUI_API_TOKEN?.trim().replace(/^"(.*)"$/, '$1') ?? '',
	xuiPublicHost: env.XUI_PUBLIC_HOST?.trim() ?? '',
	xrayBinaryPath: env.XRAY_BINARY_PATH?.trim() || '/usr/local/x-ui/bin/xray-linux-amd64',
	logLevel: normalizeRuntimeLogLevel(env.LOG_LEVEL),
	logFile: env.LOG_FILE?.trim() ?? ''
};

function normalizeRuntimeLogLevel(value: string | undefined): RuntimeSettings['logLevel'] {
	const normalized = value?.trim().toLowerCase();
	if (normalized === 'debug' || normalized === 'info' || normalized === 'error') return normalized;
	return 'warning';
}

function normalizeClientAppOs(value: unknown): ClientAppOs {
	if (value === 'ios' || value === 'windows' || value === 'linux') return value;
	return 'android';
}

const reservedPanelBasePaths = new Set([
	'api',
	'build',
	'healthz',
	'manage',
	'manager',
	'reseller',
	'robots.txt',
	'user',
	'_app'
]);

export const featureFlagDefinitions: readonly FeatureFlagDefinition[] = [
	{
		key: 'proxy_ping',
		label: 'تست تاخیر کانفیگ',
		description:
			'اجازه می‌دهد کاربر از داخل پنل، تاخیر واقعی اتصال کانفیگ را از سمت سرور بررسی کند.',
		group: 'operation'
	},
	{
		key: 'speed_test_widget',
		label: 'ویجت تست سرعت',
		description:
			'نمایش ابزار تست سرعت داخل پنل کاربر را فعال می‌کند.',
		group: 'operation'
	},
	{
		key: 'config_issue_report',
		label: 'گزارش قطعی',
		description:
			'اجازه می‌دهد کاربر از کنار وضعیت کانفیگ، گزارش قطعی را برای مدیر ارسال کند و مدیر آن را در پنل مدیریت ببیند.',
		group: 'operation'
	},
	{
		key: 'client_apps_links',
		label: 'لینک برنامه‌های کلاینت',
		description:
			'بخش دانلود برنامه‌های کلاینت را در پنل کاربر فعال می‌کند تا کاربر لینک برنامه‌های پیشنهادی را ببیند.',
		group: 'user_panel'
	},
	{
		key: 'online_status',
		label: 'وضعیت آنلاین',
		description:
			'وضعیت آنلاین یا آفلاین کاربر را در پنل نمایش می‌دهد و در حالت آفلاین، آخرین زمان اتصال را به‌صورت نسبی نشان می‌دهد.',
		group: 'user_panel'
	},
	{
		key: 'reseller_sales',
		label: 'فروش فروشندگان',
		description:
			'اگر غیرفعال شود، فروشندگان دیگر نمی‌توانند کانفیگ جدید بسازند یا کانفیگ‌های قبلی را شارژ مجدد کنند.',
		group: 'sales'
	},
	{
		key: 'client_tickets',
		label: 'تیکت مشتریان',
		description:
			'سیستم تیکت‌گذاری مشتری به فروشنده را فعال می‌کند. فروشندگانی که این قابلیت برایشان فعال شده، می‌توانند از مشتریان خود پشتیبانی درون‌برنامه‌ای دریافت کنند.',
		group: 'sales'
	}
] as const;

export type FeatureFlagKey = FeatureFlagDefinition['key'];

let db: Client | null = null;
let passkeyInitializationPromise: Promise<void> | null = null;
const adminLogger = logger.child('admin');

mkdirSync(dirname(databasePath), { recursive: true });

function sha256(value: string) {
	return createHash('sha256').update(value).digest('hex');
}

async function getDatabase() {
	if (!db) {
		db = createClient({
			url: databaseUrl,
			intMode: 'number'
		});

		await db.executeMultiple(`
			CREATE TABLE IF NOT EXISTS admin_settings (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);

			CREATE TABLE IF NOT EXISTS admin_sessions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				token_hash TEXT NOT NULL UNIQUE,
				expires_at INTEGER NOT NULL
			);

			CREATE TABLE IF NOT EXISTS feature_flags (
				key TEXT PRIMARY KEY,
				enabled INTEGER NOT NULL DEFAULT 0
			);

			CREATE TABLE IF NOT EXISTS latency_test_log (
				uuid TEXT PRIMARY KEY,
				last_tested_at INTEGER NOT NULL
			);

			CREATE TABLE IF NOT EXISTS config_issue_report_log (
				uuid TEXT PRIMARY KEY,
				last_reported_at INTEGER NOT NULL
			);

			CREATE TABLE IF NOT EXISTS config_issue_reports (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				uuid TEXT NOT NULL,
				email TEXT NOT NULL,
				created_at INTEGER NOT NULL
			);
		`);
		await ensureConfigIssueReportColumns(db);
		await ensureAdminSessionColumns(db);
		adminLogger.info('Opened SQLite database.', { databasePath, databaseUrl });
	}

	return db;
}

export function closeAdminDatabase() {
	if (db) {
		db.close();
		db = null;
	}
}

async function execute(sql: string, args?: InArgs) {
	const database = await getDatabase();
	return database.execute(args ? { sql, args } : sql);
}

async function queryFirst<T>(sql: string, args?: InArgs) {
	const result = await execute(sql, args);
	return (result.rows[0] as T | undefined) ?? null;
}

async function queryAll<T>(sql: string, args?: InArgs) {
	const result = await execute(sql, args);
	return result.rows as T[];
}

async function ensureConfigIssueReportColumns(database: Client) {
	const columns = await database.execute('PRAGMA table_info(config_issue_reports)');
	const names = new Set(columns.rows.map((row) => String(row.name)));

	if (!names.has('message')) {
		await database.execute('ALTER TABLE config_issue_reports ADD COLUMN message TEXT NOT NULL DEFAULT ""');
	}

	if (!names.has('status')) {
		await database.execute('ALTER TABLE config_issue_reports ADD COLUMN status TEXT NOT NULL DEFAULT "open"');
	}

	if (!names.has('resolved_at')) {
		await database.execute('ALTER TABLE config_issue_reports ADD COLUMN resolved_at INTEGER');
	}
}

async function ensureAdminSessionColumns(database: Client) {
	const columns = await database.execute('PRAGMA table_info(admin_sessions)');
	const names = new Set(columns.rows.map((row) => String(row.name)));
	if (!names.has('created_at')) await database.execute('ALTER TABLE admin_sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0');
	if (!names.has('last_used_at')) await database.execute('ALTER TABLE admin_sessions ADD COLUMN last_used_at INTEGER NOT NULL DEFAULT 0');
	if (!names.has('user_agent')) await database.execute('ALTER TABLE admin_sessions ADD COLUMN user_agent TEXT NOT NULL DEFAULT ""');
}

async function run(sql: string, args?: InArgs) {
	await execute(sql, args);
}

async function getSetting(key: string) {
	const row = await queryFirst<Row & { value: string }>(
		'SELECT value FROM admin_settings WHERE key = ?',
		[key]
	);

	return row?.value ?? null;
}

async function setSetting(key: string, value: string) {
	await run(
		`
		INSERT INTO admin_settings (key, value)
		VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value
	`,
		[key, value]
	);
}

async function hashPasskey(passkey: string) {
	const salt = randomBytes(16);
	const derivedKey = (await scrypt(passkey, salt, 64)) as Buffer;

	return `scrypt$${salt.toString('base64')}$${derivedKey.toString('base64')}`;
}

async function verifyPasskey(passkey: string, hash: string) {
	const [algorithm, saltBase64, keyBase64] = hash.split('$');

	if (algorithm !== 'scrypt' || !saltBase64 || !keyBase64) {
		adminLogger.warn('Encountered unsupported admin passkey hash format.', {
			algorithm: algorithm || 'unknown'
		});
		return false;
	}

	const salt = Buffer.from(saltBase64, 'base64');
	const storedKey = Buffer.from(keyBase64, 'base64');
	const derivedKey = (await scrypt(passkey, salt, storedKey.length)) as Buffer;

	return timingSafeEqual(storedKey, derivedKey);
}

async function ensurePasskeyInitialized() {
	if (!(await getSetting('admin_username'))) {
		await setSetting('admin_username', defaultAdminUsername);
	}

	if (await getSetting('passkey_hash')) {
		return;
	}

	if (!passkeyInitializationPromise) {
		passkeyInitializationPromise = (async () => {
			const generated = randomBytes(8).toString('hex');
			const hash = await hashPasskey(generated);
			if (!(await getSetting('passkey_hash'))) {
				await setSetting('passkey_hash', hash);
				adminLogger.warn('Admin passkey initialized with a generated value. Change it immediately.', {
					generatedPasskey: generated
				});
			}
		})();
	}

	await passkeyInitializationPromise;
}

async function ensureFeatureFlagsInitialized() {
	for (const feature of featureFlagDefinitions) {
		await run(
			`
			INSERT INTO feature_flags (key, enabled)
			VALUES (?, ?)
			ON CONFLICT(key) DO NOTHING
		`,
			[feature.key, feature.key === 'reseller_sales' ? 1 : 0]
		);
	}
}

async function purgeExpiredSessions() {
	await run('DELETE FROM admin_sessions WHERE expires_at <= ?', [Math.floor(Date.now() / 1000)]);
}

async function deleteSession(tokenHash: string) {
	await run('DELETE FROM admin_sessions WHERE token_hash = ?', [tokenHash]);
}

function setSessionCookie(cookies: Cookies, token: string) {
	cookies.set(sessionCookieName, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		maxAge: sessionLifetimeSeconds
	});
}

export async function authenticateAdmin(username: string, passkey: string) {
	await ensurePasskeyInitialized();
	const storedUsername = ((await getSetting('admin_username')) ?? defaultAdminUsername).trim().toLowerCase();

	if (username.trim().toLowerCase() !== storedUsername) {
		return false;
	}

	const hash = await getSetting('passkey_hash');

	if (!hash) {
		return false;
	}

	return verifyPasskey(passkey, hash);
}

export async function updateAdminPasskey(nextPasskey: string) {
	await ensurePasskeyInitialized();
	const hash = await hashPasskey(nextPasskey);
	await setSetting('passkey_hash', hash);
	adminLogger.warn('Admin passkey updated.');
}

export async function getAdminUsername() {
	await ensurePasskeyInitialized();
	return (await getSetting('admin_username')) ?? defaultAdminUsername;
}

export async function updateAdminUsername(username: string) {
	const normalized = username.trim().toLowerCase();

	if (!normalized || normalized.length > 64) {
		throw new Error('نام کاربری مدیریت نامعتبر است.');
	}

	await setSetting('admin_username', normalized);
	adminLogger.warn('Admin username updated.');
}

export async function getUserPanelMessage() {
	await ensurePasskeyInitialized();
	return (await getSetting('user_panel_message')) ?? '';
}

export async function updateUserPanelMessage(message: string) {
	await ensurePasskeyInitialized();
	await setSetting('user_panel_message', message);
}

export async function getResellerPanelMessage() {
	await ensurePasskeyInitialized();
	return (await getSetting('reseller_panel_message')) ?? '';
}

export async function updateResellerPanelMessage(message: string) {
	await ensurePasskeyInitialized();
	await setSetting('reseller_panel_message', message);
}

export async function getClientAppLinks() {
	await ensurePasskeyInitialized();

	const raw = await getSetting('client_apps_links');
	if (!raw) {
		return [...defaultClientAppLinks];
	}

	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return [...defaultClientAppLinks];
		}

		return parsed
			.filter(
				(item): item is { name: string; downloadUrl: string; os?: unknown; uploadedFileName?: unknown } =>
					typeof item === 'object' &&
					item !== null &&
					'name' in item &&
					typeof item.name === 'string' &&
					'downloadUrl' in item &&
					typeof item.downloadUrl === 'string'
			)
			.map((item) => ({
				name: item.name.trim(),
				downloadUrl: item.downloadUrl.trim(),
				os: normalizeClientAppOs(item.os),
				...(typeof item.uploadedFileName === 'string' ? { uploadedFileName: item.uploadedFileName } : {})
			}));
	} catch (error) {
		adminLogger.error('Failed to parse client app links setting.', {
			error: error instanceof Error ? error : undefined
		});
		return [...defaultClientAppLinks];
	}
}

export async function updateClientAppLinks(links: ClientAppLink[]) {
	await ensurePasskeyInitialized();

	const normalized = links.map((item) => ({
		name: item.name.trim(),
		downloadUrl: item.downloadUrl.trim(),
		os: normalizeClientAppOs(item.os),
		...(item.uploadedFileName ? { uploadedFileName: item.uploadedFileName } : {})
	}));

	await setSetting('client_apps_links', JSON.stringify(normalized));
	adminLogger.warn('Updated client app links.', {
		count: normalized.length
	});
}

function isVlessRewriteFingerprint(value: unknown): value is VlessRewriteFingerprint {
	return (
		value === 'firefox' ||
		value === 'chrome' ||
		value === 'safari' ||
		value === 'ios' ||
		value === 'android'
	);
}

export async function getVlessRewriteRules(): Promise<VlessRewriteRule[]> {
	await ensurePasskeyInitialized();

	const raw = await getSetting('vless_rewrite_rules');
	if (!raw) {
		return [];
	}

	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed
			.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
			.map((item) => {
				const targetInboundId =
					typeof item.targetInboundId === 'number' && Number.isInteger(item.targetInboundId)
						? item.targetInboundId
						: null;
				const port = typeof item.port === 'number' && Number.isInteger(item.port) ? item.port : 443;
				const fingerprint = isVlessRewriteFingerprint(item.fingerprint)
					? item.fingerprint
					: 'firefox';

				return {
					targetInboundId,
					enabled: item.enabled !== false,
					address: typeof item.address === 'string' ? item.address.trim() : '',
					port,
					tlsEnabled: item.tlsEnabled === true,
					sni: typeof item.sni === 'string' ? item.sni.trim() : '',
					fingerprint
				};
			})
			.filter((rule) => rule.address.length > 0 && rule.port >= 1 && rule.port <= 65535);
	} catch (error) {
		adminLogger.error('Failed to parse VLESS rewrite rules setting.', {
			error: error instanceof Error ? error : undefined
		});
		return [];
	}
}

export async function updateVlessRewriteRules(rules: VlessRewriteRule[]) {
	await ensurePasskeyInitialized();

	const normalized = rules.map((rule) => ({
		targetInboundId: rule.targetInboundId,
		enabled: rule.enabled,
		address: rule.address.trim(),
		port: rule.port,
		tlsEnabled: rule.tlsEnabled,
		sni: rule.tlsEnabled ? rule.sni.trim() : '',
		fingerprint: rule.tlsEnabled ? rule.fingerprint : 'firefox'
	}));

	await setSetting('vless_rewrite_rules', JSON.stringify(normalized));
	adminLogger.warn('Updated VLESS rewrite rules.', {
		count: normalized.length
	});
}

export function normalizePanelBasePath(value: string) {
	return value.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
}

export function validatePanelBasePath(value: string) {
	const normalized = normalizePanelBasePath(value);

	if (!normalized) {
		return '';
	}

	if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(normalized)) {
		throw new Error(
			'مسیر مخفی باید ۳ تا ۶۴ کاراکتر و فقط شامل حروف انگلیسی کوچک، عدد، خط تیره یا _ باشد.'
		);
	}

	if (reservedPanelBasePaths.has(normalized)) {
		throw new Error('این مسیر برای بخش‌های داخلی Skyline رزرو شده است.');
	}

	return normalized;
}

export async function getPanelPathSettings(): Promise<PanelPathSettings> {
	await ensurePasskeyInitialized();

	return {
		managerBasePath: normalizePanelBasePath((await getSetting('manager_base_path')) ?? ''),
		resellerBasePath: normalizePanelBasePath((await getSetting('reseller_base_path')) ?? '')
	};
}

export async function updatePanelPathSettings(settings: PanelPathSettings) {
	await ensurePasskeyInitialized();

	const managerBasePath = validatePanelBasePath(settings.managerBasePath);
	const resellerBasePath = validatePanelBasePath(settings.resellerBasePath);

	if (managerBasePath && resellerBasePath && managerBasePath === resellerBasePath) {
		throw new Error('مسیر مخفی مدیریت و فروشنده نباید یکسان باشد.');
	}

	await setSetting('manager_base_path', managerBasePath);
	await setSetting('reseller_base_path', resellerBasePath);
	adminLogger.warn('Updated protected panel paths.', {
		managerConfigured: managerBasePath.length > 0,
		resellerConfigured: resellerBasePath.length > 0
	});
}

export async function isDefaultManagerPathAllowed() {
	const settings = await getPanelPathSettings();
	return settings.managerBasePath.length === 0;
}

export async function isDefaultResellerPathAllowed() {
	const settings = await getPanelPathSettings();
	return settings.resellerBasePath.length === 0;
}

export async function isHiddenManagerPathAllowed(basePath: string) {
	const settings = await getPanelPathSettings();
	return settings.managerBasePath.length > 0 && normalizePanelBasePath(basePath) === settings.managerBasePath;
}

export async function isHiddenResellerPathAllowed(basePath: string) {
	const settings = await getPanelPathSettings();
	return (
		settings.resellerBasePath.length > 0 &&
		normalizePanelBasePath(basePath) === settings.resellerBasePath
	);
}

export async function getFeatureFlags() {
	await ensurePasskeyInitialized();
	await ensureFeatureFlagsInitialized();

	const rows = await queryAll<
		Row & {
			key: string;
			enabled: number;
		}
	>('SELECT key, enabled FROM feature_flags');
	const enabledMap = new Map(rows.map((row) => [row.key, row.enabled === 1]));

	return featureFlagDefinitions.map((feature) => ({
		...feature,
		enabled: enabledMap.get(feature.key) ?? false
	}));
}

function normalizeFeatureSettings(settings: Partial<FeatureSettings>): FeatureSettings {
	const cooldown = Number(settings.configIssueReportCooldownMinutes);
	const latencyTestTargetUrl = String(settings.latencyTestTargetUrl ?? '').trim();
	const speedTestTargetUrl = String(settings.speedTestTargetUrl ?? '').trim();

	return {
		configIssueReportCooldownMinutes:
			Number.isInteger(cooldown) && cooldown >= 1 && cooldown <= 1440
				? cooldown
				: defaultFeatureSettings.configIssueReportCooldownMinutes,
		latencyTestTargetUrl: latencyTestTargetUrl || defaultFeatureSettings.latencyTestTargetUrl,
		speedTestTargetUrl: speedTestTargetUrl || defaultFeatureSettings.speedTestTargetUrl
	};
}

export async function getFeatureSettings() {
	await ensurePasskeyInitialized();

	return normalizeFeatureSettings({
		configIssueReportCooldownMinutes: Number(
			(await getSetting('config_issue_report_cooldown_minutes')) ??
				defaultFeatureSettings.configIssueReportCooldownMinutes
		),
		latencyTestTargetUrl:
			(await getSetting('latency_test_target_url')) ?? defaultFeatureSettings.latencyTestTargetUrl,
		speedTestTargetUrl:
			(await getSetting('speed_test_target_url')) ?? defaultFeatureSettings.speedTestTargetUrl
	});
}

export async function updateFeatureSettings(settings: FeatureSettings) {
	await ensurePasskeyInitialized();
	const normalized = normalizeFeatureSettings(settings);

	await setSetting(
		'config_issue_report_cooldown_minutes',
		String(normalized.configIssueReportCooldownMinutes)
	);
	await setSetting('latency_test_target_url', normalized.latencyTestTargetUrl);
	await setSetting('speed_test_target_url', normalized.speedTestTargetUrl);
	adminLogger.warn('Updated feature settings.', normalized);
}

function normalizeRuntimeSettings(settings: Partial<RuntimeSettings>): RuntimeSettings {
	const logLevel = normalizeRuntimeLogLevel(settings.logLevel);

	return {
		xuiPanelUrl: String(settings.xuiPanelUrl ?? '').trim(),
		xuiApiToken: String(settings.xuiApiToken ?? '').trim(),
		xuiPublicHost: String(settings.xuiPublicHost ?? '').trim(),
		xrayBinaryPath:
			String(settings.xrayBinaryPath ?? '').trim() || defaultRuntimeSettings.xrayBinaryPath,
		logLevel,
		logFile: String(settings.logFile ?? '').trim()
	};
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
	await ensurePasskeyInitialized();

	const settings = normalizeRuntimeSettings({
		xuiPanelUrl: (await getSetting('runtime_xui_panel_url')) ?? defaultRuntimeSettings.xuiPanelUrl,
		xuiApiToken: (await getSetting('runtime_xui_api_token')) ?? defaultRuntimeSettings.xuiApiToken,
		xuiPublicHost: (await getSetting('runtime_xui_public_host')) ?? defaultRuntimeSettings.xuiPublicHost,
		xrayBinaryPath:
			(await getSetting('runtime_xray_binary_path')) ?? defaultRuntimeSettings.xrayBinaryPath,
		logLevel: ((await getSetting('runtime_log_level')) ??
			defaultRuntimeSettings.logLevel) as RuntimeSettings['logLevel'],
		logFile: (await getSetting('runtime_log_file')) ?? defaultRuntimeSettings.logFile
	});

	logger.configure({ level: settings.logLevel, filePath: settings.logFile });
	return settings;
}

export async function updateRuntimeSettings(settings: RuntimeSettings) {
	await ensurePasskeyInitialized();
	const normalized = normalizeRuntimeSettings(settings);

	await setSetting('runtime_xui_panel_url', normalized.xuiPanelUrl);
	await setSetting('runtime_xui_api_token', normalized.xuiApiToken);
	await setSetting('runtime_xui_public_host', normalized.xuiPublicHost);
	await setSetting('runtime_xray_binary_path', normalized.xrayBinaryPath);
	await setSetting('runtime_log_level', normalized.logLevel);
	await setSetting('runtime_log_file', normalized.logFile);
	logger.configure({ level: normalized.logLevel, filePath: normalized.logFile });
	adminLogger.warn('Updated runtime settings.', {
		xuiPanelUrl: normalized.xuiPanelUrl,
		xuiPublicHost: normalized.xuiPublicHost,
		xrayBinaryPath: normalized.xrayBinaryPath,
		logLevel: normalized.logLevel,
		logFile: normalized.logFile,
		tokenConfigured: Boolean(normalized.xuiApiToken)
	});
}

// ── SMTP Settings ─────────────────────────────────────────────────────────────

export type SmtpSettings = {
	host: string;
	port: number;
	secure: boolean;
	username: string;
	password: string;
	fromAddress: string;
	fromName: string;
};

export async function getSmtpSettings(): Promise<SmtpSettings> {
	await ensurePasskeyInitialized();
	return {
		host: (await getSetting('smtp_host')) ?? '',
		port: Number((await getSetting('smtp_port')) ?? '587') || 587,
		secure: (await getSetting('smtp_secure')) === '1',
		username: (await getSetting('smtp_username')) ?? '',
		password: (await getSetting('smtp_password')) ?? '',
		fromAddress: (await getSetting('smtp_from_address')) ?? '',
		fromName: (await getSetting('smtp_from_name')) ?? 'Skyline'
	};
}

export async function updateSmtpSettings(settings: SmtpSettings): Promise<void> {
	await ensurePasskeyInitialized();
	await setSetting('smtp_host', settings.host.trim());
	await setSetting('smtp_port', String(settings.port || 587));
	await setSetting('smtp_secure', settings.secure ? '1' : '0');
	await setSetting('smtp_username', settings.username.trim());
	await setSetting('smtp_password', settings.password);
	await setSetting('smtp_from_address', settings.fromAddress.trim());
	await setSetting('smtp_from_name', settings.fromName.trim() || 'Skyline');
	adminLogger.warn('Updated SMTP settings.', { fromAddress: settings.fromAddress, host: settings.host });
}

export async function isFeatureEnabled(key: FeatureFlagKey) {
	await ensurePasskeyInitialized();
	await ensureFeatureFlagsInitialized();

	const row = await queryFirst<
		Row & {
			enabled: number;
		}
	>('SELECT enabled FROM feature_flags WHERE key = ? LIMIT 1', [key]);

	const enabled = row?.enabled === 1;
	if (!enabled) {
		return false;
	}

	return true;
}

export async function setFeatureFlag(key: FeatureFlagKey, enabled: boolean) {
	await ensurePasskeyInitialized();
	await ensureFeatureFlagsInitialized();

	await run(
		`
		INSERT INTO feature_flags (key, enabled)
		VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled
	`,
		[key, enabled ? 1 : 0]
	);
	adminLogger.warn('Feature flag changed.', { key, enabled });
}

export async function checkLatencyTestCooldown(uuid: string, cooldownSeconds = 10) {
	await ensurePasskeyInitialized();

	const row = await queryFirst<
		Row & {
			last_tested_at: number;
		}
	>('SELECT last_tested_at FROM latency_test_log WHERE uuid = ? LIMIT 1', [uuid]);
	const now = Math.floor(Date.now() / 1000);

	if (!row) {
		return {
			allowed: true,
			retryAfter: 0
		};
	}

	const elapsed = now - row.last_tested_at;
	if (elapsed >= cooldownSeconds) {
		return {
			allowed: true,
			retryAfter: 0
		};
	}

	return {
		allowed: false,
		retryAfter: cooldownSeconds - elapsed
	};
}

export async function recordLatencyTest(uuid: string) {
	await ensurePasskeyInitialized();

	await run(
		`
		INSERT INTO latency_test_log (uuid, last_tested_at)
		VALUES (?, ?)
		ON CONFLICT(uuid) DO UPDATE SET last_tested_at = excluded.last_tested_at
	`,
		[uuid, Math.floor(Date.now() / 1000)]
	);
}

export async function checkConfigIssueReportCooldown(uuid: string, cooldownSeconds = 60) {
	await ensurePasskeyInitialized();

	const row = await queryFirst<
		Row & {
			last_reported_at: number;
		}
	>('SELECT last_reported_at FROM config_issue_report_log WHERE uuid = ? LIMIT 1', [uuid]);
	const now = Math.floor(Date.now() / 1000);

	if (!row) {
		return {
			allowed: true,
			retryAfter: 0
		};
	}

	const elapsed = now - row.last_reported_at;
	if (elapsed >= cooldownSeconds) {
		return {
			allowed: true,
			retryAfter: 0
		};
	}

	return {
		allowed: false,
		retryAfter: cooldownSeconds - elapsed
	};
}

export async function createConfigIssueReport(uuid: string, email: string, message = '') {
	await ensurePasskeyInitialized();

	const now = Math.floor(Date.now() / 1000);

	await run(
		`
		INSERT INTO config_issue_reports (uuid, email, message, status, created_at)
		VALUES (?, ?, ?, 'open', ?)
	`,
		[uuid, email, message.trim(), now]
	);

	await run(
		`
		INSERT INTO config_issue_report_log (uuid, last_reported_at)
		VALUES (?, ?)
		ON CONFLICT(uuid) DO UPDATE SET last_reported_at = excluded.last_reported_at
	`,
		[uuid, now]
	);
}

export async function getConfigIssueReports() {
	await ensurePasskeyInitialized();

	return queryAll<
		Row & {
			id: number;
			uuid: string;
			email: string;
			message: string;
			status: string;
			created_at: number;
		}
	>(
		`
		SELECT id, uuid, email, message, status, created_at
		FROM config_issue_reports
		WHERE status = 'open'
		ORDER BY created_at DESC, id DESC
	`
	);
}

export async function dismissConfigIssueReport(id: number) {
	await ensurePasskeyInitialized();

	await run('UPDATE config_issue_reports SET status = ?, resolved_at = ? WHERE id = ?', [
		'closed',
		Math.floor(Date.now() / 1000),
		id
	]);
}

export async function createAdminSession(cookies: Cookies, userAgent = '') {
	await ensurePasskeyInitialized();
	await purgeExpiredSessions();

	const token = randomBytes(32).toString('hex');
	const tokenHash = sha256(token);
	const createdAt = Math.floor(Date.now() / 1000);
	const expiresAt = createdAt + sessionLifetimeSeconds;

	await run('INSERT INTO admin_sessions (token_hash, expires_at, created_at, last_used_at, user_agent) VALUES (?, ?, ?, ?, ?)', [
		tokenHash,
		expiresAt,
		createdAt,
		createdAt,
		userAgent.slice(0, 255)
	]);

	setSessionCookie(cookies, token);
	adminLogger.debug('Created admin session.', { expiresAt });
}

export async function destroyAdminSession(cookies: Cookies) {
	const token = cookies.get(sessionCookieName);

	if (token) {
		await deleteSession(sha256(token));
		adminLogger.debug('Destroyed admin session.');
	}

	cookies.delete(sessionCookieName, { path: '/' });
}

export async function isAdminAuthenticated(
	cookies: Cookies,
	options?: { refreshCookie?: boolean; mutateCookies?: boolean }
) {
	await ensurePasskeyInitialized();
	await purgeExpiredSessions();
	const canMutateCookies = options?.mutateCookies ?? false;

	const token = cookies.get(sessionCookieName);
	if (!token) {
		return false;
	}

	const tokenHash = sha256(token);
	const row = await queryFirst<
		Row & {
			expires_at: number;
		}
	>('SELECT expires_at FROM admin_sessions WHERE token_hash = ? LIMIT 1', [tokenHash]);

	if (!row) {
		if (canMutateCookies) {
			cookies.delete(sessionCookieName, { path: '/' });
		}

		adminLogger.warn('Rejected admin session with missing token hash.');

		return false;
	}

	if (row.expires_at <= Math.floor(Date.now() / 1000)) {
		await deleteSession(tokenHash);
		if (canMutateCookies) {
			cookies.delete(sessionCookieName, { path: '/' });
		}

		adminLogger.warn('Rejected expired admin session.', { expiresAt: row.expires_at });

		return false;
	}

	if ((options?.refreshCookie ?? false) && canMutateCookies) {
		await run('UPDATE admin_sessions SET last_used_at = ? WHERE token_hash = ?', [Math.floor(Date.now() / 1000), tokenHash]);
		setSessionCookie(cookies, token);
	}

	return true;
}

export async function getAdminSessions(cookies: Cookies) {
	await ensurePasskeyInitialized();
	await purgeExpiredSessions();
	const token = cookies.get(sessionCookieName);
	const currentHash = token ? sha256(token) : null;
	const rows = await queryAll<Row & { id: number; token_hash: string; expires_at: number; created_at: number; last_used_at: number; user_agent: string }>(
		'SELECT id, token_hash, expires_at, created_at, last_used_at, user_agent FROM admin_sessions ORDER BY last_used_at DESC, id DESC'
	);
	return rows.map((row) => ({
		id: row.id,
		createdAt: row.created_at,
		lastUsedAt: row.last_used_at,
		expiresAt: row.expires_at,
		userAgent: row.user_agent,
		isCurrent: row.token_hash === currentHash
	}));
}

export async function revokeAdminSession(id: number) {
	await ensurePasskeyInitialized();
	await run('DELETE FROM admin_sessions WHERE id = ?', [id]);
}
