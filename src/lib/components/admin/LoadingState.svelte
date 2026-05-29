<script lang="ts">
	type Props = {
		label?: string;
		size?: number;
	};

	let { label = 'در حال بارگذاری...', size = 64 }: Props = $props();
</script>

<div class="loading-state">
	<svg viewBox="0 0 64 64" width={size} height={size} class="loading-svg" fill="none">
		<defs>
			<linearGradient id="loading-ring" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0%" stop-color="var(--admin-accent)" stop-opacity="1" />
				<stop offset="100%" stop-color="var(--admin-info)" stop-opacity="0.4" />
			</linearGradient>
		</defs>
		<circle cx="32" cy="32" r="26" stroke="var(--admin-surface-soft)" stroke-width="4" />
		<circle
			cx="32"
			cy="32"
			r="26"
			stroke="url(#loading-ring)"
			stroke-width="4"
			stroke-linecap="round"
			stroke-dasharray="48 200"
			class="loading-spin"
		/>
		<circle cx="32" cy="32" r="6" fill="var(--admin-accent)" class="loading-pulse" />
	</svg>
	{#if label}
		<p class="loading-label">{label}</p>
	{/if}
</div>

<style>
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.85rem;
		padding: 3rem 1rem;
	}
	.loading-spin {
		transform-origin: center;
		animation: admin-spin 1.2s linear infinite;
	}
	.loading-pulse {
		transform-origin: center;
		animation: loading-pulse 1.6s ease-in-out infinite;
	}
	@keyframes loading-pulse {
		0%, 100% { opacity: 0.5; transform: scale(0.7); }
		50% { opacity: 1; transform: scale(1.1); }
	}
	.loading-label {
		color: var(--admin-text-muted);
		font-size: 0.85rem;
		margin: 0;
	}
	@media (prefers-reduced-motion: reduce) {
		.loading-spin, .loading-pulse { animation: none; }
	}
</style>
