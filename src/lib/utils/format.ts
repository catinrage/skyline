const latinDigitsLocale = 'fa-IR-u-nu-latn';
const kilobyte = 1024;
const megabyte = kilobyte ** 2;
const gigabyte = kilobyte ** 3;

const gbFormatter = new Intl.NumberFormat(latinDigitsLocale, {
	maximumFractionDigits: 2,
	minimumFractionDigits: 0
});

const compactFormatter = new Intl.NumberFormat(latinDigitsLocale, {
	notation: 'compact',
	maximumFractionDigits: 1
});

const dateFormatter = new Intl.DateTimeFormat(latinDigitsLocale, {
	dateStyle: 'medium',
	timeStyle: 'short'
});

const relativeFormatter = new Intl.RelativeTimeFormat(latinDigitsLocale, {
	numeric: 'auto'
});

interface TrafficFormatOptions {
	minimumFractionDigits?: number;
	maximumFractionDigits?: number;
}

function getTrafficFormatter(options?: TrafficFormatOptions) {
	return new Intl.NumberFormat(latinDigitsLocale, {
		minimumFractionDigits: options?.minimumFractionDigits ?? 0,
		maximumFractionDigits: options?.maximumFractionDigits ?? 2
	});
}

export function formatTraffic(bytes: number | null, options?: TrafficFormatOptions): string {
	if (bytes === null) {
		return 'نامحدود';
	}

	if (Math.abs(bytes) >= gigabyte) {
		return `${getTrafficFormatter(options).format(bytes / gigabyte)} GB`;
	}

	if (Math.abs(bytes) >= megabyte) {
		return `${getTrafficFormatter(options).format(bytes / megabyte)} MB`;
	}

	return `${getTrafficFormatter(options).format(bytes / kilobyte)} KB`;
}

export function formatCompactBytes(bytes: number): string {
	return compactFormatter.format(bytes / gigabyte);
}

export function formatPercent(ratio: number | null): string {
	if (ratio === null) {
		return 'نامحدود';
	}

	return `${gbFormatter.format(Math.round(ratio * 100))}%`;
}

export function formatExpiry(expiresAt: string | null): string {
	if (!expiresAt) {
		return 'بدون انقضا';
	}

	return dateFormatter.format(new Date(expiresAt));
}

export function formatRelativeExpiry(expiresAt: string | null): string {
	if (!expiresAt) {
		return 'بدون انقضا';
	}

	const deltaMs = new Date(expiresAt).getTime() - Date.now();
	const deltaHours = Math.round(deltaMs / (1000 * 60 * 60));

	if (Math.abs(deltaHours) < 24) {
		return relativeFormatter.format(deltaHours, 'hour');
	}

	return relativeFormatter.format(Math.round(deltaHours / 24), 'day');
}

export function shortenUuid(value: string): string {
	if (value.length <= 18) {
		return value;
	}

	return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

export function formatToman(value: number): string {
	return `${gbFormatter.format(value)} تومان`;
}
