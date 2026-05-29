<script lang="ts">
	import NumberFlow from '@number-flow/svelte';

	type Stat = {
		label: string;
		value: string | number;
		unit?: string;
		delta?: string;
		deltaTone?: 'success' | 'warning' | 'danger' | 'muted';
	};

	type Props = {
		items: Stat[];
	};

	let { items }: Props = $props();
</script>

<div class="va-stat-row">
	{#each items as item, index (item.label)}
		<div class="va-stat-cell" class:last={index === items.length - 1}>
			<div class="va-stat-label">{item.label}</div>
			<div class="va-stat-value">
				{#if typeof item.value === 'number'}
					<NumberFlow
						value={item.value}
						locales="fa-IR-u-nu-latn"
						format={{ useGrouping: true, maximumFractionDigits: 0 }}
					/>
				{:else}
					{item.value}
				{/if}
				{#if item.unit}<span>{item.unit}</span>{/if}
			</div>
			{#if item.delta}
				<div class="va-stat-delta tone-{item.deltaTone ?? 'success'}">{item.delta}</div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.va-stat-row {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		flex-shrink: 0;
		overflow: hidden;
		border: 1px solid var(--va-border);
		border-radius: 8px;
		background: var(--va-bg-panel);
	}

	.va-stat-cell {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 12px 16px;
		border-inline-end: 1px solid var(--va-border);
		min-width: 0;
	}

	.va-stat-cell.last {
		border-inline-end: 0;
	}

	.va-stat-label {
		font: 500 10.5px var(--va-font-mono);
		color: var(--va-text-faint);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.va-stat-value {
		font: 500 18px/1.2 var(--va-font-mono);
		color: var(--va-text);
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}

	.va-stat-value span {
		margin-inline-start: 4px;
		font-size: 10.5px;
		color: var(--va-text-faint);
	}

	.va-stat-delta {
		margin-top: 2px;
		font: 500 11px var(--va-font-mono);
		color: var(--va-success);
	}

	.tone-warning {
		color: var(--va-warning);
	}

	.tone-danger {
		color: var(--va-danger);
	}

	.tone-muted {
		color: var(--va-text-faint);
	}

	@media (max-width: 760px) {
		.va-stat-row {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.va-stat-cell:nth-child(2n) {
			border-inline-end: 0;
		}

		.va-stat-cell:nth-child(n + 3) {
			border-top: 1px solid var(--va-border);
		}
	}
</style>
