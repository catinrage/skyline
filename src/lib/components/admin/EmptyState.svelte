<script lang="ts">
	type Props = {
		title: string;
		description?: string;
		icon?: 'inbox' | 'search' | 'bell' | 'sparkle';
	};

	let { title, description, icon = 'inbox' }: Props = $props();
</script>

<div class="empty-state">
	<svg viewBox="0 0 160 120" width="160" height="120" class="empty-illustration" fill="none">
		<defs>
			<linearGradient id="empty-grad" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0%" stop-color="var(--admin-accent)" stop-opacity="0.55" />
				<stop offset="100%" stop-color="var(--admin-info)" stop-opacity="0.25" />
			</linearGradient>
			<radialGradient id="empty-glow" cx="50%" cy="50%" r="60%">
				<stop offset="0%" stop-color="var(--admin-accent)" stop-opacity="0.3" />
				<stop offset="100%" stop-color="var(--admin-accent)" stop-opacity="0" />
			</radialGradient>
		</defs>

		<!-- ambient glow -->
		<ellipse cx="80" cy="92" rx="58" ry="10" fill="url(#empty-glow)" class="empty-floor" />

		{#if icon === 'inbox'}
			<g class="empty-bob">
				<rect x="36" y="36" width="88" height="60" rx="14" fill="url(#empty-grad)" stroke="var(--admin-border-strong)" stroke-width="1.4" />
				<path d="M36 72h25l5 8h28l5-8h25" stroke="var(--admin-accent)" stroke-width="1.6" fill="rgba(139,92,246,0.18)" />
				<path d="M58 50h44" stroke="var(--admin-text-faint)" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="2 4" />
				<path d="M64 60h32" stroke="var(--admin-text-faint)" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="2 4" />
			</g>
		{:else if icon === 'search'}
			<g class="empty-bob">
				<circle cx="72" cy="60" r="24" fill="url(#empty-grad)" stroke="var(--admin-border-strong)" stroke-width="1.4" />
				<circle cx="72" cy="60" r="14" fill="none" stroke="var(--admin-accent)" stroke-width="1.6" />
				<path d="M90 78l16 14" stroke="var(--admin-accent)" stroke-width="3" stroke-linecap="round" />
				<circle cx="72" cy="60" r="4" fill="var(--admin-accent)" class="empty-pulse" />
			</g>
		{:else if icon === 'bell'}
			<g class="empty-bob">
				<path d="M52 68V52a28 28 0 0 1 56 0v16l8 10H44z" fill="url(#empty-grad)" stroke="var(--admin-border-strong)" stroke-width="1.4" />
				<path d="M70 88a10 10 0 0 0 20 0" stroke="var(--admin-accent)" stroke-width="1.6" />
			</g>
		{:else}
			<g class="empty-bob">
				<path d="M80 26l8 24 24 8-24 8-8 24-8-24-24-8 24-8z" fill="url(#empty-grad)" stroke="var(--admin-accent)" stroke-width="1.4" />
			</g>
		{/if}
	</svg>

	<h3 class="empty-title">{title}</h3>
	{#if description}
		<p class="empty-desc">{description}</p>
	{/if}
</div>

<style>
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 2.25rem 1rem;
		text-align: center;
	}
	.empty-illustration {
		filter: drop-shadow(0 18px 28px rgba(139, 92, 246, 0.18));
	}
	.empty-bob { animation: admin-float 3.6s ease-in-out infinite; transform-origin: 80px 60px; }
	.empty-floor { animation: floor-pulse 3.6s ease-in-out infinite; transform-origin: center; }
	@keyframes floor-pulse {
		0%, 100% { opacity: 0.65; transform: scaleX(1); }
		50% { opacity: 0.35; transform: scaleX(0.85); }
	}
	.empty-pulse {
		transform-origin: center;
		animation: pulse-soft 1.8s ease-in-out infinite;
	}
	@keyframes pulse-soft {
		0%, 100% { opacity: 0.4; transform: scale(0.85); }
		50% { opacity: 1; transform: scale(1.25); }
	}
	.empty-title {
		color: var(--admin-text-strong);
		font-weight: 600;
		font-size: 1rem;
		margin: 0;
	}
	.empty-desc {
		color: var(--admin-text-muted);
		font-size: 0.85rem;
		max-width: 32ch;
		line-height: 1.7;
		margin: 0;
	}
	@media (prefers-reduced-motion: reduce) {
		.empty-bob, .empty-floor, .empty-pulse { animation: none; }
	}
</style>
