<script lang="ts">
	import { formatPercent, formatTraffic } from '$lib/utils/format';

	let {
		usedBytes,
		totalBytes,
		remainingBytes,
		usageRatio
	}: {
		usedBytes: number;
		totalBytes: number | null;
		remainingBytes: number | null;
		usageRatio: number | null;
	} = $props();

	const widthClasses = [
		'w-[2%]',
		'w-[5%]',
		'w-[10%]',
		'w-[15%]',
		'w-[20%]',
		'w-[25%]',
		'w-[30%]',
		'w-[35%]',
		'w-[40%]',
		'w-[45%]',
		'w-1/2',
		'w-[55%]',
		'w-[60%]',
		'w-[65%]',
		'w-[70%]',
		'w-[75%]',
		'w-[80%]',
		'w-[85%]',
		'w-[90%]',
		'w-[95%]',
		'w-full'
	];

	function widthClass(ratio: number | null) {
		if (ratio === null) {
			return 'w-[38%]';
		}

		if (ratio <= 0) {
			return widthClasses[0];
		}

		const index = Math.min(Math.ceil(ratio * (widthClasses.length - 1)), widthClasses.length - 1);
		return widthClasses[index];
	}
</script>

<div class="ward-card-strong space-y-3 rounded-2xl p-4">
	<div class="flex items-center justify-between gap-3 text-sm ward-text-secondary">
		<span>مصرف</span>
		<span>{formatPercent(usageRatio)}</span>
	</div>

	<div class="ward-track h-2 overflow-hidden rounded-full">
		<div
			class={`h-full rounded-full bg-linear-to-r from-cyan-300 via-sky-400 to-emerald-300 ${widthClass(usageRatio)}`}
		></div>
	</div>

	<div class="grid grid-cols-3 gap-3 text-sm">
		<div>
			<p class="ward-text-faint">مصرف‌شده</p>
			<p class="mt-1 ward-text-primary">{formatTraffic(usedBytes)}</p>
		</div>

		<div>
			<p class="ward-text-faint">کل</p>
			<p class="mt-1 ward-text-primary">{formatTraffic(totalBytes)}</p>
		</div>

		<div>
			<p class="ward-text-faint">باقی‌مانده</p>
			<p class="mt-1 ward-text-primary">
				{formatTraffic(remainingBytes, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
			</p>
		</div>
	</div>
</div>
