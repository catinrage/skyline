import type { NavItem } from '../AdminShell.svelte';
import type { ManageTabId } from '../../../../params/manageTab';

export type ManageNavItem = NavItem & { id: ManageTabId | 'overview' };

export function buildManageNav(
	basePath: string,
	options?: { reportCount?: number; creditRequestCount?: number }
): NavItem[] {
	const base = basePath.replace(/\/+$/, '');
	return [
		{ id: 'traffic', label: 'ترافیک', icon: 'traffic', href: `${base}/traffic`, group: 'داشبورد' },
		{ id: 'create', label: 'ساخت کانفیگ', icon: 'plus-network', href: `${base}/create`, group: 'داشبورد' },

		{ id: 'resellers', label: 'فروشندگان', icon: 'store', href: `${base}/resellers`, group: 'فروشندگان' },
		{ id: 'groups', label: 'گروه‌های فروشندگان', icon: 'list', href: `${base}/groups`, group: 'فروشندگان' },
		{ id: 'credit-requests', label: 'درخواست‌های شارژ', icon: 'spark-up', href: `${base}/credit-requests`, group: 'فروشندگان', badge: options?.creditRequestCount || undefined },

		{ id: 'plans', label: 'بسته‌های شارژ', icon: 'ticket', href: `${base}/plans`, group: 'بسته‌ها' },

		{ id: 'reports', label: 'تیکت‌ها', icon: 'flag', href: `${base}/reports`, group: 'پشتیبانی', badge: options?.reportCount || undefined },

		{ id: 'message', label: 'پیام پنل', icon: 'message', href: `${base}/message`, group: 'تنظیمات' },
		{ id: 'client-apps', label: 'اپ‌های کلاینت', icon: 'apps', href: `${base}/client-apps`, group: 'تنظیمات' },
		{ id: 'vless-rewrite', label: 'تغییر کانفیگ', icon: 'cloud', href: `${base}/vless-rewrite`, group: 'تنظیمات' },
		{ id: 'features', label: 'قابلیت‌ها', icon: 'toggle', href: `${base}/features`, group: 'تنظیمات' },
		{ id: 'settings', label: 'تنظیمات اتصال', icon: 'database', href: `${base}/settings`, group: 'تنظیمات' },

		{ id: 'security', label: 'امنیت', icon: 'shield', href: `${base}/security`, group: 'امنیت و داده' },
		{ id: 'passkey', label: 'گذرواژه', icon: 'key', href: `${base}/passkey`, group: 'امنیت و داده' },
		{ id: 'backups', label: 'پشتیبان', icon: 'database', href: `${base}/backups`, group: 'امنیت و داده' }
	];
}

export const manageTabMeta: Record<string, { title: string; subtitle: string }> = {
	traffic: { title: 'ترافیک و نمای کلی', subtitle: 'خلاصه مصرف و وضعیت کانفیگ‌های فعال در x-ui.' },
	create: { title: 'کانفیگ‌های مدیر', subtitle: 'کانفیگ مشتریان مدیر با مالکیت داخلی مستقل.' },
	resellers: { title: 'مدیریت فروشندگان', subtitle: 'ایجاد فروشنده، کنترل وضعیت، محدودیت سرورها و موجودی GB.' },
	groups: { title: 'گروه‌های فروشندگان', subtitle: 'رده‌های تجاری و دسترسی به بسته‌های شارژ خصوصی.' },
	'credit-requests': { title: 'درخواست‌های شارژ', subtitle: 'بررسی و تایید رسیدهای ارسالی فروشندگان برای افزودن موجودی GB.' },
	plans: { title: 'بسته‌های شارژ', subtitle: 'تعریف بسته‌های خرید GB برای فروشندگان.' },
	reports: { title: 'تیکت‌های پشتیبانی', subtitle: 'پیگیری تیکت‌ها و گزارش‌های ارسالی کاربران.' },
	message: { title: 'پیام پنل کاربر', subtitle: 'پیامی که برای همه کاربران در صفحه شخصی‌شان دیده می‌شود.' },
	templates: { title: 'قالب‌های پیام', subtitle: 'قالب‌های از پیش تعریف‌شده برای پیام‌های اتوماتیک پنل.' },
	'client-apps': { title: 'اپ‌های کلاینت', subtitle: 'لیست لینک دانلود برنامه‌های مصرف‌کننده کانفیگ.' },
	'vless-rewrite': { title: 'تغییر کانفیگ VLESS', subtitle: 'بازنویسی آدرس و پورت خروجی برای CDN و فرانت.' },
	features: { title: 'قابلیت‌های Skyline', subtitle: 'فعال یا غیرفعال کردن ویجت‌ها و قابلیت‌های پنل کاربر.' },
	settings: { title: 'تنظیمات اتصال', subtitle: 'مدیریت اتصال x-ui، توکن API، هاست عمومی و مسیر xray از داخل پنل.' },
	security: { title: 'مسیر مخفی پنل', subtitle: 'جلوگیری از کشف خودکار مسیرهای مدیریت و فروشنده.' },
	passkey: { title: 'گذرواژه مدیریت', subtitle: 'تغییر امن گذرواژه ورود به پنل مدیریت.' },
	backups: { title: 'پشتیبان دیتابیس', subtitle: 'دانلود فایل پشتیبان SQLite یا بازیابی از یک نسخه قبلی.' }
};
