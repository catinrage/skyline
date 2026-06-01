<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import DonutChart from '$lib/components/admin/DonutChart.svelte';
	import EmptyState from '$lib/components/admin/EmptyState.svelte';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import VaAvatar from '$lib/components/admin/va/VaAvatar.svelte';
	import VaStatusDot from '$lib/components/admin/va/VaStatusDot.svelte';
	import VaStatRow from '$lib/components/admin/va/VaStatRow.svelte';
	import { formatRelativeExpiry, formatTraffic, shortenUuid } from '$lib/utils/format';

	type DashboardRequest = {
		id: number;
		customerLabel: string;
		xuiEmail: string;
		xuiClientUuid: string;
		status: 'active' | 'depleted' | 'disabled' | 'expired' | 'revoked' | 'missing';
		quotaGbSnapshot: number;
		durationDaysSnapshot: number;
		usage: {
			usedBytes: number;
			remainingBytes: number | null;
			totalBytes: number | null;
			usageRatio: number | null;
			expiresAt: string | null;
		} | null;
	};

	type ResellerGroup = {
		id: number;
		name: string;
		color: string;
		badgeIcon: string;
		description: string;
	};

	type Props = {
		data: {
			reseller: { username: string; managerMessage?: string; group?: ResellerGroup | null };
			stats: {
				gbBalance: number;
				totalGbAdded: number;
				totalGbSold: number;
				totalGbRefunded: number;
				totalRequests: number;
				activeRequests: number;
				settledRequests: number;
			};
			dailySummary: {
				createdToday: number;
				rechargedToday: number;
				revokedToday: number;
				gbSoldToday: number;
			};
			lastCreatedRequest: {
				id: number;
				customerLabel: string;
				xuiClientUuid: string;
				quotaGbSnapshot: number;
				durationDaysSnapshot: number;
				configUrl: string | null;
			} | null;
			requests: DashboardRequest[];
		};
	};

	let { data }: Props = $props();
	let attentionPage = $state(1);
	const pageSize = 10;

	const hiddenResellerMatch = $derived(page.url.pathname.match(/^\/([^/]+)\/reseller(?:\/|$)/));
	const basePath = $derived(hiddenResellerMatch ? `/${hiddenResellerMatch[1]}/reseller` : '/reseller');

	const statItems = $derived([
		{
			label: 'موجودی فروش',
			value: data.stats.gbBalance,
			unit: 'GB',
			delta: 'اعتبار قابل مصرف برای ساخت کانفیگ',
			deltaTone: data.stats.gbBalance > 0 ? ('success' as const) : ('warning' as const)
		},
		{
			label: 'کل خریداری‌شده',
			value: data.stats.totalGbAdded,
			unit: 'GB',
			delta: 'تایید شده توسط مدیر',
			deltaTone: 'muted' as const
		},
		{
			label: 'فروخته‌شده',
			value: data.stats.totalGbSold,
			unit: 'GB',
			delta: `${data.stats.totalRequests.toLocaleString('fa-IR-u-nu-latn')} کانفیگ`,
			deltaTone: 'success' as const
		},
		{
			label: 'برگشتی',
			value: data.stats.totalGbRefunded,
			unit: 'GB',
			delta: 'لغو کانفیگ مصرف‌نشده',
			deltaTone: 'muted' as const
		}
	]);

	const donutSegments = $derived([
		{ label: 'فعال', value: data.stats.activeRequests, color: 'var(--va-success)' },
		{
			label: 'تسویه‌شده',
			value: Math.max(0, data.stats.settledRequests - data.stats.activeRequests),
			color: 'var(--va-accent)'
		},
		{
			label: 'لغوشده',
			value: Math.max(0, data.stats.totalRequests - data.stats.activeRequests - data.stats.settledRequests),
			color: 'var(--va-warning)'
		}
	]);
	const allAttentionRequests = $derived(
		data.requests
			.filter((request) => {
				if (request.status === 'revoked' || request.status === 'missing' || request.status === 'disabled') {
					return false;
				}

				return isLowQuota(request) || isExpiringSoon(request);
			})
			.sort((left, right) => attentionScore(left) - attentionScore(right))
	);
	const attentionPages = $derived(Math.max(1, Math.ceil(allAttentionRequests.length / pageSize)));
	const attentionRequests = $derived(allAttentionRequests.slice((attentionPage - 1) * pageSize, attentionPage * pageSize));

	function planSummary(plan: { quotaGbSnapshot: number; durationDaysSnapshot: number }) {
		return `${plan.quotaGbSnapshot}G / ${plan.durationDaysSnapshot} روز`;
	}

	function isExpiringSoon(request: { usage: { expiresAt: string | null } | null }) {
		if (!request.usage?.expiresAt) return false;
		const deltaMs = new Date(request.usage.expiresAt).getTime() - Date.now();
		return deltaMs <= 3 * 24 * 60 * 60 * 1000;
	}

	function isLowQuota(request: {
		usage: { remainingBytes: number | null; totalBytes: number | null; usageRatio: number | null } | null;
	}) {
		if (!request.usage) return false;
		if (typeof request.usage.usageRatio === 'number') return 1 - request.usage.usageRatio <= 0.15;
		if (!request.usage.totalBytes || request.usage.remainingBytes === null) return false;
		return request.usage.remainingBytes / request.usage.totalBytes <= 0.15;
	}

	function attentionScore(request: DashboardRequest) {
		const remainingRatio =
			request.usage?.totalBytes && request.usage.remainingBytes !== null
				? request.usage.remainingBytes / request.usage.totalBytes
				: 1;
		const expiryMs = request.usage?.expiresAt
			? new Date(request.usage.expiresAt).getTime() - Date.now()
			: Number.POSITIVE_INFINITY;

		return Math.min(remainingRatio, 1) * 10_000 + Math.max(expiryMs, -1) / (1000 * 60 * 60);
	}

	function attentionReason(request: DashboardRequest) {
		const reasons = [];
		if (isExpiringSoon(request)) reasons.push('نزدیک انقضا');
		if (isLowQuota(request)) reasons.push('کمتر از ۱۵٪ حجم');
		return reasons.join(' · ');
	}

	function remainingPercent(request: DashboardRequest) {
		if (!request.usage?.totalBytes || request.usage.remainingBytes === null) return null;
		return Math.max(0, Math.round((request.usage.remainingBytes / request.usage.totalBytes) * 100));
	}

	async function copyConfig(url: string) {
		try {
			await navigator.clipboard.writeText(url);
			toast.success('لینک کانفیگ کپی شد.');
		} catch {
			toast.error('کپی لینک انجام نشد.');
		}
	}
</script>

<div class="overview-va">
	{#if data.reseller.group}
		<div class="group-badge-banner" style="--group-color: {data.reseller.group.color};">
			<span class="mdi mdi-{data.reseller.group.badgeIcon} group-badge-icon"></span>
			<span class="group-badge-name">{data.reseller.group.name}</span>
		</div>
	{/if}

	{#if data.reseller.managerMessage}
		<div class="admin-notice va-card">
			<div class="notice-icon"><AnimatedIcon name="message" size={13} /></div>
			<div>
				<div class="notice-title">پیام مدیر:</div>
				<div class="notice-body">{data.reseller.managerMessage}</div>
			</div>
			<div class="notice-time">اکنون</div>
		</div>
	{/if}

	<VaStatRow items={statItems} />

	<div class="overview-two-col">
		<div class="va-card panel-card">
			<div class="panel-head">
				<div>
					<div class="panel-title">وضعیت درخواست‌ها</div>
					<div class="panel-sub">{data.stats.totalRequests.toLocaleString('fa-IR-u-nu-latn')} درخواست کل</div>
				</div>
			</div>
			<div class="status-panel-body">
				<DonutChart
					segments={donutSegments}
					centerValue={data.stats.totalRequests.toLocaleString('fa-IR-u-nu-latn')}
					centerLabel="کانفیگ"
					size={140}
				/>
				<div class="legend-list">
					<div>
						<span class="legend-dot success"></span>
						<span>فعال</span>
						<strong>{data.stats.activeRequests.toLocaleString('fa-IR-u-nu-latn')}</strong>
					</div>
					<div>
						<span class="legend-dot accent"></span>
						<span>تسویه‌شده</span>
						<strong>{data.stats.settledRequests.toLocaleString('fa-IR-u-nu-latn')}</strong>
					</div>
					<div>
					<span class="legend-dot danger"></span>
						<span>برگشت اعتبار</span>
						<strong>{data.stats.totalGbRefunded.toLocaleString('fa-IR-u-nu-latn')} GB</strong>
					</div>
				</div>
			</div>
		</div>

		<div class="va-card panel-card">
			<div class="panel-head split">
				<div>
					<div class="panel-title">آخرین کانفیگ ساخته‌شده</div>
					<div class="panel-sub">لینک سریع و صفحه کاربر</div>
				</div>
				<a href={`${basePath}/configs`} class="va-chip">تاریخچه</a>
			</div>
			{#if data.lastCreatedRequest}
				{@const last = data.lastCreatedRequest}
				<div class="last-config-body">
					<div class="last-config-head">
						<VaAvatar name={last.customerLabel} size={36} />
						<div>
							<div class="last-name">{last.customerLabel}</div>
							<div class="panel-sub">{planSummary(last)}</div>
						</div>
						<div class="last-price">{last.quotaGbSnapshot}<span>GB</span></div>
					</div>

					<div class="last-code" dir="ltr">
						<div>vless config</div>
						<p>{last.configUrl ?? '—'}</p>
					</div>

					<div class="last-actions">
						{#if last.configUrl}
							<button type="button" class="admin-btn admin-btn-primary" onclick={() => last.configUrl && copyConfig(last.configUrl)}>
								<span class="mdi mdi-content-copy"></span>
								<span>کپی VLESS</span>
							</button>
						{/if}
						<a
							href={`/user/${last.xuiClientUuid}?ri=${encodeURIComponent(data.reseller.username)}`}
							target="_blank"
							rel="noreferrer"
							class="admin-btn admin-btn-ghost"
						>
							<span class="mdi mdi-cloud-outline"></span>
							<span>صفحه کاربر</span>
						</a>
					</div>
				</div>
			{:else}
				<div class="empty-card">
					<EmptyState
						title="هنوز کانفیگی نساخته‌اید"
						description="با ساخت اولین کانفیگ، اطلاعات آن اینجا نمایش داده می‌شود."
						icon="sparkle"
					/>
				</div>
			{/if}
		</div>
	</div>

	<div class="overview-two-col bottom">
		<div class="va-card panel-card">
			<div class="panel-head">
				<div>
					<div class="panel-title">امروز</div>
					<div class="panel-sub">خلاصه ۲۴ ساعت اخیر</div>
				</div>
			</div>
			<div class="today-list">
				<div>
					<AnimatedIcon name="plus-network" size={12} />
					<span>ساخت کانفیگ</span>
					<strong>{data.dailySummary.createdToday.toLocaleString('fa-IR-u-nu-latn')}</strong>
				</div>
				<div>
					<AnimatedIcon name="cloud" size={12} />
					<span>شارژ مجدد</span>
					<strong>{data.dailySummary.rechargedToday.toLocaleString('fa-IR-u-nu-latn')}</strong>
				</div>
				<div>
					<AnimatedIcon name="flag" size={12} />
					<span>لغو</span>
					<strong>{data.dailySummary.revokedToday.toLocaleString('fa-IR-u-nu-latn')}</strong>
				</div>
				<div>
					<AnimatedIcon name="finance" size={12} />
					<span>مصرف GB</span>
					<strong>{data.dailySummary.gbSoldToday.toLocaleString('fa-IR-u-nu-latn')} GB</strong>
				</div>
			</div>
		</div>

		<div class="va-card panel-card">
			<div class="panel-head">
				<div>
					<div class="panel-title">فعالیت اخیر</div>
					<div class="panel-sub">بر اساس خلاصه حساب شما</div>
				</div>
			</div>
			<div class="activity-list">
				<div>
					<span class="activity-icon success"><AnimatedIcon name="plus-network" size={12} /></span>
					<div>
						<strong>ساخت امروز</strong>
						<span>{data.dailySummary.createdToday.toLocaleString('fa-IR-u-nu-latn')} کانفیگ جدید</span>
					</div>
					<em>امروز</em>
				</div>
				<div>
					<span class="activity-icon accent"><AnimatedIcon name="cloud" size={12} /></span>
					<div>
						<strong>شارژ مجدد</strong>
						<span>{data.dailySummary.rechargedToday.toLocaleString('fa-IR-u-nu-latn')} عملیات تمدید</span>
					</div>
					<em>امروز</em>
				</div>
				<div>
					<span class="activity-icon warning"><AnimatedIcon name="finance" size={12} /></span>
					<div>
						<strong>مصرف اعتبار</strong>
						<span>{data.dailySummary.gbSoldToday.toLocaleString('fa-IR-u-nu-latn')} گیگ امروز</span>
					</div>
					<em>امروز</em>
				</div>
			</div>
		</div>
	</div>

	<div class="va-card panel-card attention-panel">
		<div class="panel-head split">
			<div>
				<div class="panel-title">نیازمند پیگیری</div>
				<div class="panel-sub">کانفیگ‌های نزدیک انقضا یا با کمتر از ۱۵٪ حجم باقی‌مانده</div>
			</div>
			<a href={`${basePath}/configs`} class="va-chip">همه کانفیگ‌ها</a>
		</div>

		{#if attentionRequests.length === 0}
			<div class="empty-card">
				<EmptyState
					title="مورد فوری وجود ندارد"
					description="فعلاً هیچ کانفیگ فعالی نزدیک انقضا یا نزدیک اتمام حجم نیست."
					icon="sparkle"
				/>
			</div>
		{:else}
			<div class="attention-table-wrap">
				<table class="attention-table">
					<thead>
						<tr>
							<th>مشتری</th>
							<th>دلیل</th>
							<th>مانده حجم</th>
							<th>انقضا</th>
							<th>پلن</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each attentionRequests as request (request.id)}
							<tr>
								<td data-label="مشتری">
									<div class="attention-client">
										<VaAvatar name={request.customerLabel || request.xuiEmail} size={28} />
										<div>
											<strong>{request.customerLabel || 'بدون نام'}</strong>
											<span dir="ltr">{shortenUuid(request.xuiClientUuid)}</span>
										</div>
									</div>
								</td>
								<td data-label="دلیل">
									<VaStatusDot tone={isLowQuota(request) ? 'danger' : 'warning'} label={attentionReason(request)} />
								</td>
								<td data-label="مانده حجم">
									<strong class="va-mono">
										{request.usage ? formatTraffic(request.usage.remainingBytes ?? 0) : '—'}
									</strong>
									<span class="cell-sub">
										{remainingPercent(request) === null ? 'نامشخص' : `${remainingPercent(request)}٪ باقی‌مانده`}
									</span>
								</td>
								<td data-label="انقضا">
									<strong>{request.usage?.expiresAt ? formatRelativeExpiry(request.usage.expiresAt) : 'بدون انقضا'}</strong>
								</td>
								<td data-label="پلن">{planSummary(request)}</td>
								<td data-label="عملیات">
									<a href={`${basePath}/configs`} class="va-chip">بررسی</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="attention-pagination">
				<span>{attentionPage} / {attentionPages}</span>
				<div><button type="button" class="va-icon-btn" disabled={attentionPage <= 1} onclick={() => attentionPage--}><span class="pagination-prev-icon"><AnimatedIcon name="chevron-left" size={12} /></span></button><button type="button" class="va-icon-btn" disabled={attentionPage >= attentionPages} onclick={() => attentionPage++}><AnimatedIcon name="chevron-left" size={12} /></button></div>
			</div>
		{/if}
	</div>
</div>

<style>
	.overview-va {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.attention-pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-top: 1px solid var(--va-border);
		color: var(--va-text-muted);
		font: 500 12px var(--va-font-mono);
	}
	.attention-pagination div { display: flex; gap: 6px; }

	.admin-notice {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-inline-start: 3px solid var(--va-accent);
	}

	.notice-icon {
		width: 26px;
		height: 26px;
		display: grid;
		place-items: center;
		border-radius: 5px;
		background: var(--va-accent-soft);
		color: var(--va-accent);
	}

	.notice-title {
		color: var(--va-text);
		font-size: 12.5px;
	}

	.notice-body {
		margin-top: 3px;
		color: var(--va-text-muted);
		font-size: 12px;
		line-height: 1.7;
	}

	.notice-time {
		margin-inline-start: auto;
		color: var(--va-text-faint);
		font: 500 10.5px var(--va-font-mono);
	}

	.overview-two-col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	.overview-two-col.bottom {
		grid-template-columns: 0.8fr 1.2fr;
	}

	.panel-card {
		overflow: hidden;
	}

	.panel-head {
		padding: 14px 18px;
		border-bottom: 1px solid var(--va-border);
	}

	.panel-head.split {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}

	.panel-title {
		color: var(--va-text);
		font-size: 13px;
		font-weight: 500;
	}

	.panel-sub {
		margin-top: 3px;
		color: var(--va-text-faint);
		font: 500 11px var(--va-font-mono);
	}

	.status-panel-body {
		display: flex;
		align-items: center;
		gap: 28px;
		padding: 20px 18px;
	}

	.legend-list {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.legend-list div {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.legend-list span:nth-child(2) {
		flex: 1;
		color: var(--va-text);
		font-size: 12.5px;
	}

	.legend-list strong {
		color: var(--va-text-muted);
		font: 500 12px var(--va-font-mono);
	}

	.legend-dot {
		width: 7px;
		height: 7px;
		border-radius: 2px;
		background: var(--va-accent);
	}

	.legend-dot.success {
		background: var(--va-success);
	}

	.legend-dot.danger {
		background: var(--va-danger);
	}

	.last-config-body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 18px;
	}

	.last-config-head {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.last-name {
		color: var(--va-text);
		font-size: 14px;
	}

	.last-price {
		margin-inline-start: auto;
		color: var(--va-text);
		font: 500 14px var(--va-font-mono);
		text-align: left;
	}

	.last-price span {
		margin-inline-start: 4px;
		color: var(--va-text-faint);
		font-size: 10.5px;
	}

	.last-code {
		padding: 10px 12px;
		border: 1px solid var(--va-border);
		border-radius: 6px;
		background: var(--va-bg-raised);
		text-align: left;
	}

	.last-code div {
		margin-bottom: 4px;
		color: var(--va-text-faint);
		font: 500 10.5px var(--va-font-mono);
		text-transform: uppercase;
	}

	.last-code p {
		overflow: hidden;
		margin: 0;
		color: var(--va-text);
		font: 500 11px var(--va-font-mono);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.last-actions {
		display: flex;
		gap: 8px;
	}

	.last-actions .admin-btn {
		flex: 1;
		justify-content: center;
	}

	.empty-card {
		padding: 20px;
	}

	.today-list {
		padding: 4px 18px 18px;
	}

	.today-list div,
	.activity-list > div {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--va-border);
	}

	.today-list div:last-child,
	.activity-list > div:last-child {
		border-bottom: 0;
	}

	.today-list :global(svg) {
		color: var(--va-text-muted);
	}

	.today-list span {
		flex: 1;
		color: var(--va-text);
		font-size: 12.5px;
	}

	.today-list strong {
		color: var(--va-text);
		font: 500 13px var(--va-font-mono);
	}

	.activity-list {
		padding: 4px 18px 14px;
	}

	.activity-icon {
		width: 26px;
		height: 26px;
		display: grid;
		place-items: center;
		border-radius: 5px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
	}

	.activity-icon.success {
		color: var(--va-success);
	}

	.activity-icon.accent {
		color: var(--va-accent);
	}

	.activity-icon.warning {
		color: var(--va-warning);
	}

	.activity-list div div {
		flex: 1;
		min-width: 0;
	}

	.activity-list strong {
		display: block;
		color: var(--va-text);
		font-size: 12.5px;
	}

	.activity-list span:not(.activity-icon) {
		display: block;
		margin-top: 2px;
		color: var(--va-text-faint);
		font: 500 10.5px var(--va-font-mono);
	}

	.activity-list em {
		color: var(--va-text-faint);
		font: 500 10.5px var(--va-font-mono);
		font-style: normal;
	}

	.attention-panel {
		overflow: hidden;
	}

	.attention-table-wrap {
		overflow-x: auto;
	}

	.attention-table {
		width: 100%;
		border-collapse: collapse;
		min-width: 760px;
	}

	.attention-table th,
	.attention-table td {
		padding: 12px 14px;
		border-bottom: 1px solid var(--va-border);
		text-align: right;
		vertical-align: middle;
	}

	.attention-table th {
		color: var(--va-text-faint);
		font-size: 11px;
		font-weight: 800;
	}

	.attention-table td {
		color: var(--va-text);
		font-size: 12px;
	}

	.attention-table tr:last-child td {
		border-bottom: 0;
	}

	.attention-client {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.attention-client div {
		display: grid;
		gap: 3px;
		min-width: 0;
	}

	.attention-client strong {
		color: var(--va-text);
		font-size: 12px;
	}

	.attention-client span,
	.cell-sub {
		color: var(--va-text-faint);
		font: 500 10.5px var(--va-font-mono);
	}

	.attention-table td > strong {
		display: block;
		margin-bottom: 3px;
	}

	@media (max-width: 980px) {
		.overview-two-col,
		.overview-two-col.bottom {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 720px) {
		.status-panel-body {
			flex-direction: column;
			align-items: center;
			gap: 16px;
			padding: 16px;
		}

		.legend-list {
			width: 100%;
		}

		.attention-table {
			min-width: 0;
		}

		.attention-table thead {
			display: none;
		}

		.attention-table,
		.attention-table tbody,
		.attention-table tr,
		.attention-table td {
			display: block;
			width: 100%;
		}

		.attention-table tr {
			padding: 12px;
			border-bottom: 1px solid var(--va-border);
		}

		.attention-table td {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			border-bottom: 0;
			padding: 7px 0;
		}

		.attention-table td::before {
			content: attr(data-label);
			color: var(--va-text-faint);
			font-size: 11px;
			font-weight: 800;
		}

		.attention-table td:first-child {
			display: block;
			padding-top: 0;
		}

		.attention-table td:first-child::before {
			display: none;
		}
	}

	.group-badge-banner {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 6px 14px 6px 10px;
		border-radius: 99px;
		background: color-mix(in srgb, var(--group-color, #6366f1) 15%, transparent);
		border: 1px solid color-mix(in srgb, var(--group-color, #6366f1) 40%, transparent);
		color: var(--group-color, #6366f1);
		font-size: 12.5px;
		font-weight: 650;
		width: fit-content;
	}

	.group-badge-icon {
		font-size: 15px;
	}
</style>
