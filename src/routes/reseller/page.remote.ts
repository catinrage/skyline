import { command, form, getRequestEvent, query } from '$app/server';
import { logger } from '$lib/server/logger';
import { checkResellerActionRateLimit } from '$lib/server/rate-limit';
import { getSafeClientAddress } from '$lib/server/request';
import { getSmtpSettings } from '$lib/server/admin';
import { sendEmail, buildPasswordResetEmailHtml } from '$lib/server/email';
import {
	addResellerTicketMessage,
	authenticateReseller,
	closeResellerTicket,
	createCustomResellerRequest,
	createResellerConfigTemplate,
	createResellerCreditRequest,
	createResellerTicket,
	createResellerSession,
	createSubPackage,
	createSubResellerAccount,
	createSubResellerCreditRequest,
	deleteResellerConfigTemplate,
	deleteSubPackage,
	destroyResellerSession,
	getAuthenticatedReseller,
	getResellerDashboardState,
	addQuotaToResellerRequest,
	rechargeResellerRequest,
	resetSubResellerPassword,
	reviewSubResellerCreditRequest,
	revokeResellerRequest,
	setResellerRequestEnabled,
	setSubPackageActive,
	setSubResellerActive,
	transferGbToSubReseller,
	updateResellerCustomMessage,
	updateResellerPaymentCard,
	updateResellerPassword,
	updateResellerProfile,
	updateSubPackage,
	createPasswordResetToken,
	consumePasswordResetToken,
	createSubResellerTicket,
	addSubResellerTicketMessage,
	addParentResellerTicketMessage,
	closeSubResellerTicket,
	deleteSubResellerTicket,
	deleteResellerTicket,
	resellerToggleConfig,
	addSellerClientTicketMessage,
	closeClientTicket,
	deleteClientTicket,
	setResellerClientTicketsEnabled,
	revokeOwnResellerSession,
	connectResellerTelegramBot,
	disconnectResellerTelegramBot,
	pauseResellerTelegramBot,
	reviewTelegramBotOrder,
	syncResellerTelegramBotStatus
} from '$lib/server/resellers';
import { z } from 'zod';

const resellerLogger = logger.child('reseller-panel');

async function buildState() {
	const { cookies, url } = getRequestEvent();
	return getResellerDashboardState(cookies, url.origin, url.hostname);
}

async function requireReseller() {
	const { cookies } = getRequestEvent();
	return getAuthenticatedReseller(cookies, {
		refreshCookie: true,
		mutateCookies: true
	});
}

function checkActionRateLimit(action: string, resellerId: number) {
	const event = getRequestEvent();
	const ip = getSafeClientAddress(event);
	const result = checkResellerActionRateLimit(`${action}:${resellerId}:${ip}`, {
		maxRequests: action === 'login' ? 10 : 18,
		windowMs: 60_000
	});

	if (!result.allowed) {
		throw new Error(`درخواست‌های شما زیاد است. ${result.retryAfter} ثانیه دیگر دوباره تلاش کنید.`);
	}
}

export const getResellerState = query(async () => {
	return buildState();
});

export const logoutCommand = command(async () => {
	const { cookies } = getRequestEvent();
	await destroyResellerSession(cookies);
	await getResellerState().set(await buildState());

	return {
		logoutSuccess: 'از پنل فروشنده خارج شدید.'
	};
});

export const login = form(
	z.object({
		username: z.string().trim().min(1, 'نام کاربری را وارد کنید.'),
		password: z.string().min(1, 'گذرواژه را وارد کنید.')
	}),
	async ({ username, password }) => {
		const event = getRequestEvent();
		const { cookies } = event;
		const ip = getSafeClientAddress(event);

		const ipLimit = checkResellerActionRateLimit(`login:ip:${ip}`, {
			maxRequests: 20,
			windowMs: 60_000
		});

		if (!ipLimit.allowed) {
			resellerLogger.warn('Reseller login IP rate limited.', { ip });
			return {
				loginError: `تلاش‌های ورود زیاد است. ${ipLimit.retryAfter} ثانیه دیگر دوباره تلاش کنید.`
			};
		}

		const rateLimit = checkResellerActionRateLimit(`login:${username}:${ip}`, {
			maxRequests: 5,
			windowMs: 60_000
		});

		if (!rateLimit.allowed) {
			return {
				loginError: `تلاش‌های ورود زیاد است. ${rateLimit.retryAfter} ثانیه دیگر دوباره تلاش کنید.`
			};
		}

		const reseller = await authenticateReseller(username, password);

		if (!reseller) {
			resellerLogger.warn('Reseller login failed.', { username, ip });
			return {
				loginError: 'نام کاربری یا گذرواژه نادرست است.'
			};
		}

		await createResellerSession(
			cookies,
			reseller.id,
			event.request.headers.get('user-agent') ?? ''
		);
		await getResellerState().set(await buildState());

		return {
			loginSuccess: 'با موفقیت وارد شدید.'
		};
	}
);

export const logout = form(async () => {
	const { cookies } = getRequestEvent();
	await destroyResellerSession(cookies);
	await getResellerState().set(await buildState());

	return {
		logoutSuccess: 'از پنل فروشنده خارج شدید.'
	};
});

export const createConfig = form(
	z.object({
		planId: z.coerce.number().int().positive('پلن انتخاب نشده است.'),
		customerLabel: z.string().trim().max(64, 'نام مشتری نمی‌تواند بیشتر از ۶۴ کاراکتر باشد.'),
		internalNote: z
			.string()
			.trim()
			.max(500, 'یادداشت نمی‌تواند بیشتر از ۵۰۰ کاراکتر باشد.')
			.optional()
	}),
	async ({ planId, customerLabel, internalNote }) => {
		const reseller = await requireReseller();

		if (!reseller) {
			return {
				createError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		void planId;
		void customerLabel;
		void internalNote;

		return {
			createError: 'ساخت کانفیگ فقط از مسیر موجودی گیگابایت امکان‌پذیر است.'
		};
	}
);

export const createConfigCommand = command(
	z.object({
		planId: z.number().int().positive('پلن انتخاب نشده است.'),
		customerLabel: z.string().trim().max(64, 'نام مشتری نمی‌تواند بیشتر از ۶۴ کاراکتر باشد.'),
		internalNote: z
			.string()
			.trim()
			.max(500, 'یادداشت نمی‌تواند بیشتر از ۵۰۰ کاراکتر باشد.')
			.optional()
	}),
	async ({ planId, customerLabel, internalNote }) => {
		const reseller = await requireReseller();

		if (!reseller) {
			return {
				createError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		void planId;
		void customerLabel;
		void internalNote;

		return {
			createError: 'ساخت کانفیگ فقط از مسیر موجودی گیگابایت امکان‌پذیر است.'
		};
	}
);

export const createCustomConfigCommand = command(
	z.object({
		inboundId: z.number().int().positive('سرور انتخاب نشده است.'),
		quotaGb: z
			.number()
			.min(0.01, 'حجم کانفیگ باید حداقل ۰.۰۱ گیگابایت باشد.')
			.positive(),
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
		const reseller = await requireReseller();
		const { url } = getRequestEvent();

		if (!reseller) {
			return {
				createError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('create', reseller.id);
			const request = await createCustomResellerRequest(
				reseller.id,
				{ inboundId, quotaGb, durationDays, priceToman, templateId },
				customerLabel,
				internalNote ?? '',
				url.origin,
				url.hostname
			);
			await getResellerState().set(await buildState());

			return {
				createSuccess: 'کانفیگ ساخته شد.',
				createdRequestId: request.id
			};
		} catch (error) {
			return {
				createError: error instanceof Error ? error.message : 'ساخت کانفیگ انجام نشد.'
			};
		}
	}
);

export const createTemplateCommand = command(
	z.object({
		name: z.string().trim().max(64, 'نام قالب نمی‌تواند بیشتر از ۶۴ کاراکتر باشد.').optional(),
		quotaGb: z
			.number()
			.min(0.01, 'حجم قالب باید حداقل ۰.۰۱ گیگابایت باشد.')
			.positive(),
		durationDays: z
			.number()
			.int('مدت باید عدد صحیح باشد.')
			.min(1, 'مدت قالب باید حداقل ۱ روز باشد.')
			.max(365, 'مدت قالب نمی‌تواند بیشتر از ۳۶۵ روز باشد.'),
		priceToman: z.number().int('قیمت باید عدد صحیح باشد.').min(0, 'قیمت نمی‌تواند منفی باشد.')
	}),
	async ({ name, quotaGb, durationDays, priceToman }) => {
		const reseller = await requireReseller();

		if (!reseller) {
			return {
				templateError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('template', reseller.id);
			await createResellerConfigTemplate(reseller.id, { name, quotaGb, durationDays, priceToman });
			await getResellerState().set(await buildState());

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

export const deleteTemplateCommand = command(
	z.object({
		id: z.number().int().positive()
	}),
	async ({ id }) => {
		const reseller = await requireReseller();

		if (!reseller) {
			return {
				templateError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('template-delete', reseller.id);
			await deleteResellerConfigTemplate(reseller.id, id);
			await getResellerState().set(await buildState());

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

export const connectTelegramBotCommand = command(
	z.object({
		token: z.string().trim().min(20, 'توکن بات تلگرام را وارد کنید.')
	}),
	async ({ token }) => {
		const reseller = await requireReseller();
		const { url } = getRequestEvent();
		if (!reseller) return { telegramBotError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
		try {
			checkActionRateLimit('telegram-bot-connect', reseller.id);
			await connectResellerTelegramBot(reseller.id, token, url.origin);
			await getResellerState().set(await buildState());
			return { telegramBotSuccess: 'بات تلگرام متصل شد.' };
		} catch (error) {
			return {
				telegramBotError: error instanceof Error ? error.message : 'اتصال بات انجام نشد.'
			};
		}
	}
);

export const pauseTelegramBotCommand = command(
	z.object({ paused: z.boolean() }),
	async ({ paused }) => {
		const reseller = await requireReseller();
		if (!reseller) return { telegramBotError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
		await pauseResellerTelegramBot(reseller.id, paused);
		await getResellerState().set(await buildState());
		return { telegramBotSuccess: paused ? 'بات متوقف شد.' : 'بات فعال شد.' };
	}
);

export const disconnectTelegramBotCommand = command(async () => {
	const reseller = await requireReseller();
	if (!reseller) return { telegramBotError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
	await disconnectResellerTelegramBot(reseller.id);
	await getResellerState().set(await buildState());
	return { telegramBotSuccess: 'بات تلگرام قطع شد.' };
});

export const checkTelegramBotCommand = command(async () => {
	const reseller = await requireReseller();
	if (!reseller) return { telegramBotError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
	try {
		checkActionRateLimit('telegram-bot-check', reseller.id);
		const info = await syncResellerTelegramBotStatus(reseller.id);
		await getResellerState().set(await buildState());
		return {
			telegramBotSuccess: info.issue
				? `تلگرام خطا گزارش کرده است: ${info.issue}`
				: 'وبهوک تلگرام سالم است.'
		};
	} catch (error) {
		return {
			telegramBotError: error instanceof Error ? error.message : 'بررسی وبهوک انجام نشد.'
		};
	}
});

export const reviewTelegramOrderCommand = command(
	z.object({
		orderId: z.number().int().positive(),
		action: z.enum(['approve', 'reject', 'retry']),
		note: z.string().trim().max(500).optional()
	}),
	async ({ orderId, action, note }) => {
		const reseller = await requireReseller();
		const { url } = getRequestEvent();
		if (!reseller) return { telegramOrderError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
		try {
			checkActionRateLimit('telegram-order-review', reseller.id);
			await reviewTelegramBotOrder(reseller.id, orderId, action, note ?? '', url.origin, url.hostname);
			await getResellerState().set(await buildState());
			return { telegramOrderSuccess: 'وضعیت سفارش به‌روزرسانی شد.' };
		} catch (error) {
			return {
				telegramOrderError: error instanceof Error ? error.message : 'بررسی سفارش انجام نشد.'
			};
		}
	}
);

export const requestCreditPackageCommand = command(
	z.object({
		packageId: z.number().int().positive('بسته شارژ انتخاب نشده است.'),
		receiptText: z.string().trim().max(2000, 'متن رسید نمی‌تواند بیشتر از ۲۰۰۰ کاراکتر باشد.'),
		receiptFileName: z.string().trim().max(120).nullable().optional(),
		receiptMimeType: z.string().trim().max(40).nullable().optional(),
		receiptDataBase64: z.string().max(7_000_000).nullable().optional(),
		receiptSizeBytes: z
			.number()
			.int()
			.positive()
			.max(5 * 1024 * 1024)
			.nullable()
			.optional()
	}),
	async ({
		packageId,
		receiptText,
		receiptFileName,
		receiptMimeType,
		receiptDataBase64,
		receiptSizeBytes
	}) => {
		const reseller = await requireReseller();

		if (!reseller) {
			return {
				creditRequestError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('credit-request', reseller.id);
			await createResellerCreditRequest({
				resellerId: reseller.id,
				packageId,
				receiptText,
				receiptFileName,
				receiptMimeType,
				receiptDataBase64,
				receiptSizeBytes
			});
			await getResellerState().set(await buildState());

			return {
				creditRequestSuccess:
					'درخواست شارژ ثبت شد و بعد از تایید مدیر به موجودی گیگ شما اضافه می‌شود.'
			};
		} catch (error) {
			return {
				creditRequestError: error instanceof Error ? error.message : 'ثبت درخواست شارژ انجام نشد.'
			};
		}
	}
);

export const revokeConfig = form(
	z.object({
		id: z.coerce.number().int().positive()
	}),
	async ({ id }) => {
		const reseller = await requireReseller();
		const { url } = getRequestEvent();

		if (!reseller) {
			return {
				revokeError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('revoke', reseller.id);
			await revokeResellerRequest(reseller.id, id, url.hostname);
			await getResellerState().set(await buildState());

			return {
				revokeSuccess: 'کانفیگ لغو شد، از x-ui حذف شد و گیگ مصرف‌شده آن به اعتبار شما برگشت.'
			};
		} catch (error) {
			return {
				revokeError: error instanceof Error ? error.message : 'لغو کانفیگ انجام نشد.'
			};
		}
	}
);

export const revokeConfigCommand = command(
	z.object({
		id: z.number().int().positive()
	}),
	async ({ id }) => {
		const reseller = await requireReseller();
		const { url } = getRequestEvent();

		if (!reseller) {
			return {
				revokeError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('revoke', reseller.id);
			await revokeResellerRequest(reseller.id, id, url.hostname);
			await getResellerState().set(await buildState());

			return {
				revokeSuccess: 'کانفیگ لغو شد، از x-ui حذف شد و گیگ مصرف‌شده آن به اعتبار شما برگشت.'
			};
		} catch (error) {
			return {
				revokeError: error instanceof Error ? error.message : 'لغو کانفیگ انجام نشد.'
			};
		}
	}
);

export const rechargeConfig = form(
	z.object({
		id: z.coerce.number().int().positive()
	}),
	async ({ id }) => {
		const reseller = await requireReseller();

		if (!reseller) {
			return {
				rechargeError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		const { url } = getRequestEvent();

		try {
			checkActionRateLimit('recharge', reseller.id);
			const request = await rechargeResellerRequest(reseller.id, id, url.origin, url.hostname);
			await getResellerState().set(await buildState());

			return {
				rechargeSuccess: `شارژ انجام شد و ${request.quotaGbSnapshot.toLocaleString('fa-IR-u-nu-latn')} گیگ از موجودی شما کسر شد.`
			};
		} catch (error) {
			return {
				rechargeError: error instanceof Error ? error.message : 'شارژ مجدد انجام نشد.'
			};
		}
	}
);

export const rechargeConfigCommand = command(
	z.object({
		id: z.number().int().positive()
	}),
	async ({ id }) => {
		const reseller = await requireReseller();
		const { url } = getRequestEvent();

		if (!reseller) {
			return {
				rechargeError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('recharge', reseller.id);
			const request = await rechargeResellerRequest(reseller.id, id, url.origin, url.hostname);
			await getResellerState().set(await buildState());

			return {
				rechargeSuccess: `شارژ انجام شد و ${request.quotaGbSnapshot.toLocaleString('fa-IR-u-nu-latn')} گیگ از موجودی شما کسر شد.`
			};
		} catch (error) {
			return {
				rechargeError: error instanceof Error ? error.message : 'شارژ مجدد انجام نشد.'
			};
		}
	}
);

export const addQuotaCommand = command(
	z.object({
		id: z.number().int().positive(),
		addGb: z.number().positive()
	}),
	async ({ id, addGb }) => {
		const reseller = await requireReseller();
		const { url } = getRequestEvent();

		if (!reseller) {
			return {
				addQuotaError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('recharge', reseller.id);
			const request = await addQuotaToResellerRequest(
				reseller.id,
				id,
				addGb,
				url.origin,
				url.hostname
			);
			await getResellerState().set(await buildState());

			return {
				addQuotaSuccess: `${addGb.toLocaleString('fa-IR-u-nu-latn')} گیگ به کانفیگ اضافه شد.`
			};
		} catch (error) {
			return {
				addQuotaError: error instanceof Error ? error.message : 'افزایش حجم انجام نشد.'
			};
		}
	}
);

export const toggleConfigEnabled = form(
	z.object({
		id: z.coerce.number().int().positive(),
		enabled: z.enum(['true', 'false'])
	}),
	async ({ id, enabled }) => {
		const reseller = await requireReseller();

		if (!reseller) {
			return {
				toggleConfigError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('toggle-config', reseller.id);
			await setResellerRequestEnabled(reseller.id, id, enabled === 'true');
			await getResellerState().set(await buildState());

			return {
				toggleConfigSuccess: enabled === 'true' ? 'کانفیگ فعال شد.' : 'کانفیگ غیرفعال شد.'
			};
		} catch (error) {
			return {
				toggleConfigError: error instanceof Error ? error.message : 'تغییر وضعیت کانفیگ انجام نشد.'
			};
		}
	}
);

export const toggleConfigEnabledCommand = command(
	z.object({
		id: z.number().int().positive(),
		enabled: z.boolean()
	}),
	async ({ id, enabled }) => {
		const reseller = await requireReseller();

		if (!reseller) {
			return {
				toggleConfigError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('toggle-config', reseller.id);
			await setResellerRequestEnabled(reseller.id, id, enabled);
			await getResellerState().set(await buildState());

			return {
				toggleConfigSuccess: enabled ? 'کانفیگ فعال شد.' : 'کانفیگ غیرفعال شد.'
			};
		} catch (error) {
			return {
				toggleConfigError: error instanceof Error ? error.message : 'تغییر وضعیت کانفیگ انجام نشد.'
			};
		}
	}
);

export const changePassword = form(
	z
		.object({
			currentPassword: z.string().min(1, 'گذرواژه فعلی را وارد کنید.'),
			nextPassword: z.string().min(4, 'گذرواژه جدید باید حداقل ۴ کاراکتر باشد.'),
			confirmPassword: z.string().min(1, 'تکرار گذرواژه را وارد کنید.'),
			email: z.string().trim().max(254).optional()
		})
		.refine((values) => values.nextPassword === values.confirmPassword, {
			message: 'تکرار گذرواژه جدید مطابقت ندارد.',
			path: ['confirmPassword']
		}),
	async ({ currentPassword, nextPassword, email }) => {
		const reseller = await requireReseller();

		if (!reseller) {
			return {
				passwordError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('password', reseller.id);
			await updateResellerPassword(reseller.id, currentPassword, nextPassword, email);
			await getResellerState().set(await buildState());
			return {
				passwordSuccess: 'گذرواژه با موفقیت تغییر کرد.'
			};
		} catch (error) {
			return {
				passwordError: error instanceof Error ? error.message : 'تغییر گذرواژه انجام نشد.'
			};
		}
	}
);

export const updateProfileCommand = command(
	z.object({
		email: z.string().trim().max(254, 'ایمیل بیش از حد طولانی است.')
	}),
	async ({ email }) => {
		const reseller = await requireReseller();

		if (!reseller) {
			return {
				profileError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('profile', reseller.id);
			await updateResellerProfile(reseller.id, email);
			await getResellerState().set(await buildState());

			return {
				profileSuccess: 'اطلاعات حساب ذخیره شد.'
			};
		} catch (error) {
			return {
				profileError: error instanceof Error ? error.message : 'ذخیره اطلاعات حساب انجام نشد.'
			};
		}
	}
);

export const updateResellerPaymentCardCommand = command(
	z.object({
		cardNumber: z.string().trim().max(32, 'شماره کارت بیش از حد طولانی است.').optional().default(''),
		cardOwnerName: z.string().trim().max(80, 'نام صاحب کارت بیش از حد طولانی است.').optional().default('')
	}),
	async ({ cardNumber, cardOwnerName }) => {
		const reseller = await requireReseller();

		if (!reseller) {
			return {
				paymentCardError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('payment-card', reseller.id);
			await updateResellerPaymentCard(reseller.id, { cardNumber, cardOwnerName });
			await getResellerState().set(await buildState());

			return {
				paymentCardSuccess: 'اطلاعات کارت پرداخت ذخیره شد.'
			};
		} catch (error) {
			return {
				paymentCardError: error instanceof Error ? error.message : 'ذخیره اطلاعات کارت انجام نشد.'
			};
		}
	}
);

export const toggleOwnClientTicketsCommand = command(
	z.object({ enabled: z.boolean() }),
	async ({ enabled }) => {
		const reseller = await requireReseller();
		if (!reseller) return { clientTicketsError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
		try {
			await setResellerClientTicketsEnabled(reseller.id, enabled);
			await getResellerState().set(await buildState());
			return {
				clientTicketsSuccess: enabled ? 'تیکت مشتریان فعال شد.' : 'تیکت مشتریان غیرفعال شد.'
			};
		} catch (error) {
			return {
				clientTicketsError: error instanceof Error ? error.message : 'تغییر وضعیت انجام نشد.'
			};
		}
	}
);

export const revokeOwnSessionCommand = command(
	z.object({ sessionId: z.number().int().positive() }),
	async ({ sessionId }) => {
		const reseller = await requireReseller();
		if (!reseller) return { sessionError: 'نشست شما منقضی شده است.' };
		await revokeOwnResellerSession(reseller.id, sessionId);
		await getResellerState().set(await buildState());
		return { sessionSuccess: 'نشست لغو شد.' };
	}
);

export const changePasswordCommand = command(
	z
		.object({
			currentPassword: z.string().min(1, 'گذرواژه فعلی را وارد کنید.'),
			nextPassword: z.string().min(4, 'گذرواژه جدید باید حداقل ۴ کاراکتر باشد.'),
			confirmPassword: z.string().min(1, 'تکرار گذرواژه را وارد کنید.'),
			email: z.string().trim().max(254).optional()
		})
		.refine((values) => values.nextPassword === values.confirmPassword, {
			message: 'تکرار گذرواژه جدید مطابقت ندارد.',
			path: ['confirmPassword']
		}),
	async ({ currentPassword, nextPassword, email }) => {
		const reseller = await requireReseller();

		if (!reseller) {
			return {
				passwordError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('password', reseller.id);
			await updateResellerPassword(reseller.id, currentPassword, nextPassword, email);
			await getResellerState().set(await buildState());
			return {
				passwordSuccess: 'گذرواژه با موفقیت تغییر کرد.'
			};
		} catch (error) {
			return {
				passwordError: error instanceof Error ? error.message : 'تغییر گذرواژه انجام نشد.'
			};
		}
	}
);

export const updateMessage = form(
	z.object({
		message: z.string().trim().max(5000, 'پیام نمی‌تواند بیشتر از ۵۰۰۰ کاراکتر باشد.')
	}),
	async ({ message }) => {
		const reseller = await requireReseller();

		if (!reseller) {
			return {
				messageError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('message', reseller.id);
			await updateResellerCustomMessage(reseller.id, message);
			await getResellerState().set(await buildState());

			return {
				messageSuccess: 'پیام اختصاصی شما برای مشتریان ذخیره شد.'
			};
		} catch (error) {
			return {
				messageError: error instanceof Error ? error.message : 'ذخیره پیام انجام نشد.'
			};
		}
	}
);

export const updateMessageCommand = command(
	z.object({
		message: z.string().trim().max(5000, 'پیام نمی‌تواند بیشتر از ۵۰۰۰ کاراکتر باشد.')
	}),
	async ({ message }) => {
		const reseller = await requireReseller();

		if (!reseller) {
			return {
				messageError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('message', reseller.id);
			await updateResellerCustomMessage(reseller.id, message);
			await getResellerState().set(await buildState());

			return {
				messageSuccess: 'پیام اختصاصی شما برای مشتریان ذخیره شد.'
			};
		} catch (error) {
			return {
				messageError: error instanceof Error ? error.message : 'ذخیره پیام انجام نشد.'
			};
		}
	}
);

export const createSupportTicketCommand = command(
	z.object({
		subject: z.string().trim().max(120, 'عنوان نمی‌تواند بیشتر از ۱۲۰ کاراکتر باشد.'),
		message: z.string().trim().max(5000, 'متن تیکت خیلی طولانی است.'),
		attachments: z
			.array(
				z.object({
					fileName: z.string().trim().max(120),
					mimeType: z.string().trim().max(40),
					dataBase64: z.string().max(7_000_000),
					sizeBytes: z
						.number()
						.int()
						.positive()
						.max(5 * 1024 * 1024)
				})
			)
			.max(3)
			.default([])
	}),
	async ({ subject, message, attachments }) => {
		const reseller = await requireReseller();

		if (!reseller) {
			return {
				ticketError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('ticket', reseller.id);
			await createResellerTicket(reseller.id, subject, message, attachments);
			await getResellerState().set(await buildState());

			return {
				ticketSuccess: 'تیکت برای مدیر ثبت شد.'
			};
		} catch (error) {
			return {
				ticketError: error instanceof Error ? error.message : 'ثبت تیکت انجام نشد.'
			};
		}
	}
);

export const replySupportTicketCommand = command(
	z.object({
		ticketId: z.number().int().positive(),
		message: z.string().trim().max(5000, 'متن پاسخ خیلی طولانی است.'),
		attachments: z
			.array(
				z.object({
					fileName: z.string().trim().max(120),
					mimeType: z.string().trim().max(40),
					dataBase64: z.string().max(7_000_000),
					sizeBytes: z
						.number()
						.int()
						.positive()
						.max(5 * 1024 * 1024)
				})
			)
			.max(3)
			.default([])
	}),
	async ({ ticketId, message, attachments }) => {
		const reseller = await requireReseller();

		if (!reseller) {
			return {
				ticketError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('ticket-reply', reseller.id);
			await addResellerTicketMessage(reseller.id, ticketId, message, attachments);
			await getResellerState().set(await buildState());

			return {
				ticketSuccess: 'پاسخ تیکت ارسال شد.'
			};
		} catch (error) {
			return {
				ticketError: error instanceof Error ? error.message : 'ارسال پاسخ انجام نشد.'
			};
		}
	}
);

export const closeSupportTicketCommand = command(
	z.object({
		ticketId: z.number().int().positive()
	}),
	async ({ ticketId }) => {
		const reseller = await requireReseller();

		if (!reseller) {
			return {
				ticketError: 'نشست شما منقضی شده است. دوباره وارد شوید.'
			};
		}

		try {
			checkActionRateLimit('ticket-close', reseller.id);
			await closeResellerTicket(ticketId, reseller.id);
			await getResellerState().set(await buildState());

			return {
				ticketSuccess: 'تیکت بسته شد.'
			};
		} catch (error) {
			return {
				ticketError: error instanceof Error ? error.message : 'بستن تیکت انجام نشد.'
			};
		}
	}
);

// ── Sub-reseller management commands ─────────────────────────────────────────

export const createSubResellerCommand = command(
	z.object({
		username: z
			.string()
			.trim()
			.min(3, 'نام کاربری باید حداقل ۳ کاراکتر باشد.')
			.max(32, 'نام کاربری نمی‌تواند بیشتر از ۳۲ کاراکتر باشد.')
	}),
	async ({ username }) => {
		const reseller = await requireReseller();
		if (!reseller) return { subResellerError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };

		try {
			checkActionRateLimit('sub-create', reseller.id);
			const { randomBytes } = await import('node:crypto');
			const password = randomBytes(5).toString('hex');
			await createSubResellerAccount(reseller.id, username, password);
			await getResellerState().set(await buildState());
			return {
				subResellerSuccess: `زیرفروشنده «${username}» ساخته شد.`,
				subResellerPassword: password
			};
		} catch (error) {
			return {
				subResellerError: error instanceof Error ? error.message : 'ساخت زیرفروشنده انجام نشد.'
			};
		}
	}
);

export const setSubResellerActiveCommand = command(
	z.object({
		subResellerId: z.number().int().positive(),
		isActive: z.boolean()
	}),
	async ({ subResellerId, isActive }) => {
		const reseller = await requireReseller();
		if (!reseller) return { subResellerError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };

		try {
			checkActionRateLimit('sub-toggle', reseller.id);
			await setSubResellerActive(subResellerId, reseller.id, isActive);
			await getResellerState().set(await buildState());
			return { subResellerSuccess: isActive ? 'زیرفروشنده فعال شد.' : 'زیرفروشنده غیرفعال شد.' };
		} catch (error) {
			return {
				subResellerError: error instanceof Error ? error.message : 'تغییر وضعیت انجام نشد.'
			};
		}
	}
);

export const resetSubResellerPasswordCommand = command(
	z.object({
		subResellerId: z.number().int().positive()
	}),
	async ({ subResellerId }) => {
		const reseller = await requireReseller();
		if (!reseller) return { subResellerError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };

		try {
			checkActionRateLimit('sub-reset-password', reseller.id);
			const newPassword = await resetSubResellerPassword(subResellerId, reseller.id);
			await getResellerState().set(await buildState());
			return { subResellerSuccess: 'گذرواژه بازنشانی شد.', subResellerPassword: newPassword };
		} catch (error) {
			return {
				subResellerError: error instanceof Error ? error.message : 'بازنشانی گذرواژه انجام نشد.'
			};
		}
	}
);

export const transferGbToSubResellerCommand = command(
	z.object({
		subResellerId: z.number().int().positive(),
		amountGb: z.number().int().min(1, 'مقدار انتقال باید حداقل ۱ گیگابایت باشد.')
	}),
	async ({ subResellerId, amountGb }) => {
		const reseller = await requireReseller();
		if (!reseller) return { transferError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };

		try {
			checkActionRateLimit('sub-transfer', reseller.id);
			await transferGbToSubReseller(reseller.id, subResellerId, amountGb);
			await getResellerState().set(await buildState());
			return { transferSuccess: `${amountGb} گیگابایت منتقل شد.` };
		} catch (error) {
			return {
				transferError: error instanceof Error ? error.message : 'انتقال گیگابایت انجام نشد.'
			};
		}
	}
);

export const createSubPackageCommand = command(
	z.object({
		quotaGb: z.number().min(0.01, 'حجم باید حداقل ۰.۰۱ گیگابایت باشد.').positive(),
		priceToman: z.number().int().min(0, 'قیمت نمی‌تواند منفی باشد.')
	}),
	async ({ quotaGb, priceToman }) => {
		const reseller = await requireReseller();
		if (!reseller) return { subPackageError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };

		try {
			checkActionRateLimit('sub-package', reseller.id);
			await createSubPackage(reseller.id, quotaGb, priceToman);
			await getResellerState().set(await buildState());
			return { subPackageSuccess: 'بسته شارژ زیرفروشنده ایجاد شد.' };
		} catch (error) {
			return { subPackageError: error instanceof Error ? error.message : 'ایجاد بسته انجام نشد.' };
		}
	}
);

export const updateSubPackageCommand = command(
	z.object({
		id: z.number().int().positive(),
		quotaGb: z.number().min(0.01, 'حجم باید حداقل ۰.۰۱ گیگابایت باشد.').positive(),
		priceToman: z.number().int().min(0, 'قیمت نمی‌تواند منفی باشد.')
	}),
	async ({ id, quotaGb, priceToman }) => {
		const reseller = await requireReseller();
		if (!reseller) return { subPackageError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };

		try {
			checkActionRateLimit('sub-package', reseller.id);
			await updateSubPackage(id, reseller.id, quotaGb, priceToman);
			await getResellerState().set(await buildState());
			return { subPackageSuccess: 'بسته شارژ بروزرسانی شد.' };
		} catch (error) {
			return {
				subPackageError: error instanceof Error ? error.message : 'بروزرسانی بسته انجام نشد.'
			};
		}
	}
);

export const setSubPackageActiveCommand = command(
	z.object({
		id: z.number().int().positive(),
		isActive: z.boolean()
	}),
	async ({ id, isActive }) => {
		const reseller = await requireReseller();
		if (!reseller) return { subPackageError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };

		try {
			checkActionRateLimit('sub-package', reseller.id);
			await setSubPackageActive(id, reseller.id, isActive);
			await getResellerState().set(await buildState());
			return { subPackageSuccess: isActive ? 'بسته فعال شد.' : 'بسته غیرفعال شد.' };
		} catch (error) {
			return {
				subPackageError: error instanceof Error ? error.message : 'تغییر وضعیت بسته انجام نشد.'
			};
		}
	}
);

export const deleteSubPackageCommand = command(
	z.object({ id: z.number().int().positive() }),
	async ({ id }) => {
		const reseller = await requireReseller();
		if (!reseller) return { subPackageError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };

		try {
			checkActionRateLimit('sub-package', reseller.id);
			await deleteSubPackage(id, reseller.id);
			await getResellerState().set(await buildState());
			return { subPackageSuccess: 'بسته حذف شد.' };
		} catch (error) {
			return { subPackageError: error instanceof Error ? error.message : 'حذف بسته انجام نشد.' };
		}
	}
);

export const reviewSubCreditRequestCommand = command(
	z.object({
		id: z.number().int().positive(),
		status: z.enum(['approved', 'rejected']),
		parentNote: z.string().trim().max(500).optional()
	}),
	async ({ id, status, parentNote }) => {
		const reseller = await requireReseller();
		if (!reseller) return { subCreditRequestError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };

		try {
			checkActionRateLimit('sub-credit-review', reseller.id);
			await reviewSubResellerCreditRequest(id, reseller.id, status, parentNote);
			await getResellerState().set(await buildState());
			return {
				subCreditRequestSuccess:
					status === 'approved' ? 'درخواست تأیید شد و گیگابایت منتقل شد.' : 'درخواست رد شد.'
			};
		} catch (error) {
			return {
				subCreditRequestError: error instanceof Error ? error.message : 'بررسی درخواست انجام نشد.'
			};
		}
	}
);

// Sub-reseller submits credit request to parent
export const requestSubCreditPackageCommand = command(
	z.object({
		packageId: z.number().int().positive('بسته شارژ انتخاب نشده است.'),
		receiptText: z.string().trim().max(2000),
		receiptFileName: z.string().trim().max(120).nullable().optional(),
		receiptMimeType: z.string().trim().max(40).nullable().optional(),
		receiptDataBase64: z.string().max(7_000_000).nullable().optional(),
		receiptSizeBytes: z
			.number()
			.int()
			.positive()
			.max(5 * 1024 * 1024)
			.nullable()
			.optional()
	}),
	async ({
		packageId,
		receiptText,
		receiptFileName,
		receiptMimeType,
		receiptDataBase64,
		receiptSizeBytes
	}) => {
		const reseller = await requireReseller();
		if (!reseller) return { creditRequestError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };

		try {
			checkActionRateLimit('credit-request', reseller.id);
			await createSubResellerCreditRequest({
				subResellerId: reseller.id,
				packageId,
				receiptText,
				receiptFileName,
				receiptMimeType,
				receiptDataBase64,
				receiptSizeBytes
			});
			await getResellerState().set(await buildState());
			return {
				creditRequestSuccess:
					'درخواست شارژ ثبت شد و بعد از تأیید فروشنده والد به موجودی شما اضافه می‌شود.'
			};
		} catch (error) {
			return {
				creditRequestError: error instanceof Error ? error.message : 'ثبت درخواست شارژ انجام نشد.'
			};
		}
	}
);

// ── Feature 9: Sub-reseller ↔ Reseller Ticket System ─────────────────────────

export const createSubResellerTicketCommand = command(
	z.object({
		subject: z.string().trim().min(1, 'موضوع را وارد کنید.').max(128),
		message: z.string().trim().min(1, 'متن تیکت را وارد کنید.').max(2000)
	}),
	async ({ subject, message }) => {
		const reseller = await requireReseller();
		if (!reseller) return { ticketError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
		try {
			checkActionRateLimit('sub-ticket', reseller.id);
			await createSubResellerTicket(reseller.id, subject, message);
			await getResellerState().set(await buildState());
			return { ticketSuccess: 'تیکت ارسال شد.' };
		} catch (error) {
			return { ticketError: error instanceof Error ? error.message : 'ارسال تیکت انجام نشد.' };
		}
	}
);

export const replySubResellerTicketCommand = command(
	z.object({
		ticketId: z.number().int().positive(),
		message: z.string().trim().min(1, 'متن پیام را وارد کنید.').max(2000),
		attachments: z
			.array(
				z.object({
					fileName: z.string().trim().max(120),
					mimeType: z.string().trim().max(40),
					dataBase64: z.string().max(7_000_000),
					sizeBytes: z
						.number()
						.int()
						.positive()
						.max(5 * 1024 * 1024)
				})
			)
			.max(3)
			.default([])
	}),
	async ({ ticketId, message, attachments }) => {
		const reseller = await requireReseller();
		if (!reseller) return { ticketError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
		try {
			checkActionRateLimit('sub-ticket-reply', reseller.id);
			if (reseller.parentResellerId) {
				await addSubResellerTicketMessage(ticketId, reseller.id, message, attachments);
			} else {
				await addParentResellerTicketMessage(ticketId, reseller.id, message, attachments);
			}
			await getResellerState().set(await buildState());
			return { ticketSuccess: 'پیام ارسال شد.' };
		} catch (error) {
			return { ticketError: error instanceof Error ? error.message : 'ارسال پیام انجام نشد.' };
		}
	}
);

export const closeSubResellerTicketCommand = command(
	z.object({ ticketId: z.number().int().positive() }),
	async ({ ticketId }) => {
		const reseller = await requireReseller();
		if (!reseller) return { ticketError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
		try {
			await closeSubResellerTicket(ticketId, reseller.id);
			await getResellerState().set(await buildState());
			return { ticketSuccess: 'تیکت بسته شد.' };
		} catch (error) {
			return { ticketError: error instanceof Error ? error.message : 'بستن تیکت انجام نشد.' };
		}
	}
);

export const deleteSubResellerTicketCommand = command(
	z.object({ ticketId: z.number().int().positive() }),
	async ({ ticketId }) => {
		const reseller = await requireReseller();
		if (!reseller) return { ticketError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
		try {
			await deleteSubResellerTicket(ticketId, reseller.id);
			await getResellerState().set(await buildState());
			return { ticketSuccess: 'تیکت حذف شد.' };
		} catch (error) {
			return { ticketError: error instanceof Error ? error.message : 'حذف تیکت انجام نشد.' };
		}
	}
);

// ── Feature 14: Delete closed reseller↔manager tickets ────────────────────────

export const deleteResellerTicketCommand = command(
	z.object({ ticketId: z.number().int().positive() }),
	async ({ ticketId }) => {
		const reseller = await requireReseller();
		if (!reseller) return { ticketError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
		try {
			await deleteResellerTicket(ticketId, reseller.id);
			await getResellerState().set(await buildState());
			return { ticketSuccess: 'تیکت حذف شد.' };
		} catch (error) {
			return { ticketError: error instanceof Error ? error.message : 'حذف تیکت انجام نشد.' };
		}
	}
);

// ── Feature 4: Reseller manages configs from user panel ───────────────────────

export const resellerToggleConfigCommand = command(
	z.object({
		requestId: z.number().int().positive(),
		enabled: z.boolean()
	}),
	async ({ requestId, enabled }) => {
		const reseller = await requireReseller();
		if (!reseller) return { toggleError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
		try {
			checkActionRateLimit('toggle-config', reseller.id);
			await resellerToggleConfig(reseller.id, requestId, enabled);
			await getResellerState().set(await buildState());
			return { toggleSuccess: enabled ? 'کانفیگ فعال شد.' : 'کانفیگ غیرفعال شد.' };
		} catch (error) {
			return { toggleError: error instanceof Error ? error.message : 'تغییر وضعیت انجام نشد.' };
		}
	}
);

// ── Feature 10: Reseller responds to client tickets ───────────────────────────

export const replyClientTicketCommand = command(
	z.object({
		ticketId: z.number().int().positive(),
		message: z.string().trim().min(1, 'متن پیام را وارد کنید.').max(2000),
		attachments: z
			.array(
				z.object({
					fileName: z.string().trim().max(120),
					mimeType: z.string().trim().max(40),
					dataBase64: z.string().max(7_000_000),
					sizeBytes: z
						.number()
						.int()
						.positive()
						.max(5 * 1024 * 1024)
				})
			)
			.max(3)
			.default([])
	}),
	async ({ ticketId, message, attachments }) => {
		const reseller = await requireReseller();
		if (!reseller) return { ticketError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
		try {
			checkActionRateLimit('client-ticket-reply', reseller.id);
			await addSellerClientTicketMessage(ticketId, reseller.id, message, attachments);
			await getResellerState().set(await buildState());
			return { ticketSuccess: 'پیام ارسال شد.' };
		} catch (error) {
			return { ticketError: error instanceof Error ? error.message : 'ارسال پیام انجام نشد.' };
		}
	}
);

export const closeClientTicketCommand = command(
	z.object({ ticketId: z.number().int().positive() }),
	async ({ ticketId }) => {
		const reseller = await requireReseller();
		if (!reseller) return { ticketError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
		try {
			await closeClientTicket(ticketId, reseller.id);
			await getResellerState().set(await buildState());
			return { ticketSuccess: 'تیکت بسته شد.' };
		} catch (error) {
			return { ticketError: error instanceof Error ? error.message : 'بستن تیکت انجام نشد.' };
		}
	}
);

export const deleteClientTicketCommand = command(
	z.object({ ticketId: z.number().int().positive() }),
	async ({ ticketId }) => {
		const reseller = await requireReseller();
		if (!reseller) return { ticketError: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
		try {
			await deleteClientTicket(ticketId, reseller.id);
			await getResellerState().set(await buildState());
			return { ticketSuccess: 'تیکت حذف شد.' };
		} catch (error) {
			return { ticketError: error instanceof Error ? error.message : 'حذف تیکت انجام نشد.' };
		}
	}
);

// ── Feature 1: Forgot password ────────────────────────────────────────────────

export const requestPasswordReset = command(
	z.object({
		email: z.string().trim().email('آدرس ایمیل معتبر نیست.').max(254),
		basePath: z
			.string()
			.regex(/^\/(?:[^/]+\/)?reseller$/, 'مسیر بازیابی نامعتبر است.')
			.default('/reseller')
	}),
	async ({ email, basePath }) => {
		const { url } = getRequestEvent();
		const ip = getSafeClientAddress(getRequestEvent());
		const rateLimit = checkResellerActionRateLimit(
			`password-reset:${email.trim().toLowerCase()}:${ip}`,
			{ maxRequests: 3, windowMs: 15 * 60_000 }
		);
		if (!rateLimit.allowed) {
			return {
				resetEmailSent: 'اگر این ایمیل در سیستم موجود باشد، لینک بازیابی رمز عبور ارسال خواهد شد.'
			};
		}
		try {
			const result = await createPasswordResetToken(email);
			// Always return success to avoid email enumeration — fire and forget
			if (result) {
				const smtpSettings = await getSmtpSettings();
				const resetUrl = `${url.origin}${basePath}/reset-password/${result.token}`;
				const html = buildPasswordResetEmailHtml({
					username: result.username,
					resetUrl,
					expiresInMinutes: 60
				});
				// Send email without awaiting (log failure, don't expose it)
				sendEmail(smtpSettings, email, 'بازیابی رمز عبور Skyline', html).catch((err) => {
					resellerLogger.error('Failed to send password reset email.', {
						error: err instanceof Error ? err : undefined
					});
				});
			}
			return {
				resetEmailSent: 'اگر این ایمیل در سیستم موجود باشد، لینک بازیابی رمز عبور ارسال خواهد شد.'
			};
		} catch (error) {
			resellerLogger.error('Password reset request failed.', {
				error: error instanceof Error ? error : undefined
			});
			return {
				resetEmailSent: 'اگر این ایمیل در سیستم موجود باشد، لینک بازیابی رمز عبور ارسال خواهد شد.'
			};
		}
	}
);

export const confirmPasswordReset = command(
	z.object({
		token: z.string().trim().min(1, 'توکن بازیابی نامعتبر است.'),
		newPassword: z.string().min(6, 'رمز عبور باید حداقل ۶ کاراکتر باشد.').max(128),
		confirmPassword: z.string()
	}),
	async ({ token, newPassword, confirmPassword }) => {
		if (newPassword !== confirmPassword) {
			return { resetError: 'رمز عبور و تکرار آن یکسان نیستند.' };
		}
		try {
			await consumePasswordResetToken(token, newPassword);
			return { resetSuccess: 'رمز عبور شما با موفقیت تغییر کرد. اکنون می‌توانید وارد شوید.' };
		} catch (error) {
			return { resetError: error instanceof Error ? error.message : 'تغییر رمز عبور انجام نشد.' };
		}
	}
);
