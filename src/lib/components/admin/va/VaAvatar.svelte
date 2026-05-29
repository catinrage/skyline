<script lang="ts">
	type Props = {
		name: string;
		size?: number;
	};

	let { name, size = 24 }: Props = $props();
</script>

<span class="va-avatar" style="width: {size}px; height: {size}px; font-size: {size * 0.45}px;">
	{name.slice(0, 1).toUpperCase()}
</span>

<style>
	.va-avatar {
		display: inline-grid;
		place-items: center;
		flex-shrink: 0;
		border: 1px solid var(--va-border);
		border-radius: 20%;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		font-family: var(--va-font-mono);
		font-weight: 600;
		line-height: 1;
	}
</style>
