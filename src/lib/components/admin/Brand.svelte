<script lang="ts">
	type Props = {
		size?: number;
		title?: string;
	};

	let { size = 36, title = '' }: Props = $props();
</script>

<div class="brand">
	<img src="/favicon.png" width={size} height={size} class="brand-mark" alt="" aria-hidden="true" />
	{#if title}
		<span class="brand-text">{title}</span>
	{/if}
</div>

<style>
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}
	.brand-mark {
		flex-shrink: 0;
		display: block;
		object-fit: contain;
		filter: drop-shadow(0 10px 22px color-mix(in srgb, var(--va-accent, #3b82f6) 18%, transparent));
	}
	.brand-text {
		font: 700 0.92rem var(--va-font-fa, Vazir, system-ui, sans-serif);
		color: var(--va-text, #e4e7eb);
	}
</style>
