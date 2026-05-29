<script lang="ts">
	import AnimatedIcon from './AnimatedIcon.svelte';
	import type { Snippet } from 'svelte';

	type IconName = 'dashboard' | 'traffic' | 'message' | 'apps' | 'cloud' | 'shield' | 'store' |
		'ticket' | 'database' | 'key' | 'toggle' | 'flag' | 'logout' | 'overview' | 'plus-network' |
		'list' | 'finance' | 'search' | 'bell' | 'sun' | 'moon' | 'menu' | 'chevron-left' | 'sparkle' |
		'check' | 'spark-up' | 'spark-down';

	type Props = {
		title: string;
		description?: string;
		icon?: IconName;
		children: Snippet;
		actions?: Snippet;
		variant?: 'default' | 'hero';
		padding?: 'normal' | 'tight';
	};

	let { title, description, icon, children, actions, variant = 'default', padding = 'normal' }: Props = $props();
</script>

<section class="admin-section" class:variant-hero={variant === 'hero'} class:padding-tight={padding === 'tight'}>
	<header class="section-head">
		<div class="section-head-text">
			{#if icon}
				<div class="section-icon"><AnimatedIcon name={icon} size={20} active /></div>
			{/if}
			<div>
				<h2 class="section-title">{title}</h2>
				{#if description}<p class="section-desc">{description}</p>{/if}
			</div>
		</div>
		{#if actions}<div class="section-actions">{@render actions()}</div>{/if}
	</header>

	<div class="section-body">
		{@render children()}
	</div>
</section>

<style>
	.admin-section {
		background: var(--admin-card);
		border: 1px solid var(--admin-border);
		border-radius: 0.55rem;
		padding: 1rem;
		box-shadow: var(--admin-shadow-card);
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		animation: admin-fade-in-up 0.4s ease both;
	}
	.padding-tight { padding: 0.8rem; }
	.variant-hero {
		background:
			linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, transparent 74%),
			var(--admin-card);
		border-color: var(--admin-border-strong);
		box-shadow: var(--admin-shadow-pop);
	}
	.section-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.section-head-text {
		display: flex;
		align-items: flex-start;
		gap: 0.85rem;
	}
	.section-icon {
		width: 30px; height: 30px;
		border-radius: 0.35rem;
		display: inline-flex; align-items: center; justify-content: center;
		background: var(--admin-accent-soft);
		border: 1px solid var(--admin-border-strong);
		color: var(--admin-accent);
		flex-shrink: 0;
	}
	.section-title { font-size: 0.92rem; font-weight: 600; color: var(--admin-text-strong); margin: 0; }
	.section-desc { margin: 0.25rem 0 0; color: var(--admin-text-muted); font-size: 0.76rem; line-height: 1.7; }
	.section-actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
	.section-body { color: var(--admin-text); }
</style>
