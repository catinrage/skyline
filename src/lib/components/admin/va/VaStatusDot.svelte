<script lang="ts">
	type Props = {
		tone?: 'success' | 'warning' | 'danger' | 'muted' | 'accent';
		label: string;
		mono?: boolean;
	};

	let { tone = 'muted', label, mono = false }: Props = $props();
</script>

<span class="va-status va-status-{tone}" class:mono>
	<span aria-hidden="true"></span>
	{label}
</span>

<style>
	.va-status {
		display: inline-flex;
		align-items: center;
		gap: 0.38rem;
		color: var(--va-text-muted);
		font-size: 0.75rem;
		white-space: nowrap;
	}

	.va-status span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
		flex-shrink: 0;
	}

	.mono {
		font-family: var(--va-font-mono);
	}

	.va-status-success {
		color: var(--va-success);
	}

	.va-status-warning {
		color: var(--va-warning);
	}

	.va-status-danger {
		color: var(--va-danger);
	}

	.va-status-muted {
		color: var(--va-text-faint);
	}

	.va-status-accent {
		color: var(--va-accent);
	}
</style>
