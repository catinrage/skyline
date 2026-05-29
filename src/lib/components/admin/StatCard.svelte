<script lang="ts">
	import AnimatedIcon from './AnimatedIcon.svelte';

	type IconName = 'dashboard' | 'traffic' | 'message' | 'apps' | 'cloud' | 'shield' | 'store' |
		'ticket' | 'database' | 'key' | 'toggle' | 'flag' | 'logout' | 'overview' | 'plus-network' |
		'list' | 'finance' | 'search' | 'bell' | 'sun' | 'moon' | 'menu' | 'chevron-left' |
		'sparkle' | 'check' | 'spark-up' | 'spark-down';

	type Props = {
		label: string;
		value: string;
		hint?: string;
		trend?: { direction: 'up' | 'down' | 'flat'; text: string } | null;
		icon?: IconName;
		accent?: 'violet' | 'sky' | 'emerald' | 'amber' | 'rose';
	};

	let { label, value, hint, trend = null, icon = 'sparkle', accent = 'violet' }: Props = $props();

	const accentColor = $derived(
		{
			violet: 'var(--admin-accent)',
			sky: 'var(--admin-info)',
			emerald: 'var(--admin-success)',
			amber: 'var(--admin-warning)',
			rose: 'var(--admin-danger)'
		}[accent]
	);
</script>

<div class="admin-card admin-stat" style="--card-accent: {accentColor};">
	<div class="stat-head">
		<div class="stat-icon-wrap">
			<AnimatedIcon name={icon} size={20} active />
		</div>
		<span class="stat-menu" aria-hidden="true">
			<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6">
				<circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
			</svg>
		</span>
	</div>
	<p class="admin-stat-label">{label}</p>
	<p class="admin-stat-value">{value}</p>
	{#if trend}
		<p class="admin-stat-meta">
			<span class="stat-trend stat-trend-{trend.direction}">
				{#if trend.direction === 'up'}
					<AnimatedIcon name="spark-up" size={12} />
				{:else if trend.direction === 'down'}
					<AnimatedIcon name="spark-down" size={12} />
				{:else}
					<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16" /></svg>
				{/if}
				<span>{trend.text}</span>
			</span>
		</p>
	{:else if hint}
		<p class="admin-stat-meta">{hint}</p>
	{/if}
</div>

<style>
	.admin-stat { display: flex; flex-direction: column; gap: 0.25rem; }
	.stat-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.6rem; }
	.stat-icon-wrap {
		width: 30px; height: 30px;
		border-radius: 0.35rem;
		display: inline-flex; align-items: center; justify-content: center;
		color: var(--card-accent);
		background: color-mix(in srgb, var(--card-accent) 14%, transparent);
		border: 1px solid color-mix(in srgb, var(--card-accent) 22%, transparent);
	}
	.stat-menu {
		color: var(--admin-text-faint);
		cursor: pointer;
		transition: color 0.2s ease;
	}
	.stat-menu:hover { color: var(--admin-text); }
	.stat-trend {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-weight: 500;
	}
	.stat-trend-up { color: var(--admin-success); }
	.stat-trend-down { color: var(--admin-danger); }
	.stat-trend-flat { color: var(--admin-text-muted); }
</style>
