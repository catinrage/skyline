<script lang="ts">
	/**
	 * Animated donut chart. Mirrors the HR Manager screenshot's
	 * attendance donut — segments with a soft glow + a centered KPI.
	 *
	 * Pass `segments` (label/value/color) and an optional `centerValue`
	 * + `centerLabel`. The arcs draw on mount via stroke-dashoffset.
	 */

	type Segment = {
		label: string;
		value: number;
		color: string;
	};

	type Props = {
		segments: Segment[];
		size?: number;
		stroke?: number;
		centerValue?: string;
		centerLabel?: string;
		legend?: boolean;
	};

	let {
		segments,
		size = 220,
		stroke = 22,
		centerValue,
		centerLabel,
		legend = true
	}: Props = $props();

	const radius = $derived((size - stroke) / 2);
	const circumference = $derived(2 * Math.PI * radius);
	const total = $derived(segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0));
	const arcs = $derived.by(() => {
		if (total <= 0) {
			return [];
		}
		let cursor = 0;
		return segments.map((segment, index) => {
			const ratio = Math.max(0, segment.value) / total;
			const dash = ratio * circumference;
			const gap = circumference - dash;
			const offset = -cursor;
			cursor += dash;
			return {
				...segment,
				index,
				ratio,
				dash,
				gap,
				offset,
				key: `${segment.label}-${index}`
			};
		});
	});
</script>

<div class="donut-wrap" style="--donut-size: {size}px;">
	<svg viewBox="0 0 {size} {size}" width={size} height={size} class="donut-svg">
		<defs>
			<filter id="donut-glow" x="-20%" y="-20%" width="140%" height="140%">
				<feGaussianBlur stdDeviation="2.4" result="b" />
				<feMerge>
					<feMergeNode in="b" />
					<feMergeNode in="SourceGraphic" />
				</feMerge>
			</filter>
		</defs>

		<!-- track -->
		<circle
			cx={size / 2}
			cy={size / 2}
			r={radius}
			fill="none"
			stroke="var(--admin-surface-soft)"
			stroke-width={stroke}
		/>

		{#if total <= 0}
			<text
				x={size / 2}
				y={size / 2}
				text-anchor="middle"
				dominant-baseline="middle"
				fill="var(--admin-text-faint)"
				font-size="12"
			>
				بدون داده
			</text>
		{:else}
			{#each arcs as arc (arc.key)}
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					stroke={arc.color}
					stroke-width={stroke}
					stroke-linecap="round"
					stroke-dasharray="{arc.dash} {arc.gap}"
					stroke-dashoffset={arc.offset}
					filter="url(#donut-glow)"
					transform="rotate(-90 {size / 2} {size / 2})"
					class="donut-arc"
					style="--arc-len: {arc.dash}; --arc-delay: {arc.index * 0.12}s;"
				/>
			{/each}
		{/if}

		{#if centerValue}
			<text
				x={size / 2}
				y={size / 2 - 4}
				text-anchor="middle"
				dominant-baseline="middle"
				fill="var(--admin-text-strong)"
				font-size="22"
				font-weight="700"
				class="donut-center-value"
			>
				{centerValue}
			</text>
		{/if}
		{#if centerLabel}
			<text
				x={size / 2}
				y={size / 2 + 20}
				text-anchor="middle"
				dominant-baseline="middle"
				fill="var(--admin-text-muted)"
				font-size="11"
			>
				{centerLabel}
			</text>
		{/if}
	</svg>

	{#if legend}
		<div class="donut-legend">
			{#each segments as segment, i (`${segment.label}-${i}`)}
				<div class="donut-legend-row">
					<span class="donut-legend-dot" style="background: {segment.color}"></span>
					<span class="donut-legend-label">{segment.label}</span>
					<span class="donut-legend-value">{segment.value.toLocaleString('fa-IR-u-nu-latn')}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.donut-wrap {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		flex-wrap: wrap;
	}
	.donut-svg { flex-shrink: 0; }
	.donut-arc {
		transform-origin: center;
		stroke-dasharray: 0 999;
		animation: donut-grow 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards;
		animation-delay: var(--arc-delay);
		opacity: 0.95;
	}
	@keyframes donut-grow {
		from { stroke-dasharray: 0 999; }
		to { stroke-dasharray: var(--arc-len) 999; }
	}
	.donut-legend {
		display: grid;
		gap: 0.55rem;
		min-width: 0;
		flex: 1;
	}
	.donut-legend-row {
		display: grid;
		grid-template-columns: 12px 1fr auto;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.82rem;
		color: var(--admin-text-muted);
		padding: 0.45rem 0.65rem;
		border-radius: 0.8rem;
		border: 1px solid var(--admin-border);
		background: var(--admin-surface-soft);
	}
	.donut-legend-dot {
		width: 10px; height: 10px; border-radius: 9999px;
		box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 18%, transparent);
	}
	.donut-legend-label { color: var(--admin-text); font-weight: 500; }
	.donut-legend-value { color: var(--admin-text-strong); font-weight: 600; font-variant-numeric: tabular-nums; }
	.donut-center-value { animation: admin-fade-in-up 0.7s ease 0.5s both; }
	@media (prefers-reduced-motion: reduce) {
		.donut-arc { animation: none; stroke-dasharray: var(--arc-len) 999; }
		.donut-center-value { animation: none; }
	}
</style>
