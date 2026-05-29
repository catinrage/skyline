<script lang="ts">
	import { formatTraffic } from '$lib/utils/format';
	import EmptyState from '$lib/components/admin/EmptyState.svelte';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import VaAvatar from '$lib/components/admin/va/VaAvatar.svelte';
	import VaProgressBar from '$lib/components/admin/va/VaProgressBar.svelte';
	import VaStatRow from '$lib/components/admin/va/VaStatRow.svelte';
	import VaStatusDot from '$lib/components/admin/va/VaStatusDot.svelte';

	type ClientStatus = 'active' | 'depleted' | 'disabled' | 'expired';
	type Client = {
		uuid: string;
		email: string;
		inboundRemark: string | null;
		usedBytes: number;
		totalBytes: number | null;
		remainingBytes: number | null;
		usageRatio: number | null;
		status: ClientStatus;
		isOnline: boolean | null;
	};

	type Props = {
		data: {
			vpnDashboard: {
				summary: {
					totalClients: number;
					activeClients: number;
					activeLimitedClients: number;
					expiringSoonClients: number;
					depletedClients: number;
					activeLimitedRemainingBytes: number | null;
					totalUsedBytes: number;
					totalQuotaBytes: number | null;
				};
				inbounds: Array<{
					remark: string | null;
					totalClients: number;
					activeLimitedClients: number;
					activeLimitedRemainingBytes: number | null;
				}>;
				clients: Client[];
			} | null;
		};
	};

	let { data }: Props = $props();

	const dashboard = $derived(data.vpnDashboard);
	const summary = $derived(dashboard?.summary);
	let consumersPage = $state(1);
	const pageSize = 10;
	const sortedConsumers = $derived([...(dashboard?.clients ?? [])].sort((left, right) => right.usedBytes - left.usedBytes));
	const consumersPages = $derived(Math.max(1, Math.ceil(sortedConsumers.length / pageSize)));
	const topConsumers = $derived(sortedConsumers.slice((consumersPage - 1) * pageSize, consumersPage * pageSize));
	const maxInboundClients = $derived(Math.max(1, ...(dashboard?.inbounds ?? []).map((inbound) => inbound.totalClients)));
	const chartBars = $derived.by(() => {
		const clients = dashboard?.clients ?? [];
		const chunks = Array.from({ length: 30 }, (_, i) => ({ label: i + 1, used: 0, active: 0 }));

		for (const [index, client] of clients.entries()) {
			const bucket = chunks[index % chunks.length];
			bucket.used += client.usedBytes;
			if (client.status === 'active') bucket.active += client.usedBytes * 0.28;
		}

		const max = Math.max(1, ...chunks.map((chunk) => chunk.used + chunk.active));
		return chunks.map((chunk) => ({
			...chunk,
			totalRatio: ((chunk.used + chunk.active) / max) * 100,
			activeRatio: (chunk.active / max) * 100
		}));
	});

	const statItems = $derived([
		{
			label: 'مصرف کل',
			value: formatBytes(summary?.totalUsedBytes),
			unit: '',
			delta: 'همه inbound ها',
			deltaTone: 'muted' as const
		},
		{
			label: 'باقی‌مانده محدودها',
			value: formatBytes(summary?.activeLimitedRemainingBytes),
			unit: '',
			delta: `${(summary?.activeLimitedClients ?? 0).toLocaleString('fa-IR-u-nu-latn')} کانفیگ محدود`,
			deltaTone: 'success' as const
		},
		{
			label: 'فعال هم‌اکنون',
			value: summary?.activeClients ?? 0,
			unit: 'کاربر',
			delta: `${(summary?.totalClients ?? 0).toLocaleString('fa-IR-u-nu-latn')} کل`,
			deltaTone: 'success' as const
		},
		{
			label: 'اخطار مصرف',
			value: summary?.depletedClients ?? 0,
			unit: 'تمام‌شده',
			delta: `${(summary?.expiringSoonClients ?? 0).toLocaleString('fa-IR-u-nu-latn')} نزدیک انقضا`,
			deltaTone: 'warning' as const
		}
	]);

	function formatBytes(bytes: number | null | undefined) {
		return bytes === null || bytes === undefined ? 'نامحدود' : formatTraffic(bytes);
	}

	function percent(value: number | null) {
		return Math.round(Math.min(100, Math.max(0, (value ?? 0) * 100)));
	}

	function consumerTone(client: Client): 'accent' | 'warning' | 'danger' | null {
		const usage = percent(client.usageRatio);
		if (client.status === 'depleted' || usage >= 95) return 'danger';
		if (client.status === 'expired' || usage >= 80) return 'warning';
		return 'accent';
	}

	function statusLabel(status: ClientStatus) {
		if (status === 'active') return 'فعال';
		if (status === 'depleted') return 'اتمام حجم';
		if (status === 'expired') return 'منقضی';
		return 'غیرفعال';
	}
</script>

{#if !dashboard}
	<EmptyState
		title="هیچ داده‌ای از x-ui در دسترس نیست"
		description="ارتباط با x-ui برقرار نشد یا هنوز ورودی فعالی تعریف نکرده‌اید."
		icon="search"
	/>
{:else}
	<div class="traffic-va">
		<VaStatRow items={statItems} />

		<div class="va-card chart-card">
			<div class="chart-head">
				<div>
					<div class="panel-title">مصرف ۳۰ بخش اخیر</div>
					<div class="panel-sub">نمای فشرده از توزیع مصرف فعلی کلاینت‌ها</div>
				</div>
				<div class="legend">
					<span><i class="legend-dot download"></i> مصرف</span>
					<span><i class="legend-dot upload"></i> فعال</span>
				</div>
			</div>

			<div class="chart-bars" aria-label="نمودار مصرف">
				{#each chartBars as bar (bar.label)}
					<div class="chart-bar" title={`بخش ${bar.label}`}>
						<span class="bar-active" style={`height: ${bar.activeRatio}%`}></span>
						<span class="bar-used" style={`height: ${bar.totalRatio}%`}></span>
					</div>
				{/each}
			</div>

			<div class="chart-footer">
				<div>
					<span>کل کاربران</span>
					<strong>{summary?.totalClients.toLocaleString('fa-IR-u-nu-latn')}</strong>
				</div>
				<div>
					<span>ظرفیت تعریف‌شده</span>
					<strong>{formatBytes(summary?.totalQuotaBytes)}</strong>
				</div>
				<div>
					<span>تمام‌شده</span>
					<strong>{summary?.depletedClients.toLocaleString('fa-IR-u-nu-latn')}</strong>
				</div>
				<div>
					<span>inbound فعال</span>
					<strong>{dashboard.inbounds.length.toLocaleString('fa-IR-u-nu-latn')}</strong>
				</div>
			</div>
		</div>

		<div class="traffic-grid">
			<div class="va-card traffic-panel">
				<div class="panel-head">
					<div>
						<div class="panel-title">پرمصرف‌ترین کاربران</div>
						<div class="panel-sub">مرتب شده براساس مصرف فعلی</div>
					</div>
					<span class="va-chip">Top</span>
				</div>

				{#if topConsumers.length === 0}
					<div class="empty-wrap">
						<EmptyState title="مصرفی ثبت نشده" description="بعد از اتصال کلاینت‌ها، لیست پرمصرف‌ها اینجا دیده می‌شود." icon="inbox" />
					</div>
				{:else}
					<table class="va-table traffic-table">
						<tbody>
							{#each topConsumers as client, i (client.uuid)}
								<tr>
									<td class="rank">{String(i + 1).padStart(2, '0')}</td>
									<td>
										<div class="consumer-cell">
											<VaAvatar name={client.email} size={22} />
											<div>
												<div class="consumer-name">{client.email}</div>
												<div class="panel-sub">{client.inboundRemark ?? 'بدون inbound'} · {client.uuid.slice(0, 8)}</div>
											</div>
										</div>
									</td>
									<td>
										<VaStatusDot tone={client.status === 'active' ? 'success' : client.status === 'disabled' ? 'muted' : 'warning'} label={statusLabel(client.status)} />
									</td>
									<td class="usage-cell">
										<div class="usage-line">
											<span>{formatBytes(client.usedBytes)}</span>
											<span>{client.totalBytes ? `/ ${formatBytes(client.totalBytes)}` : '/ نامحدود'}</span>
										</div>
										<VaProgressBar value={percent(client.usageRatio)} max={100} tone={consumerTone(client)} />
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
					<div class="traffic-pagination">
						<span>{consumersPage} / {consumersPages}</span>
						<div><button type="button" class="va-icon-btn" disabled={consumersPage <= 1} onclick={() => consumersPage--}><span class="pagination-prev-icon"><AnimatedIcon name="chevron-left" size={12} /></span></button><button type="button" class="va-icon-btn" disabled={consumersPage >= consumersPages} onclick={() => consumersPage++}><AnimatedIcon name="chevron-left" size={12} /></button></div>
					</div>
				{/if}
			</div>

			<div class="va-card traffic-panel">
				<div class="panel-head">
					<div>
						<div class="panel-title">سرورها</div>
						<div class="panel-sub">سهم و ظرفیت هر inbound</div>
					</div>
					<AnimatedIcon name="cloud" size={16} />
				</div>

				<div class="inbound-list">
					{#each dashboard.inbounds as inbound, i (`${inbound.remark ?? 'inbound'}-${i}`)}
						{@const activeRatio = Math.round((inbound.activeLimitedClients / maxInboundClients) * 100)}
						<div class="inbound-row">
							<div class="inbound-row-head">
								<div>
									<div class="inbound-title">{inbound.remark || 'بدون نام'}</div>
									<div class="panel-sub">{inbound.activeLimitedClients} فعال از {inbound.totalClients}</div>
								</div>
								<strong>{formatBytes(inbound.activeLimitedRemainingBytes)}</strong>
							</div>
							<VaProgressBar value={activeRatio} max={100} tone={activeRatio > 80 ? 'warning' : 'accent'} />
							<div class="inbound-foot">
								<span>{activeRatio}% سهم فعال‌ها</span>
								<span>باقی‌مانده محدودها</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.traffic-va {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.chart-card,
	.traffic-panel {
		overflow: hidden;
		padding: 0;
	}

	.chart-head,
	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--va-border);
	}

	.traffic-pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 18px;
		border-top: 1px solid var(--va-border);
		color: var(--va-text-muted);
		font: 500 12px var(--va-font-mono);
	}
	.traffic-pagination div { display: flex; gap: 6px; }

	.panel-title {
		color: var(--va-text);
		font-size: 13px;
		font-weight: 500;
	}

	.panel-sub {
		margin-top: 3px;
		color: var(--va-text-faint);
		font: 500 10.5px var(--va-font-mono);
	}

	.legend {
		display: flex;
		align-items: center;
		gap: 16px;
		color: var(--va-text-muted);
		font: 500 11px var(--va-font-mono);
	}

	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.legend-dot {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		background: var(--va-accent);
	}

	.legend-dot.upload {
		opacity: 0.42;
	}

	.chart-bars {
		height: 238px;
		display: grid;
		grid-template-columns: repeat(30, minmax(4px, 1fr));
		align-items: end;
		gap: 6px;
		padding: 24px 18px 14px;
		background:
			linear-gradient(to bottom, transparent 24%, var(--va-border) 24% 24.5%, transparent 24.5% 49%, var(--va-border) 49% 49.5%, transparent 49.5% 74%, var(--va-border) 74% 74.5%, transparent 74.5%),
			var(--va-bg-panel);
	}

	.chart-bar {
		position: relative;
		height: 100%;
		min-height: 1px;
		display: flex;
		align-items: end;
		justify-content: center;
	}

	.bar-used,
	.bar-active {
		position: absolute;
		bottom: 0;
		width: 72%;
		min-height: 2px;
		border-radius: 2px 2px 0 0;
		background: var(--va-accent);
	}

	.bar-active {
		z-index: 1;
		opacity: 0.42;
		transform: translateY(-100%);
	}

	.chart-footer {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		border-top: 1px solid var(--va-border);
	}

	.chart-footer div {
		padding: 10px 16px;
		border-inline-end: 1px solid var(--va-border);
	}

	.chart-footer div:last-child {
		border-inline-end: 0;
	}

	.chart-footer span {
		display: block;
		color: var(--va-text-faint);
		font: 500 10px var(--va-font-mono);
	}

	.chart-footer strong {
		display: block;
		margin-top: 4px;
		color: var(--va-text);
		font: 500 13px var(--va-font-mono);
	}

	.traffic-grid {
		display: grid;
		grid-template-columns: 1.4fr 1fr;
		gap: 16px;
	}

	.traffic-table {
		border: 0;
		border-radius: 0;
	}

	.rank {
		width: 46px;
		color: var(--va-text-faint);
		font: 500 11px var(--va-font-mono);
	}

	.consumer-cell {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.consumer-name,
	.inbound-title {
		color: var(--va-text);
		font-size: 12.5px;
		font-weight: 500;
	}

	.usage-cell {
		width: 190px;
		text-align: left;
	}

	.usage-line {
		display: flex;
		align-items: baseline;
		justify-content: flex-end;
		gap: 6px;
		margin-bottom: 7px;
		color: var(--va-text);
		font: 500 12px var(--va-font-mono);
	}

	.usage-line span:last-child {
		color: var(--va-text-faint);
		font-size: 10.5px;
	}

	.inbound-list {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 14px 18px 18px;
	}

	.inbound-row-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 8px;
	}

	.inbound-row-head strong {
		color: var(--va-text);
		font: 500 13px var(--va-font-mono);
	}

	.inbound-foot {
		display: flex;
		justify-content: space-between;
		margin-top: 6px;
		color: var(--va-text-faint);
		font: 500 10.5px var(--va-font-mono);
	}

	.empty-wrap {
		padding: 22px;
	}

	@media (max-width: 980px) {
		.traffic-grid,
		.chart-footer {
			grid-template-columns: 1fr;
		}

		.chart-footer div {
			border-inline-end: 0;
			border-bottom: 1px solid var(--va-border);
		}

		.chart-footer div:last-child {
			border-bottom: 0;
		}

		.usage-cell {
			width: auto;
		}
	}
</style>
