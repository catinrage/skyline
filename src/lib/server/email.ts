/**
 * Email module for Skyline.
 * Sends transactional emails (e.g., password reset) via SMTP using nodemailer.
 * SMTP credentials are read from the admin_settings table at runtime.
 */
import { logger } from '$lib/server/logger';
import { createTransport } from 'nodemailer';

const emailLogger = logger.child('email');

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export interface SmtpSettings {
	host: string;
	port: number;
	secure: boolean;
	username: string;
	password: string;
	fromAddress: string;
	fromName: string;
}

/** Send an email using the provided SMTP settings. Returns true on success. */
export async function sendEmail(
	smtp: SmtpSettings,
	to: string,
	subject: string,
	htmlBody: string
): Promise<void> {
	if (!smtp.host || !smtp.fromAddress) {
		throw new Error('تنظیمات SMTP کامل نیست. لطفاً اطلاعات ایمیل را در پنل مدیر پیکربندی کنید.');
	}

	const transporter = createTransport({
		host: smtp.host,
		port: smtp.port || 587,
		secure: smtp.secure,
		auth: smtp.username ? { user: smtp.username, pass: smtp.password } : undefined,
		connectionTimeout: 10_000,
		greetingTimeout: 5_000
	});

	await transporter.sendMail({
		from: smtp.fromName ? `"${smtp.fromName}" <${smtp.fromAddress}>` : smtp.fromAddress,
		to,
		subject,
		html: htmlBody
	});

	emailLogger.info('Email sent.', { to, subject });
}

/** Build the HTML body for a password reset email. */
export function buildPasswordResetEmailHtml(opts: {
	username: string;
	resetUrl: string;
	expiresInMinutes: number;
}): string {
	const username = escapeHtml(opts.username);
	const resetUrl = escapeHtml(opts.resetUrl);
	const { expiresInMinutes } = opts;
	return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>بازیابی رمز عبور</title>
<style>
  body { margin: 0; padding: 0; background: #0f172a; font-family: Tahoma, Arial, sans-serif; direction: rtl; }
  .wrapper { max-width: 560px; margin: 40px auto; background: #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 32px #0005; }
  .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px 40px 24px; text-align: center; }
  .header h1 { color: #fff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
  .header p { color: #e0e7ff; margin: 6px 0 0; font-size: 13px; }
  .body { padding: 36px 40px; color: #cbd5e1; }
  .body p { margin: 0 0 16px; line-height: 1.7; font-size: 14px; }
  .username { color: #a5b4fc; font-weight: bold; }
  .btn-wrap { text-align: center; margin: 28px 0; }
  .btn { display: inline-block; background: #6366f1; color: #fff !important; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.3px; }
  .btn:hover { background: #4f46e5; }
  .url-box { background: #0f172a; border-radius: 8px; padding: 12px 16px; word-break: break-all; font-size: 12px; color: #94a3b8; margin: 12px 0 24px; }
  .footer { background: #0f172a; padding: 18px 40px; text-align: center; color: #475569; font-size: 12px; }
  .warning { color: #f59e0b; font-size: 13px; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>بازیابی رمز عبور Skyline</h1>
    <p>یک لینک بازیابی امن برای شما ارسال شده است</p>
  </div>
  <div class="body">
    <p>سلام <span class="username">${username}</span>،</p>
    <p>درخواست بازیابی رمز عبور حساب فروشنده شما در پنل Skyline دریافت شد. برای ادامه روی دکمه زیر کلیک کنید:</p>
    <div class="btn-wrap">
      <a href="${resetUrl}" class="btn">تغییر رمز عبور</a>
    </div>
    <p>یا این لینک را در مرورگر خود باز کنید:</p>
    <div class="url-box">${resetUrl}</div>
    <p class="warning">⚠️ این لینک فقط ${expiresInMinutes} دقیقه اعتبار دارد و یک‌بار قابل استفاده است.</p>
    <p>اگر این درخواست را شما ارسال نکرده‌اید، این ایمیل را نادیده بگیرید. رمز عبور شما تغییر نمی‌کند.</p>
  </div>
  <div class="footer">
    این ایمیل به‌صورت خودکار ارسال شده — لطفاً به آن پاسخ ندهید.
  </div>
</div>
</body>
</html>`;
}
