<script lang="ts">
	type Props = {
		checked?: boolean;
		name?: string;
		value?: string | number;
		disabled?: boolean;
		label?: string;
		ariaLabel?: string;
		variant?: 'checkbox' | 'switch';
	};

	let {
		checked = $bindable(false),
		name,
		value,
		disabled = false,
		label,
		ariaLabel,
		variant = 'checkbox'
	}: Props = $props();
</script>

<label class="va-checkbox {variant}" class:is-disabled={disabled}>
	<input
		type="checkbox"
		bind:checked
		{name}
		{value}
		{disabled}
		aria-label={ariaLabel ?? label}
	/>
	<span class="control" aria-hidden="true">
		{#if variant === 'checkbox'}
			<svg viewBox="0 0 12 12">
				<path d="M2.3 6.2 4.7 8.5 9.7 3.4" />
			</svg>
		{:else}
			<i></i>
		{/if}
	</span>
	{#if label}
		<span class="label">{label}</span>
	{/if}
</label>

<style>
	.va-checkbox {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 9px;
		min-width: 0;
		color: var(--va-text-muted);
		font-size: 12px;
		cursor: pointer;
		user-select: none;
	}

	input {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: 0;
		opacity: 0;
		pointer-events: none;
	}

	.control {
		flex-shrink: 0;
		border: 1px solid var(--va-border-strong);
		background: var(--va-bg-raised);
		transition:
			border-color 0.16s ease,
			background-color 0.16s ease,
			box-shadow 0.16s ease;
	}

	.checkbox .control {
		display: grid;
		place-items: center;
		width: 17px;
		height: 17px;
		border-radius: 5px;
	}

	.checkbox svg {
		width: 12px;
		height: 12px;
		fill: none;
		stroke: var(--va-bg-panel);
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
		opacity: 0;
		transform: scale(0.75);
		transition:
			opacity 0.14s ease,
			transform 0.14s ease;
	}

	.checkbox input:checked + .control {
		border-color: var(--va-accent);
		background: var(--va-accent);
	}

	.checkbox input:checked + .control svg {
		opacity: 1;
		transform: scale(1);
	}

	.switch .control {
		position: relative;
		display: inline-block;
		width: 32px;
		height: 18px;
		border-radius: 999px;
		border-color: var(--va-border);
		background: var(--va-bg-raised);
	}

	.switch i {
		position: absolute;
		top: 2px;
		inset-inline-end: 16px;
		width: 12px;
		height: 12px;
		border-radius: 999px;
		background: var(--va-bg-panel);
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.22);
		transition: inset-inline-end 0.16s ease;
	}

	.switch input:checked + .control {
		border-color: var(--va-accent);
		background: var(--va-accent);
	}

	.switch input:checked + .control i {
		inset-inline-end: 2px;
	}

	input:focus-visible + .control {
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--va-accent) 23%, transparent);
		border-color: var(--va-accent);
	}

	.va-checkbox:hover:not(.is-disabled) .control {
		border-color: color-mix(in srgb, var(--va-accent) 56%, var(--va-border-strong));
	}

	.label {
		min-width: 0;
		color: var(--va-text);
		line-height: 1.5;
	}

	.is-disabled {
		opacity: 0.48;
		cursor: not-allowed;
	}
</style>
