<script lang="ts">
	type Props = {
		value: number;
		max: number;
		tone?: 'accent' | 'warning' | 'danger' | null;
	};

	let { value, max, tone = 'accent' }: Props = $props();
	const ratio = $derived(max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0);
</script>

<span class="va-progress" class:tone-warning={tone === 'warning'} class:tone-danger={tone === 'danger'}>
	<span style="width: {ratio}%"></span>
</span>

<style>
	.va-progress {
		display: block;
		width: 100%;
		height: 3px;
		overflow: hidden;
		border-radius: 2px;
		background: var(--va-border);
	}

	.va-progress span {
		display: block;
		height: 100%;
		background: var(--va-accent);
	}

	.tone-warning span {
		background: var(--va-warning);
	}

	.tone-danger span {
		background: var(--va-danger);
	}
</style>
