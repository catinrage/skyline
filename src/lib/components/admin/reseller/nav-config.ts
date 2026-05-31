import type { NavItem } from '../AdminShell.svelte';

export function buildResellerNav(
	basePath: string,
	options?: {
		isSubReseller?: boolean;
		canManageSubResellers?: boolean;
		pendingSubCreditRequests?: number;
		pendingIncomingTickets?: number;
	}
): NavItem[] {
	const base = basePath.replace(/\/+$/, '');
	const items: NavItem[] = [
		{ id: 'overview', label: 'نمای کلی', icon: 'overview', href: `${base}/overview`, group: 'فروش' },
		{ id: 'create', label: 'ساخت کانفیگ', icon: 'plus-network', href: `${base}/create`, group: 'فروش' },
		{ id: 'configs', label: 'کانفیگ‌ها', icon: 'list', href: `${base}/configs`, group: 'فروش' },
		{ id: 'telegram', label: 'بات تلگرام', icon: 'message', href: `${base}/telegram`, group: 'فروش' },
		{ id: 'finance', label: 'شارژ حساب', icon: 'spark-up', href: `${base}/finance`, group: 'مدیریت' },
		{
			id: 'tickets',
			label: 'تیکت‌ها',
			icon: 'ticket',
			href: `${base}/tickets`,
			group: 'مدیریت',
			badge: options?.pendingIncomingTickets ?? 0
		},
		{ id: 'message', label: 'پیام مشتری', icon: 'message', href: `${base}/message`, group: 'مدیریت' },
		{ id: 'security', label: 'گذرواژه', icon: 'key', href: `${base}/security`, group: 'مدیریت' }
	];

	// Only parent resellers with the sub-reseller management permission get this tab
	if (!options?.isSubReseller && options?.canManageSubResellers) {
		items.splice(4, 0, {
			id: 'sub-resellers',
			label: 'زیرفروشندگان',
			icon: 'store',
			href: `${base}/sub-resellers`,
			group: 'فروش',
			badge: options?.pendingSubCreditRequests ?? 0
		});
	}

	return items;
}

export const resellerTabMeta: Record<string, { title: string; subtitle: string }> = {
	overview: { title: 'نمای کلی فروش', subtitle: 'خلاصه موجودی گیگ، عملیات روزانه و آخرین فعالیت‌ها.' },
	create: { title: 'ساخت کانفیگ جدید', subtitle: 'حجم و سرور مجاز را از موجودی گیگ خود برای مشتری بسازید.' },
	configs: { title: 'مدیریت کانفیگ‌ها', subtitle: 'مشاهده، شارژ، لغو و کپی لینک کانفیگ‌های ثبت‌شده.' },
	telegram: { title: 'بات تلگرام فروش', subtitle: 'اتصال بات، دریافت سفارش و بررسی رسید مشتریان تلگرام.' },
	finance: { title: 'شارژ حساب فروشنده', subtitle: 'بسته گیگ بخرید، رسید بفرستید و وضعیت اعتبار فروش را ببینید.' },
	'sub-resellers': { title: 'زیرفروشندگان', subtitle: 'مدیریت زیرفروشندگان، بسته‌های شارژ و درخواست‌های آن‌ها.' },
	tickets: { title: 'تیکت‌های پشتیبانی', subtitle: 'گفتگو و پیگیری درخواست‌های پشتیبانی.' },
	message: { title: 'پیام اختصاصی مشتری', subtitle: 'پیامی که فقط برای کاربران ساخته‌شده توسط شما نمایش داده می‌شود.' },
	security: { title: 'تغییر گذرواژه', subtitle: 'برای امنیت بیشتر گذرواژه پنل فروشنده را به‌روز کنید.' }
};
