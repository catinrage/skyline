<script lang="ts">
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';

	type InnerTab = 'start' | 'procedures' | 'faq';
	let activeTab = $state<InnerTab>('start');

	const startSteps = [
		{
			icon: 'key' as const,
			title: 'گذرواژه را تغییر دهید',
			desc: 'اولین قدم امنیتی: از بخش «گذرواژه» گذرواژه موقت را با یک گذرواژه اختصاصی جایگزین کنید.'
		},
		{
			icon: 'spark-up' as const,
			title: 'اعتبار حساب را شارژ کنید',
			desc: 'از «شارژ حساب» یک بسته گیگ انتخاب کنید، رسید پرداخت آپلود کنید و منتظر تأیید بمانید.'
		},
		{
			icon: 'plus-network' as const,
			title: 'اولین کانفیگ را بسازید',
			desc: 'وارد «ساخت کانفیگ» شوید، حجم و سرور را تنظیم کنید و لینک را برای مشتری ارسال کنید.'
		},
		{
			icon: 'message' as const,
			title: 'بات تلگرام را متصل کنید',
			desc: 'از BotFather توکن بگیرید و در «بات تلگرام» وارد کنید تا سفارش‌ها از تلگرام دریافت شوند. (اختیاری)'
		},
		{
			icon: 'ticket' as const,
			title: 'در صورت نیاز تیکت بزنید',
			desc: 'هر مشکل یا سؤالی دارید از «تیکت‌ها» تیکت باز کنید؛ تیم پشتیبانی پاسخ می‌دهد.'
		}
	];

	const procedures = [
		{
			id: 'create-config',
			title: 'ساخت و فعال‌سازی کانفیگ',
			steps: [
				'از منوی سمت راست روی «ساخت کانفیگ» کلیک کنید.',
				'حجم مورد نظر (گیگابایت) را وارد کنید؛ این مقدار از موجودی گیگ شما کسر می‌شود.',
				'سرور مجاز را از لیست انتخاب کنید.',
				'تاریخ انقضا و برچسب مشتری (اختیاری) را تنظیم کنید.',
				'روی دکمه «ساخت» کلیک کنید.',
				'کانفیگ جدید در بخش «کانفیگ‌ها» ظاهر می‌شود؛ از آنجا لینک را کپی و برای مشتری ارسال کنید.'
			]
		},
		{
			id: 'request-credit',
			title: 'درخواست شارژ اعتبار',
			steps: [
				'از منو «شارژ حساب» را انتخاب کنید.',
				'بسته گیگ مورد نظر را از لیست بسته‌های فعال انتخاب کنید.',
				'مبلغ را به شماره کارت اعلام‌شده واریز کنید.',
				'رسید پرداخت (تصویر یا متن) را آپلود کنید.',
				'روی «ارسال درخواست» کلیک کنید.',
				'وضعیت درخواست در همین صفحه به‌روز می‌شود؛ پس از تأیید، موجودی گیگ شما افزایش می‌یابد.'
			]
		},
		{
			id: 'income-model',
			title: 'مدل درآمدی: فروشنده و زیرفروشنده',
			steps: [
				'شما گیگ را از مدیر سیستم با یک قیمت مشخص خریداری می‌کنید.',
				'می‌توانید همین گیگ را با قیمت بالاتری به زیرفروشندگان بفروشید — این اختلاف قیمت سود مستقیم شماست.',
				'زیرفروشنده با پنل مستقل خودش کانفیگ می‌سازد و مشتری‌های خودش را مدیریت می‌کند.',
				'هر بار زیرفروشنده درخواست شارژ گیگ دهد، شما آن را تأیید می‌کنید و گیگ از موجودی شما کسر می‌شود — به قیمتی که خودتان تعیین کرده‌اید.',
				'در نتیجه علاوه بر فروش مستقیم به مشتریان خودتان، از فروش گیگ به هر زیرفروشنده هم درآمد دارید.',
				'هرچه تعداد زیرفروشندگان فعال‌تان بیشتر باشد، درآمد غیرمستقیم شما هم بیشتر می‌شود — بدون اینکه نیازی به مدیریت مستقیم مشتریان آن‌ها داشته باشید.'
			]
		},
		{
			id: 'sub-resellers',
			title: 'مدیریت زیرفروشندگان',
			steps: [
				'از منو «زیرفروشندگان» را انتخاب کنید.',
				'روی «ایجاد زیرفروشنده» کلیک کنید و نام کاربری و گذرواژه موقت را تنظیم کنید.',
				'سقف موجودی گیگ برای هر زیرفروشنده را مشخص کنید.',
				'زیرفروشنده می‌تواند با پنل مستقل خود وارد شود و کانفیگ بسازد.',
				'درخواست‌های شارژ زیرفروشندگان در همین بخش نمایش داده می‌شود و شما باید آن‌ها را تأیید یا رد کنید.',
				'برای حذف یا تعلیق زیرفروشنده، روی دکمه مدیریت کنار نامش کلیک کنید.'
			]
		},
		{
			id: 'add-quota',
			title: 'افزودن حجم به کانفیگ موجود',
			steps: [
				'از منو «کانفیگ‌ها» را انتخاب کنید.',
				'کانفیگ مورد نظر را در لیست پیدا کنید؛ می‌توانید از جستجو برای یافتن سریع‌تر استفاده کنید.',
				'روی دکمه «شارژ» یا «افزودن حجم» کنار آن کانفیگ کلیک کنید.',
				'مقدار حجم اضافه (گیگابایت) را وارد کنید؛ این مقدار از موجودی گیگ شما کسر می‌شود.',
				'تاریخ انقضای جدید را در صورت نیاز تنظیم کنید.',
				'روی «تأیید» کلیک کنید؛ حجم جدید بلافاصله به کانفیگ اضافه می‌شود.'
			]
		},
		{
			id: 'deactivate-client',
			title: 'غیرفعال‌سازی کانفیگ مشتری',
			steps: [
				'از منو «کانفیگ‌ها» را انتخاب کنید.',
				'کانفیگ مورد نظر را پیدا کنید.',
				'روی دکمه «غیرفعال» یا آیکون توقف کنار کانفیگ کلیک کنید.',
				'مشتری بلافاصله قادر به اتصال نخواهد بود اما کانفیگ حذف نمی‌شود.',
				'برای فعال‌سازی مجدد، همین مراحل را طی کنید و «فعال» را انتخاب کنید.',
				'در صورتی که می‌خواهید کانفیگ را به‌طور کامل حذف کنید، از دکمه «حذف» استفاده کنید؛ این عمل برگشت‌پذیر نیست.'
			]
		},
		{
			id: 'config-templates',
			title: 'ساخت و استفاده از قالب کانفیگ',
			steps: [
				'در بخش «ساخت کانفیگ» تنظیمات پایه‌ای مثل حجم، سرور و تاریخ انقضا را طبق معمول وارد کنید.',
				'قبل از ساخت، نام قالب را در فیلد «ذخیره به‌عنوان قالب» وارد کنید.',
				'روی «ذخیره قالب» کلیک کنید؛ قالب برای دفعات بعدی ذخیره می‌شود.',
				'دفعه بعد که وارد «ساخت کانفیگ» شدید، از منوی «قالب‌های ذخیره‌شده» قالب مورد نظر را انتخاب کنید.',
				'تنظیمات قالب به‌صورت خودکار پر می‌شود؛ در صورت نیاز آن‌ها را ویرایش کنید.',
				'روی «ساخت» کلیک کنید تا کانفیگ با تنظیمات قالب ساخته شود.'
			]
		}
	];

	type FaqItem = { q: string; a: string; open: boolean };
	const faqs: FaqItem[] = $state([
		{
			q: 'موجودی گیگ من کجا نمایش داده می‌شود؟',
			a: 'در بخش «نمای کلی» موجودی فعلی، مجموع فروخته‌شده و مانده همیشه قابل مشاهده است.',
			open: false
		},
		{
			q: 'اگر رسید پرداختم رد شد چه کنم؟',
			a: 'دلیل رد شدن در بخش «شارژ حساب» کنار درخواست نوشته می‌شود. رسید صحیح را بارگذاری کرده و درخواست جدید ثبت کنید.',
			open: false
		},
		{
			q: 'آیا می‌توانم کانفیگ منقضی‌شده را تمدید کنم؟',
			a: 'بله، از بخش «کانفیگ‌ها» روی کانفیگ مورد نظر کلیک کنید و گزینه شارژ مجدد یا تمدید را انتخاب کنید.',
			open: false
		},
		{
			q: 'بات تلگرامم پاسخ نمی‌دهد، مشکل از کجاست؟',
			a: 'از بخش «بات تلگرام» وضعیت وب‌هوک را بررسی کنید. اگر خطا نشان می‌داد، توکن را دوباره وارد کنید یا یک تیکت پشتیبانی باز کنید.',
			open: false
		},
		{
			q: 'چطور گذرواژه خودم را عوض کنم؟',
			a: 'از منو «گذرواژه» را انتخاب کنید، گذرواژه فعلی و گذرواژه جدید را وارد کنید و ذخیره کنید.',
			open: false
		},
		{
			q: 'آیا زیرفروشندگان به تمام امکانات دسترسی دارند؟',
			a: 'خیر. زیرفروشندگان فقط می‌توانند کانفیگ بسازند و موجودی خود را ببینند. مدیریت زیرفروشندگان فرزند را شما انجام می‌دهید.',
			open: false
		},
		{
			q: 'چگونه با پشتیبانی تماس بگیرم؟',
			a: 'از بخش «تیکت‌ها» یک تیکت جدید باز کنید. تیم پشتیبانی در اسرع وقت پاسخ می‌دهد.',
			open: false
		},
		{
			q: 'پیام اختصاصی مشتری چیست؟',
			a: 'از «پیام مشتری» می‌توانید یک پیام تنظیم کنید که فقط کاربران ساخته‌شده توسط شما آن را می‌بینند، مثلاً شماره تماس یا راهنمای اتصال.',
			open: false
		},
		{
			q: 'کانفیگ را چه زمانی می‌توان حذف کرد؟',
			a: 'کانفیگ را در هر زمانی می‌توانید حذف کنید؛ اما توجه داشته باشید که حذف کانفیگ برگشت‌پذیر نیست و مشتری دیگر قادر به اتصال نخواهد بود. اگر می‌خواهید اتصال مشتری را موقتاً قطع کنید، به‌جای حذف از گزینه «غیرفعال» استفاده کنید تا بتوانید بعداً دوباره فعالش کنید.',
			open: false
		},
		{
			q: 'آیا با غیرفعال یا حذف کردن کانفیگ، گیگ مصرف‌نشده برمی‌گردد؟',
			a: 'خیر. حجم گیگ در لحظه ساخت کانفیگ از موجودی شما کسر می‌شود و با غیرفعال‌سازی یا حذف کانفیگ به حساب شما بازنمی‌گردد. بنابراین پیش از ساخت کانفیگ مطمئن شوید که حجم و مشخصات صحیح است.',
			open: false
		},
		{
			q: 'رابطه مالی فروشنده و زیرفروشنده چطور کار می‌کند؟',
			a: 'شما گیگ را از مدیر سیستم با قیمت مشخصی می‌خرید. وقتی به زیرفروشنده گیگ می‌فروشید، قیمت را خودتان تعیین می‌کنید. اختلاف قیمت خرید شما از مدیر و فروش شما به زیرفروشنده، سود مستقیم شماست. زیرفروشنده هم همین کار را با مشتریان خودش می‌کند.',
			open: false
		},
		{
			q: 'آیا داشتن زیرفروشنده واقعاً درآمدزاست؟',
			a: 'بله. هر زیرفروشنده فعال به‌صورت مستقل مشتری جذب می‌کند و گیگ می‌فروشد — اما گیگ مورد نیازش را از شما می‌خرد. شما بدون اینکه درگیر مشتریان آن‌ها باشید، از هر بار شارژ زیرفروشنده سود می‌برید. هرچه شبکه زیرفروشندگانتان بزرگ‌تر باشد، این درآمد غیرمستقیم بیشتر می‌شود.',
			open: false
		}
	]);

	function toggleFaq(i: number) {
		faqs[i].open = !faqs[i].open;
	}
</script>

<div class="help-tab" dir="rtl">
	<div class="inner-tabs">
		<button
			type="button"
			class="inner-tab-btn"
			class:active={activeTab === 'start'}
			onclick={() => (activeTab = 'start')}
		>
			<AnimatedIcon name="overview" size={14} active={activeTab === 'start'} />
			شروع کار
		</button>
		<button
			type="button"
			class="inner-tab-btn"
			class:active={activeTab === 'procedures'}
			onclick={() => (activeTab = 'procedures')}
		>
			<AnimatedIcon name="list" size={14} active={activeTab === 'procedures'} />
			رویه‌های رایج
		</button>
		<button
			type="button"
			class="inner-tab-btn"
			class:active={activeTab === 'faq'}
			onclick={() => (activeTab = 'faq')}
		>
			<AnimatedIcon name="help-circle" size={14} active={activeTab === 'faq'} />
			پرسش‌های متداول
		</button>
	</div>

	{#if activeTab === 'start'}
		<div class="tab-content">
			<div class="section-intro">
				<div class="section-intro-icon">
					<AnimatedIcon name="overview" size={18} active />
				</div>
				<div>
					<div class="va-section-label">شروع کار با پنل فروشنده</div>
					<p class="section-intro-sub">این راهنما شما را گام‌به‌گام با قابلیت‌های اصلی پنل آشنا می‌کند.</p>
				</div>
			</div>
			<div class="step-cards">
				{#each startSteps as step, i}
					<div class="step-card va-card">
						<div class="step-number">{i + 1}</div>
						<div class="step-icon">
							<AnimatedIcon name={step.icon} size={16} active />
						</div>
						<div class="step-body">
							<div class="step-title">{step.title}</div>
							<div class="step-desc">{step.desc}</div>
						</div>
					</div>
				{/each}
			</div>
		</div>

	{:else if activeTab === 'procedures'}
		<div class="tab-content">
			{#each procedures as proc}
				<div class="proc-block va-card" class:proc-income={proc.id === 'income-model'}>
					{#if proc.id === 'income-model'}
						<div class="proc-income-header">
							<div class="proc-income-icon">
								<AnimatedIcon name="spark-up" size={16} active />
							</div>
							<div>
								<div class="proc-title" style="margin-bottom:2px">{proc.title}</div>
								<div class="proc-income-sub">داشتن زیرفروشنده = درآمد بدون مدیریت مستقیم مشتری</div>
							</div>
						</div>
					{:else}
						<div class="proc-title">{proc.title}</div>
					{/if}
					<ol class="proc-steps">
						{#each proc.steps as step, i}
							<li class="proc-step">
								<span class="proc-step-num">{i + 1}</span>
								<span>{step}</span>
							</li>
						{/each}
					</ol>
				</div>
			{/each}
		</div>

	{:else}
		<div class="tab-content">
			<div class="faq-list">
				{#each faqs as faq, i}
					<div class="faq-item va-card" class:open={faq.open}>
						<button type="button" class="faq-question" onclick={() => toggleFaq(i)}>
							<span>{faq.q}</span>
							<span class="faq-chevron" class:rotated={faq.open}>›</span>
						</button>
						{#if faq.open}
							<div class="faq-answer">{faq.a}</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.help-tab {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 0 2px;
	}

	/* ── Inner tab strip ── */
	.inner-tabs {
		display: flex;
		gap: 6px;
		border-bottom: 1px solid var(--va-border);
		padding-bottom: 0;
	}

	.inner-tab-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		border: none;
		border-bottom: 2px solid transparent;
		border-radius: 0;
		background: none;
		color: var(--va-text-muted);
		font-size: 13px;
		font-weight: 550;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
		margin-bottom: -1px;
		font-family: inherit;
	}

	.inner-tab-btn:hover {
		color: var(--va-text);
	}

	.inner-tab-btn.active {
		color: var(--va-accent);
		border-bottom-color: var(--va-accent);
	}

	/* ── Shared content wrapper ── */
	.tab-content {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	/* ── Getting Started ── */
	.section-intro {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 4px;
	}

	.section-intro-icon {
		width: 42px;
		height: 42px;
		display: grid;
		place-items: center;
		border-radius: 10px;
		background: color-mix(in srgb, var(--va-accent) 14%, transparent);
		color: var(--va-accent);
		flex-shrink: 0;
	}

	.section-intro-sub {
		margin: 4px 0 0;
		color: var(--va-text-muted);
		font-size: 12.5px;
		line-height: 1.7;
	}

	.step-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 12px;
	}

	.step-card {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 16px;
	}

	.step-number {
		min-width: 24px;
		height: 24px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: color-mix(in srgb, var(--va-accent) 16%, transparent);
		color: var(--va-accent);
		font-size: 11px;
		font-weight: 700;
	}

	.step-icon {
		color: var(--va-accent);
		margin-top: 2px;
	}

	.step-body {
		flex: 1;
	}

	.step-title {
		font-size: 13px;
		font-weight: 650;
		color: var(--va-text);
		margin-bottom: 5px;
	}

	.step-desc {
		font-size: 12px;
		color: var(--va-text-muted);
		line-height: 1.8;
	}

	/* ── Procedures ── */
	.proc-block {
		padding: 18px 20px;
	}

	.proc-income {
		border-color: color-mix(in srgb, var(--va-accent) 35%, transparent);
		background: color-mix(in srgb, var(--va-accent) 5%, var(--va-bg-panel));
	}

	.proc-income-header {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 14px;
		padding-bottom: 12px;
		border-bottom: 1px solid color-mix(in srgb, var(--va-accent) 20%, transparent);
	}

	.proc-income-icon {
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		border-radius: 8px;
		background: color-mix(in srgb, var(--va-accent) 15%, transparent);
		color: var(--va-accent);
		flex-shrink: 0;
	}

	.proc-income-sub {
		font-size: 11.5px;
		color: var(--va-accent);
		font-weight: 550;
		margin-top: 3px;
	}

	.proc-title {
		font-size: 14px;
		font-weight: 650;
		color: var(--va-text);
		margin-bottom: 14px;
		padding-bottom: 10px;
		border-bottom: 1px solid var(--va-border);
	}

	.proc-steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.proc-step {
		display: flex;
		align-items: baseline;
		gap: 10px;
		font-size: 12.5px;
		color: var(--va-text);
		line-height: 1.7;
	}

	.proc-step-num {
		min-width: 22px;
		height: 22px;
		display: grid;
		place-items: center;
		border-radius: 6px;
		background: color-mix(in srgb, var(--va-accent) 12%, transparent);
		color: var(--va-accent);
		font-size: 11px;
		font-weight: 700;
		flex-shrink: 0;
	}

	/* ── FAQ ── */
	.faq-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.faq-item {
		overflow: hidden;
		padding: 0;
	}

	.faq-question {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 18px;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 13px;
		font-weight: 600;
		color: var(--va-text);
		text-align: right;
		font-family: inherit;
	}

	.faq-question:hover {
		color: var(--va-accent);
	}

	.faq-chevron {
		font-size: 20px;
		line-height: 1;
		color: var(--va-text-muted);
		transition: transform 0.2s;
		flex-shrink: 0;
	}

	.faq-chevron.rotated {
		transform: rotate(90deg);
	}

	.faq-answer {
		padding: 0 18px 14px;
		font-size: 12.5px;
		color: var(--va-text-muted);
		line-height: 1.8;
		border-top: 1px solid var(--va-border);
		padding-top: 12px;
	}

	.faq-item.open .faq-question {
		color: var(--va-accent);
	}
</style>
