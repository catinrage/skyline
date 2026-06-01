import { command, form, getRequestEvent, query } from '$app/server';
import { logger } from '$lib/server/logger';
import {
	authenticateAdmin,
	closeAdminDatabase,
	createAdminSession,
	dismissConfigIssueReport,
	destroyAdminSession,
	featureFlagDefinitions,
	getClientAppLinks,
	getConfigIssueReports,
	getFeatureFlags,
	getFeatureSettings,
	getRuntimeSettings,
	getPaymentCardSettings,
	getSmtpSettings,
	getAdminUsername,
	getAdminSessions,
	getPanelPathSettings,
	getResellerPanelMessage,
	getUserPanelMessage,
	getVlessRewriteRules,
	isAdminAuthenticated,
	setFeatureFlag,
	type FeatureFlagKey,
	updateAdminPasskey,
	updateAdminUsername,
	updateClientAppLinks,
	updateFeatureSettings,
	updateRuntimeSettings,
	updatePaymentCardSettings,
	updateSmtpSettings,
	updatePanelPathSettings,
	updateResellerPanelMessage,
	updateVlessRewriteRules,
	updateUserPanelMessage,
	revokeAdminSession
} from '$lib/server/admin';
import { closeDatabase, databasePath } from '$lib/server/storage';
import {
	addManagerTicketMessage,
	buildAdminFinancialReport,
	clearResellerDebt,
	closeResellerTicket,
	createResellerAccount,
	createResellerCreditPackage,
	createResellerPlan,
	deleteResellerAccount,
	hardDeleteResellerAccount,
	getAdminResellerOverview,
	getResellerCreditPackages,
	getResellerCreditRequests,
	getResellerPlans,
	getResellerTicketsForAdmin,
	recordResellerPayment,
	reviewResellerCreditRequest,
	resetResellerPasswordToDefault,
	setAllResellerRequestsEnabled,
	setResellerCreditPackageActive,
	setResellerCreditPackagePublic,
	setResellerCreditPackageAccess,
	setResellerAccountActive,
	setResellerPlanActive,
	updateResellerCreditPackage,
	updateResellerDebtCap,
	updateResellerAllowedInbounds,
	updateResellerSubResellerLimit,
	updateResellerUsername,
	updateResellerPlan,
	setResellerSubResellerPermission,
	createAdminVpnConfig,
	createManagerConfigTemplate,
	getResellerPlanAccessList,
	getResellerGroups,
	createResellerGroup,
	updateResellerGroup,
	deleteResellerGroup,
	assignResellerToGroup,
	setResellerPlanPublic,
	addResellerPlanAccess,
	removeResellerPlanAccess,
	getAllResellerPlanAccess,
	deleteManagerConfigTemplate,
	setResellerClientTicketsEnabled,
	setResellerTelegramBotAllowed,
	disconnectResellerTelegramBot,
	deleteResellerTicketAsManager,
	managerRenewConfig,
	managerToggleConfig,
	managerAddQuota,
	managerExtendDuration,
	getManagerConfigViews,
	getManagerConfigTemplates,
	revokeManagerConfig,
	revokeOwnResellerSession
} from '$lib/server/resellers';
import { checkXuiHealth, getVpnDashboardData, getXuiInboundOptions } from '$lib/server/xui';
import { checkXrayBinaryHealth } from '$lib/server/xray-proxy';
import { checkAdminLoginRateLimit } from '$lib/server/rate-limit';
import { getSafeClientAddress } from '$lib/server/request';
import { createClient } from '@libsql/client';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

const manageLogger = logger.child('manage');
const maxBackupUploadBytes = 100 * 1024 * 1024;
const rewriteFingerprintSchema = z.enum(['firefox', 'chrome', 'safari', 'ios', 'android']);
const clientAppOsSchema = z.enum(['android', 'ios', 'windows', 'linux']);
const featureSettingsSchema = z
	.object({
		configIssueReportCooldownMinutes: z.coerce
			.number()
			.int()
			.min(1, 'فاصله ارسال گزارش باید حداقل ۱ دقیقه باشد.')
			.max(1440, 'فاصله ارسال گزارش نمی‌تواند بیشتر از ۱۴۴۰ دقیقه باشد.'),
		latencyTestTargetUrl: z.string().trim().url('آدرس تست تاخیر باید یک URL معتبر باشد.'),
		speedTestTargetUrl: z.string().trim().url('آدرس تست سرعت باید یک URL معتبر باشد.'),
		telegramBotSocksProxyUrl: z.string().trim().max(300, 'آدرس پراکسی بیش از حد طولانی است.'),
		telegramBotMaxCustomQuotaGb: z.coerce
			.number()
			.min(1, 'سقف حجم باید حداقل ۱ گیگ باشد.')
			.max(10000, 'سقف حجم بیش از حد بزرگ است.'),
		telegramBotMaxCustomDurationDays: z.coerce
			.number()
			.int()
			.min(1, 'سقف مدت باید حداقل ۱ روز باشد.')
			.max(3650, 'سقف مدت بیش از حد بزرگ است.'),
		telegramBotMinCustomPriceToman: z.coerce
			.number()
			.int()
			.min(0, 'حداقل قیمت نمی‌تواند منفی باشد.'),
		telegramBotDraftExpiryMinutes: z.coerce
			.number()
			.int()
			.min(5, 'انقضای سفارش باید حداقل ۵ دقیقه باشد.')
			.max(10080, 'انقضای سفارش نمی‌تواند بیشتر از ۷ روز باشد.')
	})
	.refine(
		(settings) => ['http:', 'https:'].includes(new URL(settings.latencyTestTargetUrl).protocol),
		{
			message: 'آدرس تست تاخیر فقط می‌تواند http یا https باشد.',
			path: ['latencyTestTargetUrl']
		}
	)
	.refine(
		(settings) => ['http:', 'https:'].includes(new URL(settings.speedTestTargetUrl).protocol),
		{
			message: 'آدرس تست سرعت فقط می‌تواند http یا https باشد.',
			path: ['speedTestTargetUrl']
		}
	);
const runtimeSettingsSchema = z.object({
	xuiPanelUrl: z.string().trim().url('آدرس پنل x-ui باید URL معتبر باشد.'),
	xuiApiToken: z.string().trim().min(1, 'توکن API x-ui را وارد کنید.'),
	xuiPublicHost: z
		.string()
		.trim()
		.max(255, 'هاست عمومی بیش از حد طولانی است.')
		.optional()
		.default(''),
	xrayBinaryPath: z.string().trim().min(1, 'مسیر باینری xray را وارد کنید.'),
	logLevel: z.enum(['debug', 'info', 'warning', 'error']).default('warning'),
	logFile: z.string().trim().max(500, 'مسیر فایل لاگ بیش از حد طولانی است.').optional().default('')
});
const paymentCardSchema = z.object({
	cardNumber: z.string().trim().max(32, 'شماره کارت بیش از حد طولانی است.').optional().default(''),
	cardOwnerName: z.string().trim().max(80, 'نام صاحب کارت بیش از حد طولانی است.').optional().default('')
});

function normalizeCurrencyDigits(value: string) {
	return value
		.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
		.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
		.replace(/[٬،]/g, ',');
}

function currencyNumber(schema: z.ZodNumber) {
	return z
		.string()
		.trim()
		.transform(normalizeCurrencyDigits)
		.refine((value) => /^\d[\d,]*$/.test(value), 'مبلغ واردشده نامعتبر است.')
		.transform((value) => Number(value.replace(/,/g, '')))
		.pipe(schema);
}

function formatBackupTimestamp() {
	return new Date().toISOString().replace(/[:.]/g, '-');
}

async function assertValidSqliteBackup(path: string) {
	const header = await readFile(path);

	if (header.subarray(0, 16).toString('utf8') !== 'SQLite format 3\0') {
		throw new Error('فایل انتخاب‌شده SQLite معتبر نیست.');
	}

	const client = createClient({
		url: pathToFileURL(path).href,
		intMode: 'number'
	});

	try {
		const result = await client.execute('PRAGMA integrity_check');
		const status = String(result.rows[0]?.integrity_check ?? '');

		if (status !== 'ok') {
			throw new Error('فایل پشتیبان تست سلامت SQLite را پاس نکرد.');
		}
	} finally {
		client.close();
	}
}

type StoredBackup = {
	fileName: string;
	sizeBytes: number;
	createdAt: number;
	source: 'manual' | 'restore' | 'safety';
};

const backupDirectory = join(dirname(databasePath), 'backups');

function backupSource(fileName: string): StoredBackup['source'] {
	if (fileName.startsWith('before-restore-')) return 'safety';
	if (fileName.startsWith('restore-upload-')) return 'restore';
	return 'manual';
}

async function listStoredBackups(): Promise<StoredBackup[]> {
	await mkdir(backupDirectory, { recursive: true });
	const files = await readdir(backupDirectory);
	const entries = await Promise.all(
		files
			.filter((fileName) => fileName.endsWith('.sqlite'))
			.map(async (fileName) => {
				const info = await stat(join(backupDirectory, fileName));
				return {
					fileName,
					sizeBytes: info.size,
					createdAt: Math.floor(info.mtimeMs / 1000),
					source: backupSource(fileName)
				};
			})
	);
	return entries.sort((a, b) => b.createdAt - a.createdAt);
}

async function pruneBackups() {
	const backups = await listStoredBackups();
	await Promise.all(
		backups.slice(20).map((entry) => rm(join(backupDirectory, entry.fileName), { force: true }))
	);
}

async function buildManageState(authenticated: boolean) {
	if (!authenticated) {
		return {
			authenticated: false,
			userPanelMessage: '',
			resellerPanelMessage: '',
			clientAppLinks: [],
			featureFlags: [],
			featureSettings: {
				configIssueReportCooldownMinutes: 1,
				latencyTestTargetUrl: 'https://www.gstatic.com/generate_204',
				speedTestTargetUrl: 'http://ipv4.download.thinkbroadband.com/20MB.zip',
				telegramBotSocksProxyUrl: '',
				telegramBotMaxCustomQuotaGb: 100,
				telegramBotMaxCustomDurationDays: 365,
				telegramBotMinCustomPriceToman: 0,
				telegramBotDraftExpiryMinutes: 60
			},
			configIssueReports: [],
			resellerTickets: [],
			vpnDashboard: null,
			resellerAccounts: [],
			resellerFinancialReport: null,
			resellerCreditPackages: [],
			resellerCreditRequests: [],
			resellerPlans: [],
			managerConfigs: [],
			managerConfigTemplates: [],
			backups: [],
			adminSessions: [],
			inboundOptions: [],
			vlessRewriteRules: [],
			adminUsername: 'admin',
			runtimeSettings: {
				xuiPanelUrl: '',
				xuiApiToken: '',
				xuiPublicHost: '',
				xrayBinaryPath: '/usr/local/x-ui/bin/xray-linux-amd64',
				logLevel: 'warning' as const,
				logFile: ''
			},
			paymentCard: {
				cardNumber: '',
				cardOwnerName: ''
			},
			runtimeHealth: null,
			panelPathSettings: {
				managerBasePath: '',
				resellerBasePath: ''
			},
			resellerGroups: [],
			planAccessEntries: [] as {
				planId: number;
				resellerId: number | null;
				groupId: number | null;
			}[],
			smtpSettings: {
				host: '',
				port: 587,
				secure: false,
				username: '',
				password: '',
				fromAddress: '',
				fromName: 'Skyline'
			}
		};
	}

	const { url } = getRequestEvent();
	const [
		userPanelMessage,
		resellerPanelMessage,
		clientAppLinks,
		featureFlags,
		featureSettings,
		configIssueReports,
		resellerTickets,
		vpnDashboard,
		resellerAccounts,
		resellerCreditPackages,
		resellerCreditRequests,
		resellerPlans,
		inboundOptions,
		vlessRewriteRules,
		adminUsername,
		runtimeSettings,
		paymentCard,
		panelPathSettings,
		resellerGroups,
		planAccessEntries,
		smtpSettings,
		managerConfigs,
		managerConfigTemplates,
		backups,
		adminSessions
	] = await Promise.all([
		getUserPanelMessage(),
		getResellerPanelMessage(),
		getClientAppLinks(),
		getFeatureFlags(),
		getFeatureSettings(),
		getConfigIssueReports(),
		getResellerTicketsForAdmin(),
		getVpnDashboardData().catch((error) => {
			manageLogger.warn('Failed to load x-ui dashboard data for manage state.', {
				error: error instanceof Error ? error : undefined
			});
			return null;
		}),
		getAdminResellerOverview(),
		getResellerCreditPackages(),
		getResellerCreditRequests(),
		getResellerPlans(),
		getXuiInboundOptions().catch((error) => {
			manageLogger.warn('Failed to load x-ui inbound options for manage state.', {
				error: error instanceof Error ? error : undefined
			});
			return [];
		}),
		getVlessRewriteRules(),
		getAdminUsername(),
		getRuntimeSettings(),
		getPaymentCardSettings(),
		getPanelPathSettings(),
		getResellerGroups(),
		getAllResellerPlanAccess(),
		getSmtpSettings(),
		getManagerConfigViews(url.origin, url.hostname).catch(() => []),
		getManagerConfigTemplates().catch(() => []),
		listStoredBackups(),
		getAdminSessions(getRequestEvent().cookies)
	]);
	const resellerFinancialReport = buildAdminFinancialReport(resellerAccounts);

	return {
		authenticated: true,
		userPanelMessage,
		resellerPanelMessage,
		clientAppLinks,
		featureFlags,
		featureSettings,
		configIssueReports,
		resellerTickets,
		vpnDashboard,
		resellerAccounts,
		resellerFinancialReport,
		resellerCreditPackages,
		resellerCreditRequests,
		resellerPlans,
		inboundOptions,
		vlessRewriteRules,
		adminUsername,
		runtimeSettings,
		paymentCard,
		runtimeHealth: null,
		panelPathSettings,
		resellerGroups,
		planAccessEntries,
		smtpSettings,
		managerConfigs,
		managerConfigTemplates,
		backups,
		adminSessions
	};
}

async function requireAdminSession() {
	const { cookies } = getRequestEvent();
	const authenticated = await isAdminAuthenticated(cookies, {
		refreshCookie: true,
		mutateCookies: true
	});

	if (!authenticated) {
		return null;
	}

	return cookies;
}

export const getManageState = query(async () => {
	const { cookies } = getRequestEvent();
	const authenticated = await isAdminAuthenticated(cookies);

	return buildManageState(authenticated);
});

export const login = form(
	z.object({
		username: z.string().trim().min(1, 'نام کاربری مدیریت را وارد کنید.'),
		passkey: z.string().trim().min(1, 'واردکردن گذرواژه الزامی است.')
	}),
	async ({ username, passkey }) => {
		const event = getRequestEvent();
		const { cookies } = event;
		const ip = getSafeClientAddress(event);
		const rateLimit = checkAdminLoginRateLimit(ip);

		if (!rateLimit.allowed) {
			manageLogger.warn('Admin login rate limited.', { ip });
			return {
				loginError: `تلاش‌های ورود زیاد است. ${rateLimit.retryAfter} ثانیه دیگر دوباره تلاش کنید.`
			};
		}

		const authenticated = await authenticateAdmin(username, passkey);

		if (!authenticated) {
			manageLogger.warn('Admin login failed.');
			return {
				loginError: 'نام کاربری یا گذرواژه نادرست است.'
			};
		}

		await createAdminSession(cookies, event.request.headers.get('user-agent') ?? '');
		manageLogger.warn('Admin login succeeded.');
		await getManageState().set(await buildManageState(true));

		return {
			loginSuccess: 'با موفقیت وارد شدید.'
		};
	}
);

export const updateMessage = form(
	z.object({
		userMessage: z.string().trim().max(5000, 'پیام کاربران نمی‌تواند بیشتر از ۵۰۰۰ کاراکتر باشد.'),
		resellerMessage: z
			.string()
			.trim()
			.max(5000, 'پیام فروشندگان نمی‌تواند بیشتر از ۵۰۰۰ کاراکتر باشد.')
	}),
	async ({ userMessage, resellerMessage }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			manageLogger.warn('Rejected admin message update due to expired session.');
			return {
				settingsError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		await Promise.all([
			updateUserPanelMessage(userMessage),
			updateResellerPanelMessage(resellerMessage)
		]);
		manageLogger.warn('Updated panel messages.', {
			userLength: userMessage.length,
			resellerLength: resellerMessage.length
		});
		await getManageState().set(await buildManageState(true));

		return {
			messageSuccess: 'پیام‌های پنل به‌روزرسانی شد.'
		};
	}
);

export const updatePasskey = form(
	z
		.object({
			currentPasskey: z.string().min(1, 'گذرواژه فعلی را وارد کنید.'),
			nextPasskey: z.string().min(4, 'گذرواژه جدید باید حداقل ۴ کاراکتر باشد.'),
			confirmPasskey: z.string().min(1, 'تکرار گذرواژه جدید را وارد کنید.')
		})
		.refine((values) => values.nextPasskey === values.confirmPasskey, {
			message: 'تکرار گذرواژه جدید مطابقت ندارد.',
			path: ['confirmPasskey']
		}),
	async ({ currentPasskey, nextPasskey }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			manageLogger.warn('Rejected admin passkey change due to expired session.');
			return {
				passkeyError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		const currentValid = await authenticateAdmin(await getAdminUsername(), currentPasskey);
		if (!currentValid) {
			manageLogger.warn('Rejected admin passkey change due to invalid current passkey.');
			return {
				passkeyError: 'گذرواژه فعلی نادرست است.'
			};
		}

		await updateAdminPasskey(nextPasskey);

		return {
			passkeySuccess: 'گذرواژه با موفقیت تغییر کرد.'
		};
	}
);

export const updateManagerUsername = form(
	z.object({
		username: z.string().trim().min(1, 'نام کاربری را وارد کنید.').max(64)
	}),
	async ({ username }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				passkeyError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			await updateAdminUsername(username);
			await getManageState().set(await buildManageState(true));

			return {
				passkeySuccess: 'نام کاربری مدیریت تغییر کرد.'
			};
		} catch (error) {
			return {
				passkeyError: error instanceof Error ? error.message : 'تغییر نام کاربری انجام نشد.'
			};
		}
	}
);

export const logout = form(async () => {
	const { cookies } = getRequestEvent();
	await destroyAdminSession(cookies);
	manageLogger.warn('Admin logged out.');
	await getManageState().set(await buildManageState(false));

	return {
		logoutSuccess: 'از پنل خارج شدید.'
	};
});

export const revokeAdminSessionCommand = command(
	z.object({ sessionId: z.number().int().positive() }),
	async ({ sessionId }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { sessionError: 'نشست شما منقضی شده است.' };
		await revokeAdminSession(sessionId);
		await getManageState().set(await buildManageState(await isAdminAuthenticated(cookies)));
		return { sessionSuccess: 'نشست لغو شد.' };
	}
);

export const restoreDatabaseBackup = form(
	z.object({
		backupFile: z
			.instanceof(File, { message: 'فایل پشتیبان را انتخاب کنید.' })
			.refine((file) => file.size > 0, 'فایل پشتیبان خالی است.')
			.refine(
				(file) => file.size <= maxBackupUploadBytes,
				'حجم فایل پشتیبان بیشتر از حد مجاز است.'
			),
		confirmation: z.literal('RESTORE SKYLINE', {
			message: 'برای بازیابی عبارت RESTORE SKYLINE را دقیق وارد کنید.'
		})
	}),
	async ({ backupFile }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				backupRestoreError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		const timestamp = formatBackupTimestamp();
		const uploadedPath = join(
			backupDirectory,
			`restore-upload-${timestamp}-${basename(backupFile.name || 'backup.sqlite')}`
		);
		const safetyBackupPath = join(backupDirectory, `before-restore-${timestamp}.sqlite`);

		try {
			await mkdir(backupDirectory, { recursive: true });
			await writeFile(uploadedPath, Buffer.from(await backupFile.arrayBuffer()));
			await assertValidSqliteBackup(uploadedPath);
			await copyFile(databasePath, safetyBackupPath);

			closeAdminDatabase();
			closeDatabase();
			try {
				await rename(uploadedPath, databasePath);
			} catch (renameError) {
				await copyFile(safetyBackupPath, databasePath).catch(() => undefined);
				throw renameError;
			}
			await pruneBackups();
			await getManageState().set(await buildManageState(true));

			return {
				backupRestoreSuccess: `بازیابی انجام شد. یک نسخه امن از دیتابیس قبلی در ${safetyBackupPath} ذخیره شد.`
			};
		} catch (error) {
			await rm(uploadedPath, { force: true }).catch(() => undefined);
			manageLogger.error('Database restore failed.', { error });

			return {
				backupRestoreError: error instanceof Error ? error.message : 'بازیابی دیتابیس انجام نشد.'
			};
		}
	}
);

export const createStoredBackup = command(async () => {
	const cookies = await requireAdminSession();
	if (!cookies) return { backupError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
	try {
		const fileName = `skyline-backup-${formatBackupTimestamp()}.sqlite`;
		await mkdir(backupDirectory, { recursive: true });
		await copyFile(databasePath, join(backupDirectory, fileName));
		await assertValidSqliteBackup(join(backupDirectory, fileName));
		await pruneBackups();
		await getManageState().set(await buildManageState(true));
		return { backupSuccess: 'نسخه پشتیبان روی سرور ذخیره شد.', fileName };
	} catch (error) {
		return { backupError: error instanceof Error ? error.message : 'ساخت پشتیبان انجام نشد.' };
	}
});

export const restoreStoredBackup = command(
	z.object({
		fileName: z
			.string()
			.trim()
			.regex(/^[\w.-]+\.sqlite$/, 'نام فایل پشتیبان نامعتبر است.'),
		confirmation: z.literal('RESTORE SKYLINE', {
			message: 'برای بازیابی عبارت RESTORE SKYLINE را دقیق وارد کنید.'
		})
	}),
	async ({ fileName }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { backupError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
		const sourcePath = join(backupDirectory, basename(fileName));
		const safetyPath = join(backupDirectory, `before-restore-${formatBackupTimestamp()}.sqlite`);
		try {
			await assertValidSqliteBackup(sourcePath);
			await copyFile(databasePath, safetyPath);
			closeAdminDatabase();
			closeDatabase();
			await copyFile(sourcePath, databasePath);
			await pruneBackups();
			await getManageState().set(await buildManageState(true));
			return { backupSuccess: 'نسخه انتخاب‌شده بازیابی شد.' };
		} catch (error) {
			return { backupError: error instanceof Error ? error.message : 'بازیابی انجام نشد.' };
		}
	}
);

export const toggleFeature = form(
	z.object({
		key: z.enum(
			featureFlagDefinitions.map((feature) => feature.key) as [FeatureFlagKey, ...FeatureFlagKey[]]
		),
		enabled: z.enum(['true', 'false'])
	}),
	async ({ key, enabled }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			manageLogger.warn('Rejected feature toggle due to expired session.', { key });
			return {
				featureError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		await setFeatureFlag(key, enabled === 'true');
		await getManageState().set(await buildManageState(true));

		return {
			featureSuccess: 'تنظیمات قابلیت به‌روزرسانی شد.'
		};
	}
);

export const updateFeatureOptions = form(featureSettingsSchema, async (settings) => {
	const cookies = await requireAdminSession();

	if (!cookies) {
		manageLogger.warn('Rejected feature settings update due to expired session.');
		return {
			featureSettingsError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
		};
	}

	await updateFeatureSettings(settings);
	await getManageState().set(await buildManageState(true));

	return {
		featureSettingsSuccess: 'تنظیمات تکمیلی قابلیت‌ها ذخیره شد.'
	};
});

async function buildRuntimeHealth(settings?: Awaited<ReturnType<typeof getRuntimeSettings>>) {
	const resolvedSettings = settings ?? (await getRuntimeSettings());
	const [xui, xray] = await Promise.all([
		checkXuiHealth(5000, resolvedSettings),
		checkXrayBinaryHealth(resolvedSettings)
	]);

	return {
		ok: xui.apiOk && xui.tokenValid === true && xray.ok,
		xui,
		xray,
		checkedAt: new Date().toISOString()
	};
}

export const updateRuntimeOptions = form(runtimeSettingsSchema, async (settings) => {
	const cookies = await requireAdminSession();

	if (!cookies) {
		return {
			runtimeSettingsError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
		};
	}

	await updateRuntimeSettings(settings);
	const state = await buildManageState(true);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(state as any).runtimeHealth = await buildRuntimeHealth(settings);
	await getManageState().set(state);

	return {
		runtimeSettingsSuccess: 'تنظیمات اتصال ذخیره شد.'
	};
});

export const updatePaymentCard = form(paymentCardSchema, async (settings) => {
	const cookies = await requireAdminSession();

	if (!cookies) {
		return {
			paymentCardError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
		};
	}

	await updatePaymentCardSettings(settings);
	await getManageState().set(await buildManageState(true));

	return {
		paymentCardSuccess: 'اطلاعات کارت پرداخت ذخیره شد.'
	};
});

export const testRuntimeOptions = form(runtimeSettingsSchema, async (settings) => {
	const cookies = await requireAdminSession();

	if (!cookies) {
		return {
			runtimeTestError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
		};
	}

	const state = await buildManageState(true);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(state as any).runtimeHealth = await buildRuntimeHealth(settings);
	await getManageState().set(state);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (state as any).runtimeHealth.ok
		? { runtimeTestSuccess: 'اتصال x-ui، توکن API و مسیر xray سالم هستند.' }
		: { runtimeTestError: 'برخی تست‌های تنظیمات ناموفق هستند. جزئیات را بررسی کنید.' };
});

export const dismissReport = form(
	z.object({
		id: z.coerce.number().int().positive()
	}),
	async ({ id }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			manageLogger.warn('Rejected config issue report dismissal due to expired session.', { id });
			return {
				reportError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		await dismissConfigIssueReport(id);
		await getManageState().set(await buildManageState(true));

		return {
			reportSuccess: 'گزارش از پایگاه داده حذف شد.'
		};
	}
);

export const closeResellerSupportTicket = form(
	z.object({
		id: z.coerce.number().int().positive()
	}),
	async ({ id }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			manageLogger.warn('Rejected reseller ticket close due to expired session.', { id });
			return {
				ticketError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		await closeResellerTicket(id);
		await getManageState().set(await buildManageState(true));

		return {
			ticketSuccess: 'تیکت فروشنده بسته شد.'
		};
	}
);

export const replyResellerSupportTicket = form(
	z.object({
		id: z.coerce.number().int().positive(),
		message: z
			.string()
			.trim()
			.min(1, 'متن پاسخ را وارد کنید.')
			.max(5000, 'متن پاسخ خیلی طولانی است.')
	}),
	async ({ id, message }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			manageLogger.warn('Rejected reseller ticket reply due to expired session.', { id });
			return {
				ticketError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			await addManagerTicketMessage(id, message);
			await getManageState().set(await buildManageState(true));

			return {
				ticketSuccess: 'پاسخ مدیر ارسال شد.'
			};
		} catch (error) {
			return {
				ticketError: error instanceof Error ? error.message : 'ارسال پاسخ انجام نشد.'
			};
		}
	}
);

export const updateClientApps = form(
	z.object({
		clientApps: z
			.string()
			.transform((value, ctx) => {
				try {
					return JSON.parse(value);
				} catch {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'ساختار لیست برنامه‌ها نامعتبر است.'
					});
					return z.NEVER;
				}
			})
			.pipe(
				z.array(
					z.object({
						name: z.string().trim().min(1, 'نام برنامه نمی‌تواند خالی باشد.'),
						downloadUrl: z.string().trim().url('لینک دانلود باید یک URL معتبر باشد.'),
						os: clientAppOsSchema,
						uploadedFileName: z.string().optional()
					})
				)
			)
	}),
	async ({ clientApps }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			manageLogger.warn('Rejected client app links update due to expired session.');
			return {
				clientAppsError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		await updateClientAppLinks(clientApps);
		await getManageState().set(await buildManageState(true));

		return {
			clientAppsSuccess: 'لیست برنامه‌های کلاینت به‌روزرسانی شد.'
		};
	}
);

export const updateVlessRewrites = form(
	z.object({
		rulesJson: z
			.string()
			.transform((value, ctx) => {
				try {
					return JSON.parse(value);
				} catch {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'ساختار قوانین تغییر کانفیگ نامعتبر است.'
					});
					return z.NEVER;
				}
			})
			.pipe(
				z.array(
					z
						.object({
							targetInboundId: z.union([z.coerce.number().int().positive(), z.null()]),
							enabled: z.boolean(),
							address: z.string().trim().min(1, 'آدرس خروجی الزامی است.'),
							port: z.coerce.number().int().min(1).max(65535),
							tlsEnabled: z.boolean(),
							sni: z.string().trim(),
							fingerprint: rewriteFingerprintSchema
						})
						.refine((rule) => !rule.tlsEnabled || rule.sni.length > 0, {
							message: 'وقتی TLS فعال است، SNI الزامی است.',
							path: ['sni']
						})
				)
			)
	}),
	async ({ rulesJson }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				rewriteError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		await updateVlessRewriteRules(rulesJson);
		await getManageState().set(await buildManageState(true));

		return {
			rewriteSuccess: 'قوانین تغییر کانفیگ ذخیره شد.'
		};
	}
);

export const updatePanelPaths = form(
	z.object({
		panelBasePath: z.string().trim().max(80, 'مسیر پنل بیش از حد طولانی است.')
	}),
	async ({ panelBasePath }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				panelPathError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			await updatePanelPathSettings({
				managerBasePath: panelBasePath,
				resellerBasePath: panelBasePath
			});
		} catch (error) {
			return {
				panelPathError: error instanceof Error ? error.message : 'ذخیره مسیر مخفی انجام نشد.'
			};
		}

		await getManageState().set(await buildManageState(true));

		return {
			panelPathSuccess:
				'مسیر مخفی ذخیره شد. اگر مسیر را تنظیم کردید، از این به بعد از مسیر جدید وارد شوید.'
		};
	}
);

export const createReseller = form(
	z.object({
		username: z
			.string()
			.trim()
			.min(3, 'نام کاربری باید حداقل ۳ کاراکتر باشد.')
			.max(32, 'نام کاربری نمی‌تواند بیشتر از ۳۲ کاراکتر باشد.')
			.regex(
				/^[A-Za-z0-9._-]+$/,
				'نام کاربری فقط می‌تواند شامل حروف انگلیسی، عدد، نقطه، _ یا - باشد.'
			),
		password: z.string().min(4, 'گذرواژه باید حداقل ۴ کاراکتر باشد.'),
		debtCapToman: z.union([
			z.literal(''),
			currencyNumber(z.number().int().nonnegative('سقف بدهی نامعتبر است.'))
		])
	}),
	async ({ username, password, debtCapToman }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				resellerError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			await createResellerAccount(username, password, {
				debtCapToman: debtCapToman === '' ? null : debtCapToman
			});
		} catch (error) {
			return {
				resellerError: error instanceof Error ? error.message : 'ایجاد فروشنده انجام نشد.'
			};
		}

		await getManageState().set(await buildManageState(true));

		return {
			resellerSuccess: 'حساب فروشنده ایجاد شد.'
		};
	}
);

export const updateResellerCap = form(
	z.object({
		id: z.coerce.number().int().positive(),
		debtCapToman: z.union([
			z.literal(''),
			currencyNumber(z.number().int().nonnegative('سقف بدهی نامعتبر است.'))
		])
	}),
	async ({ id, debtCapToman }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				resellerCapError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		await updateResellerDebtCap(id, debtCapToman === '' ? null : debtCapToman);
		await getManageState().set(await buildManageState(true));

		return {
			resellerCapSuccess: 'سقف بدهی فروشنده به‌روزرسانی شد.'
		};
	}
);

export const updateResellerInbounds = form(
	z.object({
		id: z.coerce.number().int().positive(),
		allowedInboundIds: z
			.union([z.string(), z.array(z.string())])
			.optional()
			.transform((value) => {
				if (value === undefined) return [] as number[];
				const values = Array.isArray(value) ? value : [value];
				return values
					.map((item) => Number(item))
					.filter((item) => Number.isInteger(item) && item > 0);
			})
	}),
	async ({ id, allowedInboundIds }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				resellerInboundError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		await updateResellerAllowedInbounds(id, allowedInboundIds.length ? allowedInboundIds : null);
		await getManageState().set(await buildManageState(true));

		return {
			resellerInboundSuccess: 'محدودیت سرورهای فروشنده ذخیره شد.'
		};
	}
);

export const updateResellerSubLimit = form(
	z.object({
		id: z.coerce.number().int().positive(),
		subResellerLimit: z.coerce
			.number()
			.int()
			.min(0, 'سقف زیرفروشندگان نمی‌تواند منفی باشد.')
			.max(10000, 'سقف زیرفروشندگان بیش از حد بزرگ است.')
	}),
	async ({ id, subResellerLimit }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				resellerSubLimitError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		await updateResellerSubResellerLimit(id, subResellerLimit);
		await getManageState().set(await buildManageState(true));

		return {
			resellerSubLimitSuccess: 'سقف تعداد زیرفروشندگان ذخیره شد.'
		};
	}
);

export const toggleReseller = form(
	z.object({
		id: z.coerce.number().int().positive(),
		enabled: z.enum(['true', 'false'])
	}),
	async ({ id, enabled }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				resellerToggleError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		await setResellerAccountActive(id, enabled === 'true');
		await getManageState().set(await buildManageState(true));

		return {
			resellerToggleSuccess: 'وضعیت فروشنده به‌روزرسانی شد.'
		};
	}
);

export const toggleAllResellerConfigs = form(
	z.object({
		id: z.coerce.number().int().positive(),
		enabled: z.enum(['true', 'false'])
	}),
	async ({ id, enabled }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				resellerConfigsToggleError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		const result = await setAllResellerRequestsEnabled(id, enabled === 'true');
		await getManageState().set(await buildManageState(true));

		const action = enabled === 'true' ? 'فعال' : 'غیرفعال';
		const suffix = result.failed > 0 ? ` (${result.failed} مورد در x-ui پیدا نشد یا خطا داشت)` : '';

		return {
			resellerConfigsToggleSuccess: `${result.updated} کانفیگ ${action} شد.${suffix}`
		};
	}
);

export const deleteReseller = form(
	z.object({
		id: z.coerce.number().int().positive()
	}),
	async ({ id }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				resellerDeleteError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			await deleteResellerAccount(id);
		} catch (error) {
			return {
				resellerDeleteError: error instanceof Error ? error.message : 'حذف فروشنده انجام نشد.'
			};
		}

		await getManageState().set(await buildManageState(true));

		return {
			resellerDeleteSuccess: 'حساب فروشنده حذف شد.'
		};
	}
);
export const hardDeleteReseller = form(
	z.object({
		id: z.coerce.number().int().positive()
	}),
	async ({ id }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return { resellerHardDeleteError: 'دسترسی غیرمجاز.' };
		}

		try {
			await hardDeleteResellerAccount(id);
		} catch (error) {
			return {
				resellerHardDeleteError:
					error instanceof Error ? error.message : 'حذف کامل فروشنده انجام نشد.'
			};
		}

		await getManageState().set(await buildManageState(true));

		return {
			resellerHardDeleteSuccess: 'حساب و تمامی کانفیگ‌های فروشنده حذف شد.'
		};
	}
);

export const resetResellerPassword = form(
	z.object({
		id: z.coerce.number().int().positive()
	}),
	async ({ id }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				resellerResetError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			const newPassword = await resetResellerPasswordToDefault(id);
			await getManageState().set(await buildManageState(true));

			return {
				resellerResetSuccess: true,
				resellerResetPassword: newPassword
			};
		} catch (error) {
			return {
				resellerResetError: error instanceof Error ? error.message : 'بازنشانی گذرواژه انجام نشد.'
			};
		}
	}
);

export const renameReseller = form(
	z.object({
		id: z.coerce.number().int().positive(),
		username: z.string().trim().min(1, 'نام کاربری را وارد کنید.').max(64)
	}),
	async ({ id, username }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				resellerRenameError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			await updateResellerUsername(id, username);
			await getManageState().set(await buildManageState(true));

			return {
				resellerRenameSuccess: 'نام کاربری فروشنده تغییر کرد.'
			};
		} catch (error) {
			return {
				resellerRenameError: error instanceof Error ? error.message : 'تغییر نام کاربری انجام نشد.'
			};
		}
	}
);

export const settleReseller = form(
	z.object({
		id: z.coerce.number().int().positive(),
		amountToman: currencyNumber(z.number().int().positive('مبلغ پرداخت باید بیشتر از صفر باشد.'))
	}),
	async ({ id, amountToman }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				resellerPaymentError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			const amount = await recordResellerPayment(id, amountToman);
			await getManageState().set(await buildManageState(true));

			return {
				resellerPaymentSuccess: `حساب فروشنده به مبلغ ${amount.toLocaleString('fa-IR-u-nu-latn')} تومان شارژ شد.`
			};
		} catch (error) {
			return {
				resellerPaymentError: error instanceof Error ? error.message : 'شارژ حساب انجام نشد.'
			};
		}
	}
);

export const settleFullResellerDebt = form(
	z.object({
		id: z.coerce.number().int().positive()
	}),
	async ({ id }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				resellerFullPaymentError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			const amount = await clearResellerDebt(id);
			await getManageState().set(await buildManageState(true));

			return {
				resellerFullPaymentSuccess:
					amount > 0
						? `موجودی فعلی فروشنده ${amount.toLocaleString('fa-IR-u-nu-latn')} تومان است.`
						: 'موجودی این فروشنده صفر است.'
			};
		} catch (error) {
			return {
				resellerFullPaymentError:
					error instanceof Error ? error.message : 'محاسبه موجودی انجام نشد.'
			};
		}
	}
);

const creditPackageSchema = z.object({
	quotaGb: z.coerce.number().min(0.01, 'حجم بسته باید حداقل ۰.۰۱ گیگابایت باشد.').positive(),
	priceToman: currencyNumber(z.number().int().nonnegative('قیمت باید صفر یا بیشتر باشد.')),
	isPublic: z.enum(['true', 'false']).optional().default('true')
});

export const createCreditPackage = form(
	creditPackageSchema,
	async ({ quotaGb, priceToman, isPublic }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				creditPackageError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			await createResellerCreditPackage({ quotaGb, priceToman, isPublic: isPublic === 'true' });
			await getManageState().set(await buildManageState(true));

			return {
				creditPackageSuccess: 'بسته شارژ گیگابایت ایجاد شد.'
			};
		} catch (error) {
			return {
				creditPackageError: error instanceof Error ? error.message : 'ایجاد بسته شارژ انجام نشد.'
			};
		}
	}
);

export const updateCreditPackage = form(
	creditPackageSchema.omit({ isPublic: true }).extend({
		id: z.coerce.number().int().positive()
	}),
	async ({ id, quotaGb, priceToman }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				creditPackageUpdateError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			await updateResellerCreditPackage(id, { quotaGb, priceToman });
			await getManageState().set(await buildManageState(true));

			return {
				creditPackageUpdateSuccess: 'بسته شارژ به‌روزرسانی شد.'
			};
		} catch (error) {
			return {
				creditPackageUpdateError:
					error instanceof Error ? error.message : 'ویرایش بسته شارژ انجام نشد.'
			};
		}
	}
);

export const toggleCreditPackage = form(
	z.object({
		id: z.coerce.number().int().positive(),
		enabled: z.enum(['true', 'false'])
	}),
	async ({ id, enabled }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				creditPackageToggleError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			await setResellerCreditPackageActive(id, enabled === 'true');
			await getManageState().set(await buildManageState(true));

			return {
				creditPackageToggleSuccess: 'وضعیت بسته شارژ تغییر کرد.'
			};
		} catch (error) {
			return {
				creditPackageToggleError:
					error instanceof Error ? error.message : 'تغییر وضعیت بسته انجام نشد.'
			};
		}
	}
);

export const setCreditPackageVisibilityCommand = command(
	z.object({
		id: z.number().int().positive(),
		isPublic: z.boolean()
	}),
	async ({ id, isPublic }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { creditPackageError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
		try {
			await setResellerCreditPackagePublic(id, isPublic);
			await getManageState().set(await buildManageState(true));
			return { creditPackageSuccess: isPublic ? 'بسته عمومی شد.' : 'بسته خصوصی شد.' };
		} catch (error) {
			return {
				creditPackageError: error instanceof Error ? error.message : 'تغییر دسترسی بسته انجام نشد.'
			};
		}
	}
);

export const setCreditPackageAccessCommand = command(
	z.object({
		packageId: z.number().int().positive(),
		targetType: z.enum(['group', 'reseller']),
		targetId: z.number().int().positive(),
		enabled: z.boolean()
	}),
	async ({ packageId, targetType, targetId, enabled }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { creditPackageError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
		try {
			await setResellerCreditPackageAccess(
				packageId,
				{
					groupId: targetType === 'group' ? targetId : null,
					resellerId: targetType === 'reseller' ? targetId : null
				},
				enabled
			);
			await getManageState().set(await buildManageState(true));
			return { creditPackageSuccess: enabled ? 'دسترسی بسته اضافه شد.' : 'دسترسی بسته حذف شد.' };
		} catch (error) {
			return {
				creditPackageError: error instanceof Error ? error.message : 'تنظیم دسترسی بسته انجام نشد.'
			};
		}
	}
);

export const reviewCreditRequest = form(
	z.object({
		id: z.coerce.number().int().positive(),
		status: z.enum(['approved', 'rejected']),
		managerNote: z
			.string()
			.trim()
			.max(500, 'یادداشت مدیر نمی‌تواند بیشتر از ۵۰۰ کاراکتر باشد.')
			.optional()
	}),
	async ({ id, status, managerNote }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				creditRequestReviewError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			await reviewResellerCreditRequest(id, status, managerNote ?? '');
			await getManageState().set(await buildManageState(true));

			return {
				creditRequestReviewSuccess:
					status === 'approved'
						? 'درخواست تایید شد و گیگابایت به فروشنده اضافه شد.'
						: 'درخواست رد شد.'
			};
		} catch (error) {
			return {
				creditRequestReviewError:
					error instanceof Error ? error.message : 'بررسی درخواست شارژ انجام نشد.'
			};
		}
	}
);

const resellerPlanSchema = z.object({
	quotaGb: z.coerce.number().min(0.01, 'حجم پلن باید حداقل ۰.۰۱ گیگابایت باشد.').positive(),
	durationDays: z.coerce.number().int().positive('تعداد روز باید بیشتر از صفر باشد.'),
	priceToman: currencyNumber(z.number().int().nonnegative('قیمت باید صفر یا بیشتر باشد.')),
	inboundId: z.coerce.number().int().positive('ورودی نامعتبر است.')
});

export const createPlan = form(
	resellerPlanSchema,
	async ({ quotaGb, durationDays, priceToman, inboundId }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				planError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			await createResellerPlan({
				quotaGb,
				durationDays,
				priceToman,
				inboundId
			});
		} catch (error) {
			return {
				planError: error instanceof Error ? error.message : 'ایجاد پلن انجام نشد.'
			};
		}

		await getManageState().set(await buildManageState(true));

		return {
			planSuccess: 'پلن فروشندگان ایجاد شد.'
		};
	}
);

export const updatePlan = form(
	resellerPlanSchema.extend({
		id: z.coerce.number().int().positive()
	}),
	async ({ id, quotaGb, durationDays, priceToman, inboundId }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				planUpdateError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			await updateResellerPlan(id, {
				quotaGb,
				durationDays,
				priceToman,
				inboundId
			});
		} catch (error) {
			return {
				planUpdateError: error instanceof Error ? error.message : 'ویرایش پلن انجام نشد.'
			};
		}

		await getManageState().set(await buildManageState(true));

		return {
			planUpdateSuccess: 'پلن فروشندگان به‌روزرسانی شد.'
		};
	}
);

export const togglePlan = form(
	z.object({
		id: z.coerce.number().int().positive(),
		enabled: z.enum(['true', 'false'])
	}),
	async ({ id, enabled }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				planToggleError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		await setResellerPlanActive(id, enabled === 'true');
		await getManageState().set(await buildManageState(true));

		return {
			planToggleSuccess: 'وضعیت پلن به‌روزرسانی شد.'
		};
	}
);

export const toggleResellerSubPermission = form(
	z.object({
		id: z.coerce.number().int().positive(),
		enabled: z.enum(['true', 'false'])
	}),
	async ({ id, enabled }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				resellerSubPermError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			await setResellerSubResellerPermission(id, enabled === 'true');
			await getManageState().set(await buildManageState(true));

			return {
				resellerSubPermSuccess:
					enabled === 'true'
						? 'مجوز مدیریت زیرفروشنده فعال شد.'
						: 'مجوز مدیریت زیرفروشنده غیرفعال شد.'
			};
		} catch (error) {
			return {
				resellerSubPermError: error instanceof Error ? error.message : 'تغییر مجوز انجام نشد.'
			};
		}
	}
);

export const createAdminConfigCommand = command(
	z.object({
		inboundId: z.number().int().positive('سرور انتخاب نشده است.'),
		quotaGb: z.number().min(0.01, 'حجم باید حداقل ۰.۰۱ گیگابایت باشد.').positive(),
		durationDays: z
			.number()
			.int('مدت باید عدد صحیح باشد.')
			.min(1, 'مدت باید حداقل ۱ روز باشد.')
			.max(365, 'مدت نمی‌تواند بیشتر از ۳۶۵ روز باشد.'),
		priceToman: z.number().int('قیمت باید عدد صحیح باشد.').min(0, 'قیمت نمی‌تواند منفی باشد.'),
		templateId: z.number().int().positive().nullable().optional(),
		customerLabel: z.string().trim().max(64, 'نام مشتری نمی‌تواند بیشتر از ۶۴ کاراکتر باشد.'),
		internalNote: z
			.string()
			.trim()
			.max(500, 'یادداشت نمی‌تواند بیشتر از ۵۰۰ کاراکتر باشد.')
			.optional()
	}),
	async ({
		inboundId,
		quotaGb,
		durationDays,
		priceToman,
		templateId,
		customerLabel,
		internalNote
	}) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				adminCreateError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		const { url } = getRequestEvent();

		try {
			const request = await createAdminVpnConfig(
				{ inboundId, quotaGb, durationDays, priceToman, templateId, customerLabel, internalNote },
				url.origin,
				url.hostname
			);
			await getManageState().set(await buildManageState(true));

			return {
				adminCreateSuccess: 'کانفیگ ساخته شد.',
				createdRequestId: request.id
			};
		} catch (error) {
			return {
				adminCreateError: error instanceof Error ? error.message : 'ساخت کانفیگ انجام نشد.'
			};
		}
	}
);

export const createManagerTemplateCommand = command(
	z.object({
		name: z.string().trim().max(64, 'نام قالب نمی‌تواند بیشتر از ۶۴ کاراکتر باشد.').optional(),
		quotaGb: z.number().min(0.01, 'حجم قالب باید حداقل ۰.۰۱ گیگابایت باشد.').positive(),
		durationDays: z
			.number()
			.int('مدت باید عدد صحیح باشد.')
			.min(1, 'مدت قالب باید حداقل ۱ روز باشد.')
			.max(365, 'مدت قالب نمی‌تواند بیشتر از ۳۶۵ روز باشد.'),
		priceToman: z.number().int('قیمت باید عدد صحیح باشد.').min(0, 'قیمت نمی‌تواند منفی باشد.')
	}),
	async ({ name, quotaGb, durationDays, priceToman }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				templateError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			await createManagerConfigTemplate({ name, quotaGb, durationDays, priceToman });
			await getManageState().set(await buildManageState(true));

			return {
				templateSuccess: 'قالب سریع ذخیره شد.'
			};
		} catch (error) {
			return {
				templateError: error instanceof Error ? error.message : 'ذخیره قالب انجام نشد.'
			};
		}
	}
);

export const deleteManagerTemplateCommand = command(
	z.object({
		id: z.number().int().positive()
	}),
	async ({ id }) => {
		const cookies = await requireAdminSession();

		if (!cookies) {
			return {
				templateError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			await deleteManagerConfigTemplate(id);
			await getManageState().set(await buildManageState(true));

			return {
				templateSuccess: 'قالب حذف شد.'
			};
		} catch (error) {
			return {
				templateError: error instanceof Error ? error.message : 'حذف قالب انجام نشد.'
			};
		}
	}
);

// ── Feature 12: Reseller Group Management ─────────────────────────────────────

export const createGroup = form(
	z.object({
		name: z.string().trim().min(1, 'نام گروه را وارد کنید.').max(64),
		color: z.string().trim().max(32).optional().default('#6366f1'),
		badgeIcon: z.string().trim().max(64).optional().default('sparkle'),
		description: z.string().trim().max(256).optional().default('')
	}),
	async ({ name, color, badgeIcon, description }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { groupError: 'نشست منقضی شده است.' };
		try {
			await createResellerGroup({ name, color, badgeIcon, description });
			await getManageState().set(await buildManageState(true));
			return { groupSuccess: 'گروه ساخته شد.' };
		} catch (error) {
			return { groupError: error instanceof Error ? error.message : 'ساخت گروه انجام نشد.' };
		}
	}
);

export const editGroup = form(
	z.object({
		id: z.coerce.number().int().positive(),
		name: z.string().trim().min(1, 'نام گروه را وارد کنید.').max(64),
		color: z.string().trim().max(32).optional().default('#6366f1'),
		badgeIcon: z.string().trim().max(64).optional().default('sparkle'),
		description: z.string().trim().max(256).optional().default('')
	}),
	async ({ id, name, color, badgeIcon, description }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { groupError: 'نشست منقضی شده است.' };
		try {
			await updateResellerGroup(id, { name, color, badgeIcon, description });
			await getManageState().set(await buildManageState(true));
			return { groupSuccess: 'گروه ویرایش شد.' };
		} catch (error) {
			return { groupError: error instanceof Error ? error.message : 'ویرایش گروه انجام نشد.' };
		}
	}
);

export const removeGroup = command(
	z.object({ id: z.number().int().positive() }),
	async ({ id }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { groupError: 'نشست منقضی شده است.' };
		try {
			await deleteResellerGroup(id);
			await getManageState().set(await buildManageState(true));
			return { groupSuccess: 'گروه حذف شد.' };
		} catch (error) {
			return { groupError: error instanceof Error ? error.message : 'حذف گروه انجام نشد.' };
		}
	}
);

export const setResellerGroup = command(
	'unchecked',
	async ({ resellerId, groupId }: { resellerId: number; groupId: number | null }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { groupError: 'نشست منقضی شده است.' };
		try {
			await assignResellerToGroup(resellerId, groupId ?? null);
			await getManageState().set(await buildManageState(true));
			return { groupSuccess: 'گروه فروشنده تغییر کرد.' };
		} catch (error) {
			return { groupError: error instanceof Error ? error.message : 'تغییر گروه انجام نشد.' };
		}
	}
);

// ── Feature 11: Private Plan Access ───────────────────────────────────────────

export const togglePlanPublic = form(
	z.object({
		id: z.coerce.number().int().positive(),
		isPublic: z.enum(['true', 'false'])
	}),
	async ({ id, isPublic }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { planError: 'نشست منقضی شده است.' };
		try {
			await setResellerPlanPublic(id, isPublic === 'true');
			await getManageState().set(await buildManageState(true));
			return { planSuccess: isPublic === 'true' ? 'پلن عمومی شد.' : 'پلن خصوصی شد.' };
		} catch (error) {
			return { planError: error instanceof Error ? error.message : 'تغییر پلن انجام نشد.' };
		}
	}
);

export const grantPlanAccess = form(
	z.object({
		planId: z.coerce.number().int().positive(),
		resellerId: z.coerce.number().int().positive().optional(),
		groupId: z.coerce.number().int().positive().optional()
	}),
	async ({ planId, resellerId, groupId }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { planError: 'نشست منقضی شده است.' };
		try {
			await addResellerPlanAccess(planId, resellerId ?? null, groupId ?? null);
			await getManageState().set(await buildManageState(true));
			return { planSuccess: 'دسترسی به پلن اعطا شد.' };
		} catch (error) {
			return { planError: error instanceof Error ? error.message : 'اعطای دسترسی انجام نشد.' };
		}
	}
);

export const revokePlanAccess = form(
	z.object({
		planId: z.coerce.number().int().positive(),
		resellerId: z.coerce.number().int().positive().optional(),
		groupId: z.coerce.number().int().positive().optional()
	}),
	async ({ planId, resellerId, groupId }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { planError: 'نشست منقضی شده است.' };
		try {
			await removeResellerPlanAccess(planId, resellerId ?? null, groupId ?? null);
			await getManageState().set(await buildManageState(true));
			return { planSuccess: 'دسترسی به پلن لغو شد.' };
		} catch (error) {
			return { planError: error instanceof Error ? error.message : 'لغو دسترسی انجام نشد.' };
		}
	}
);

// ── Feature 10: Client tickets toggle (per-reseller) ──────────────────────────

export const toggleClientTickets = form(
	z.object({
		resellerId: z.coerce.number().int().positive(),
		enabled: z.enum(['true', 'false'])
	}),
	async ({ resellerId, enabled }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { clientTicketsError: 'نشست منقضی شده است.' };
		try {
			await setResellerClientTicketsEnabled(resellerId, enabled === 'true');
			await getManageState().set(await buildManageState(true));
			return {
				clientTicketsSuccess:
					enabled === 'true' ? 'تیکت مشتریان فعال شد.' : 'تیکت مشتریان غیرفعال شد.'
			};
		} catch (error) {
			return {
				clientTicketsError: error instanceof Error ? error.message : 'تغییر وضعیت انجام نشد.'
			};
		}
	}
);

export const toggleTelegramBotPermission = form(
	z.object({
		resellerId: z.coerce.number().int().positive(),
		enabled: z.enum(['true', 'false'])
	}),
	async ({ resellerId, enabled }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { telegramBotPermissionError: 'نشست منقضی شده است.' };
		try {
			await setResellerTelegramBotAllowed(resellerId, enabled === 'true');
			await getManageState().set(await buildManageState(true));
			return {
				telegramBotPermissionSuccess:
					enabled === 'true' ? 'مجوز بات تلگرام فعال شد.' : 'مجوز بات تلگرام غیرفعال شد.'
			};
		} catch (error) {
			return {
				telegramBotPermissionError:
					error instanceof Error ? error.message : 'تغییر مجوز بات انجام نشد.'
			};
		}
	}
);

export const forceDisconnectTelegramBot = form(
	z.object({ resellerId: z.coerce.number().int().positive() }),
	async ({ resellerId }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { telegramBotPermissionError: 'نشست منقضی شده است.' };
		try {
			await disconnectResellerTelegramBot(resellerId);
			await getManageState().set(await buildManageState(true));
			return { telegramBotPermissionSuccess: 'بات فروشنده قطع شد.' };
		} catch (error) {
			return {
				telegramBotPermissionError: error instanceof Error ? error.message : 'قطع بات انجام نشد.'
			};
		}
	}
);

export const revokeManagedResellerSession = form(
	z.object({
		resellerId: z.coerce.number().int().positive(),
		sessionId: z.coerce.number().int().positive()
	}),
	async ({ resellerId, sessionId }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { sessionError: 'نشست منقضی شده است.' };
		await revokeOwnResellerSession(resellerId, sessionId);
		await getManageState().set(await buildManageState(true));
		return { sessionSuccess: 'نشست فروشنده لغو شد.' };
	}
);

// ── Feature 14: Delete closed reseller tickets ────────────────────────────────

export const deleteManagerResellerTicket = form(
	z.object({ id: z.coerce.number().int().positive() }),
	async ({ id }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { ticketError: 'نشست منقضی شده است.' };
		try {
			await deleteResellerTicketAsManager(id);
			await getManageState().set(await buildManageState(true));
			return { ticketSuccess: 'تیکت حذف شد.' };
		} catch (error) {
			return { ticketError: error instanceof Error ? error.message : 'حذف تیکت انجام نشد.' };
		}
	}
);

// ── Feature 4: Manager manages configs from user panel ────────────────────────

export const adminRenewConfig = command(
	z.object({ requestId: z.number().int().positive() }),
	async ({ requestId }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { renewError: 'نشست منقضی شده است.' };
		const { url } = getRequestEvent();
		try {
			const usage = await managerRenewConfig(requestId, url.hostname);
			await getManageState().set(await buildManageState(true));
			return { renewSuccess: 'کانفیگ شارژ شد.', usage };
		} catch (error) {
			return { renewError: error instanceof Error ? error.message : 'شارژ مجدد انجام نشد.' };
		}
	}
);

export const adminToggleConfig = form(
	z.object({
		requestId: z.coerce.number().int().positive(),
		enabled: z.enum(['true', 'false'])
	}),
	async ({ requestId, enabled }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { toggleError: 'نشست منقضی شده است.' };
		try {
			await managerToggleConfig(requestId, enabled === 'true');
			await getManageState().set(await buildManageState(true));
			return { toggleSuccess: enabled === 'true' ? 'کانفیگ فعال شد.' : 'کانفیگ غیرفعال شد.' };
		} catch (error) {
			return { toggleError: error instanceof Error ? error.message : 'تغییر وضعیت انجام نشد.' };
		}
	}
);

export const adminAddQuota = command(
	z.object({
		requestId: z.number().int().positive(),
		addGb: z.number().positive().max(10000)
	}),
	async ({ requestId, addGb }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { quotaError: 'نشست منقضی شده است.' };
		const { url } = getRequestEvent();
		try {
			await managerAddQuota(requestId, addGb, url.hostname);
			await getManageState().set(await buildManageState(true));
			return { quotaSuccess: `${addGb} گیگابایت به کانفیگ اضافه شد.` };
		} catch (error) {
			return { quotaError: error instanceof Error ? error.message : 'افزودن حجم انجام نشد.' };
		}
	}
);

export const adminExtendDuration = command(
	z.object({
		requestId: z.number().int().positive(),
		addDays: z.number().int().positive().max(3650)
	}),
	async ({ requestId, addDays }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { extendError: 'نشست منقضی شده است.' };
		const { url } = getRequestEvent();
		try {
			await managerExtendDuration(requestId, addDays, url.hostname);
			await getManageState().set(await buildManageState(true));
			return { extendSuccess: `${addDays} روز به کانفیگ اضافه شد.` };
		} catch (error) {
			return { extendError: error instanceof Error ? error.message : 'افزودن روز انجام نشد.' };
		}
	}
);

export const adminToggleConfigCommand = command(
	z.object({
		id: z.number().int().positive(),
		enabled: z.boolean()
	}),
	async ({ id, enabled }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { toggleConfigError: 'نشست منقضی شده است.' };
		try {
			await managerToggleConfig(id, enabled);
			await getManageState().set(await buildManageState(true));
			return {
				toggleConfigSuccess: enabled ? 'کانفیگ فعال شد.' : 'کانفیگ غیرفعال شد.'
			};
		} catch (error) {
			return {
				toggleConfigError: error instanceof Error ? error.message : 'تغییر وضعیت انجام نشد.'
			};
		}
	}
);

export const adminRechargeConfigCommand = command(
	z.object({ id: z.number().int().positive() }),
	async ({ id }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { rechargeError: 'نشست منقضی شده است.' };
		const { url } = getRequestEvent();
		try {
			await managerRenewConfig(id, url.hostname);
			await getManageState().set(await buildManageState(true));
			return { rechargeSuccess: 'کانفیگ شارژ شد.' };
		} catch (error) {
			return {
				rechargeError: error instanceof Error ? error.message : 'شارژ مجدد انجام نشد.'
			};
		}
	}
);

export const adminAddQuotaCommand = command(
	z.object({
		id: z.number().int().positive(),
		addGb: z.number().positive().max(10000)
	}),
	async ({ id, addGb }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { addQuotaError: 'نشست منقضی شده است.' };
		const { url } = getRequestEvent();
		try {
			await managerAddQuota(id, addGb, url.hostname);
			await getManageState().set(await buildManageState(true));
			return { addQuotaSuccess: `${addGb} گیگابایت به کانفیگ اضافه شد.` };
		} catch (error) {
			return {
				addQuotaError: error instanceof Error ? error.message : 'افزایش حجم انجام نشد.'
			};
		}
	}
);

export const adminRevokeConfigCommand = command(
	z.object({ id: z.number().int().positive() }),
	async ({ id }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { revokeError: 'نشست منقضی شده است.' };
		const { url } = getRequestEvent();
		try {
			await revokeManagerConfig(id, url.hostname);
			await getManageState().set(await buildManageState(true));
			return { revokeSuccess: 'کانفیگ حذف شد.' };
		} catch (error) {
			return {
				revokeError: error instanceof Error ? error.message : 'لغو کانفیگ انجام نشد.'
			};
		}
	}
);

// ── Feature 1: SMTP settings (for forgot password email) ──────────────────────

export const updateSmtp = form(
	z
		.object({
			host: z.string().trim().max(255).optional().default(''),
			port: z.coerce.number().int().min(1).max(65535).optional().default(587),
			secure: z.enum(['true', 'false']).optional().default('false'),
			username: z.string().trim().max(255).optional().default(''),
			password: z.string().max(255).optional().default(''),
			fromAddress: z
				.union([z.string().trim().email('آدرس فرستنده معتبر نیست.').max(255), z.literal('')])
				.optional()
				.default(''),
			fromName: z.string().trim().max(128).optional().default('Skyline')
		})
		.superRefine((settings, ctx) => {
			if (Boolean(settings.host) !== Boolean(settings.fromAddress)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'برای فعال‌سازی ایمیل، هاست SMTP و آدرس فرستنده را هر دو وارد کنید.',
					path: [settings.host ? 'fromAddress' : 'host']
				});
			}
		}),
	async ({ host, port, secure, username, password, fromAddress, fromName }) => {
		const cookies = await requireAdminSession();
		if (!cookies) return { smtpError: 'نشست منقضی شده است.' };
		try {
			await updateSmtpSettings({
				host,
				port,
				secure: secure === 'true',
				username,
				password,
				fromAddress,
				fromName
			});
			await getManageState().set(await buildManageState(true));
			return { smtpSuccess: 'تنظیمات ایمیل ذخیره شد.' };
		} catch (error) {
			return { smtpError: error instanceof Error ? error.message : 'ذخیره تنظیمات انجام نشد.' };
		}
	}
);
