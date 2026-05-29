<script lang="ts">
	/**
	 * Animated SVG bar chart with rounded tops, gradient fills,
	 * and a hover-driven tooltip — mirrors the "Employees Performance"
	 * chart in the HR Manager screenshot. Bars grow via scaleY from
	 * the baseline using transform-origin.
	 */

	type Bar = {
		label: string;
		value: number;
		tooltip?: string;
	};

	type Props = {
		bars: Bar[];
		height?: number;
		barWidth?: number;
		gap?: number;
		formatValue?: (value: number) => string;
		highlightIndex?: number | null;
	};

	let {
		bars,
		height = 220,
		barWidth = 28,
		gap = 18,
		formatValue = (value: number) => value.toLocaleString('fa-IR-u-nu-latn'),
		highlightIndex = null
	}: Props = $props();

	const maxValue = $derived(Math.max(1, ...bars.map((bar) => bar.value)));
	const innerPadding = 32;
	const totalWidth = $derived(Math.max(280, bars.length * (barWidth + gap) + innerPadding));
	const baselineY = $derived(height - 38);
	let hoverIndex = $state<number | null>(null);
	const activeIndex = $derived(hoverIndex ?? highlightIndex);
</script>

<div class="bar-wrap">
	<svg
		viewBox="0 0 {totalWidth} {height}"
		preserveAspectRatio="xMinYMid meet"
		width="100%"
		height={height}
		class="bar-svg"
	>
		<defs>
			<linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="var(--admin-accent)" stop-opacity="1" />
				<stop offset="100%" stop-color="var(--admin-accent-strong)" stop-opacity="0.62" />
			</linearGradient>
			<linearGradient id="bar-grad-active" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="#c4b5fd" stop-opacity="1" />
				<stop offset="100%" stop-color="var(--admin-accent)" stop-opacity="0.9" />
			</linearGradient>
		</defs>

		<!-- y baseline -->
		<line
			x1={innerPadding / 2}
			y1={baselineY}
			x2={totalWidth - innerPadding / 2}
			y2={baselineY}
			stroke="var(--admin-border)"
			stroke-dasharray="3 5"
		/>

		<!-- subtle gridlines -->
		{#each [0.25, 0.5, 0.75] as ratio (ratio)}
			<line
				x1={innerPadding / 2}
				y1={baselineY - (baselineY - 20) * ratio}
				x2={totalWidth - innerPadding / 2}
				y2={baselineY - (baselineY - 20) * ratio}
				stroke="var(--admin-border)"
				stroke-opacity="0.4"
				stroke-dasharray="2 6"
			/>
		{/each}

		{#each bars as bar, i (`${bar.label}-${i}`)}
			{@const ratio = bar.value / maxValue}
			{@const barHeight = Math.max(4, (baselineY - 20) * ratio)}
			{@const x = innerPadding / 2 + i * (barWidth + gap) + gap / 2}
			{@const y = baselineY - barHeight}
			{@const isActive = activeIndex === i}
			<g
				role="button"
				tabindex="0"
				onmouseenter={() => (hoverIndex = i)}
				onmouseleave={() => (hoverIndex = null)}
				onfocus={() => (hoverIndex = i)}
				onblur={() => (hoverIndex = null)}
				class="bar-group"
			>
				<rect
					x={x}
					y={y}
					width={barWidth}
					height={barHeight}
					rx="9"
					fill={isActive ? 'url(#bar-grad-active)' : 'url(#bar-grad)'}
					class="bar-rect"
					style="transform-origin: {x + barWidth / 2}px {baselineY}px; animation-delay: {i * 0.07}s;"
				/>
				<text
					x={x + barWidth / 2}
					y={baselineY + 22}
					text-anchor="middle"
					fill="var(--admin-text-faint)"
					font-size="11"
				>
					{bar.label}
				</text>
				{#if isActive}
					{@const tipWidth = 120}
					{@const tipX = Math.min(Math.max(x + barWidth / 2 - tipWidth / 2, 4), totalWidth - tipWidth - 4)}
					<g class="bar-tooltip" transform="translate({tipX} {y - 48})">
						<rect width={tipWidth} height="38" rx="8" fill="var(--admin-surface-strong)" stroke="var(--admin-border-strong)" />
						<text x={tipWidth / 2} y="15" text-anchor="middle" fill="var(--admin-text-muted)" font-size="10">
							{bar.label}
						</text>
						<text x={tipWidth / 2} y="30" text-anchor="middle" fill="var(--admin-text-strong)" font-size="13" font-weight="600">
							{bar.tooltip ?? formatValue(bar.value)}
						</text>
					</g>
				{/if}
			</g>
		{/each}
	</svg>
</div>

<style>
	.bar-wrap {
		width: 100%;
		overflow-x: auto;
	}
	.bar-svg {
		min-width: 100%;
		display: block;
	}
	.bar-rect {
		transform: scaleY(0);
		animation: bar-grow 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
	}
	@keyframes bar-grow {
		from { transform: scaleY(0); }
		to { transform: scaleY(1); }
	}
	.bar-group { cursor: pointer; outline: none; }
	.bar-tooltip { animation: admin-fade-in-up 0.2s ease forwards; }
	@media (prefers-reduced-motion: reduce) {
		.bar-rect { animation: none; transform: scaleY(1); }
	}
</style>
