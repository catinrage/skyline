<script lang="ts">
	type Inbound = { id: number; remark: string | null; protocol?: string | null; port?: number | null };

	type Props = {
		options: Inbound[];
		selected: number[] | null; // null = all allowed
		name?: string;
		onchange?: (ids: number[] | null) => void;
	};

	let { options, selected, name = 'allowedInboundIds', onchange }: Props = $props();

	// null means "all selected" — derive a working Set
	const allIds = $derived(options.map((o) => o.id));
	let localSelected = $state<Set<number>>(new Set(selected ?? allIds));

	// Keep localSelected in sync when parent-provided selected changes
	$effect(() => {
		localSelected = new Set(selected ?? allIds);
	});

	function toggle(id: number) {
		const next = new Set(localSelected);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		localSelected = next;
		// If all are selected treat it as null (unrestricted)
		const effectiveIds = next.size === allIds.length ? null : [...next];
		onchange?.(effectiveIds);
	}

	function selectAll() {
		localSelected = new Set(allIds);
		onchange?.(null);
	}

	function clearAll() {
		localSelected = new Set();
		onchange?.([]);
	}

	const selectedCount = $derived(localSelected.size);
	const allSelected = $derived(selectedCount === allIds.length);
</script>

<div class="inbound-picker">
	<div class="picker-head">
		<span class="picker-label">
			{#if allSelected}
				همه سرورها مجاز
			{:else}
				{selectedCount} از {allIds.length} سرور
			{/if}
		</span>
		<div class="picker-bulk">
			<button type="button" class="bulk-btn" onclick={selectAll} disabled={allSelected}>همه</button>
			<button type="button" class="bulk-btn" onclick={clearAll} disabled={selectedCount === 0}>هیچ</button>
		</div>
	</div>

	<div class="picker-grid">
		{#each options as inbound (inbound.id)}
			{@const isOn = localSelected.has(inbound.id)}
			<!-- Hidden checkbox for form submission -->
			{#if isOn}
				<input type="hidden" {name} value={inbound.id} />
			{/if}
			<button
				type="button"
				class="picker-item"
				class:is-on={isOn}
				onclick={() => toggle(inbound.id)}
				aria-pressed={isOn}
			>
				<span class="picker-check" aria-hidden="true">
					{#if isOn}
						<svg viewBox="0 0 12 12" fill="none">
							<path d="M2.3 6.2 4.7 8.5 9.7 3.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					{/if}
				</span>
				<span class="picker-name">{inbound.remark || `Inbound #${inbound.id}`}</span>
				{#if inbound.protocol || inbound.port}
					<span class="picker-meta">{inbound.protocol ?? ''}{inbound.port ? `:${inbound.port}` : ''}</span>
				{/if}
			</button>
		{/each}
	</div>

	{#if !allSelected}
		<p class="picker-hint">سرورهایی که انتخاب نشده‌اند، برای این فروشنده مسدود می‌شوند.</p>
	{/if}
</div>

<style>
	.inbound-picker {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.picker-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.picker-label {
		color: var(--va-text-muted);
		font: 500 11px var(--va-font-mono);
	}

	.picker-bulk {
		display: flex;
		gap: 4px;
	}

	.bulk-btn {
		padding: 2px 8px;
		border: 1px solid var(--va-border);
		border-radius: 4px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		cursor: pointer;
		font: 500 10px var(--va-font-mono);
		transition: background-color 0.15s, color 0.15s;
	}

	.bulk-btn:not(:disabled):hover {
		background: color-mix(in srgb, var(--va-accent) 10%, var(--va-bg-raised));
		color: var(--va-text);
		border-color: color-mix(in srgb, var(--va-accent) 40%, var(--va-border));
	}

	.bulk-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.picker-grid {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.picker-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 10px;
		border: 1px solid var(--va-border);
		border-radius: 7px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		cursor: pointer;
		text-align: right;
		transition: background-color 0.15s, border-color 0.15s, color 0.15s;
	}

	.picker-item:hover {
		background: color-mix(in srgb, var(--va-accent) 6%, var(--va-bg-raised));
		border-color: color-mix(in srgb, var(--va-accent) 30%, var(--va-border));
		color: var(--va-text);
	}

	.picker-item.is-on {
		background: color-mix(in srgb, var(--va-accent) 10%, var(--va-bg-raised));
		border-color: color-mix(in srgb, var(--va-accent) 45%, var(--va-border));
		color: var(--va-text);
	}

	.picker-check {
		flex: 0 0 auto;
		width: 14px;
		height: 14px;
		border: 1.5px solid var(--va-border-strong);
		border-radius: 4px;
		display: grid;
		place-items: center;
		background: var(--va-bg-panel);
		transition: background-color 0.15s, border-color 0.15s;
	}

	.picker-item.is-on .picker-check {
		background: var(--va-accent);
		border-color: var(--va-accent);
		color: var(--va-bg);
	}

	.picker-check svg {
		width: 9px;
		height: 9px;
	}

	.picker-name {
		flex: 1;
		font-size: 12px;
		font-weight: 500;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.picker-meta {
		flex: 0 0 auto;
		color: var(--va-text-faint);
		font: 500 10px var(--va-font-mono);
		direction: ltr;
	}

	.picker-hint {
		margin: 0;
		color: var(--va-text-faint);
		font: 500 10.5px var(--va-font-mono);
		line-height: 1.5;
	}
</style>
