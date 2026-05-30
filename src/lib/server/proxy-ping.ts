import { createTemporaryProxySession, runProxyCurlRequest } from '$lib/server/xray-proxy';
import { logger } from '$lib/server/logger';

const defaultProbeTargetUrl = 'https://cloudflare.com/cdn-cgi/trace';
const measuredRequestCount = 5;
const proxyPingLogger = logger.child('proxy-ping');

function curlError(curlStderr: string, xrayStderr: string, fallback: string) {
	const parts: string[] = [];
	if (curlStderr.trim()) parts.push(curlStderr.trim());
	if (xrayStderr.trim()) parts.push(`xray: ${xrayStderr.trim()}`);
	return parts.join(' | ') || fallback;
}

function parseCurlResult(statusCode: string, timeTotal: string, stderr: string) {
	const status = Number(statusCode);

	if (!Number.isInteger(status) || status < 200 || status >= 400) {
		throw new Error(stderr.trim() || `پاسخ نامعتبر از مقصد تست دریافت شد: ${statusCode}`);
	}

	const latencyMs = Math.round(Number(timeTotal) * 1000);

	if (!Number.isFinite(latencyMs)) {
		throw new Error('زمان اندازه‌گیری‌شده معتبر نیست.');
	}

	return latencyMs;
}

function assertSuccessfulHttp(statusCode: string, stderr: string) {
	const status = Number(statusCode);

	if (!Number.isInteger(status) || status < 200 || status >= 400) {
		throw new Error(stderr.trim() || `پاسخ نامعتبر از مقصد تست دریافت شد: ${statusCode}`);
	}
}

function calculateDisplayedLatency(values: number[]) {
	const minimum = Math.min(...values);
	return Math.max(Math.round(minimum / 2), 1);
}

export async function measureProxyLatency(configUrl: string, targetUrl = defaultProbeTargetUrl) {
	let session: Awaited<ReturnType<typeof createTemporaryProxySession>> | null = null;
	proxyPingLogger.debug('Starting proxy latency measurement.', {
		target: targetUrl,
		measuredRequestCount
	});

	try {
		session = await createTemporaryProxySession(configUrl);
		const warmupResult = await runProxyCurlRequest(session.socksPort, targetUrl, {
			output: 'discard'
		});

		if (warmupResult.exitCode !== 0) {
			throw new Error(curlError(warmupResult.stderr, session.getStderr(), 'درخواست اولیه تست تاخیر از داخل پراکسی انجام نشد.'));
		}

		parseCurlResult(warmupResult.statusCode, warmupResult.timeTotal, warmupResult.stderr);

		const samples: number[] = [];

		for (let index = 0; index < measuredRequestCount; index += 1) {
			const result = await runProxyCurlRequest(session.socksPort, targetUrl, {
				output: 'discard'
			});

			if (result.exitCode !== 0) {
				throw new Error(curlError(result.stderr, session.getStderr(), 'درخواست تست تاخیر از داخل پراکسی انجام نشد.'));
			}

			samples.push(parseCurlResult(result.statusCode, result.timeTotal, result.stderr));
		}

		const latencyMs = calculateDisplayedLatency(samples);
		proxyPingLogger.debug('Proxy latency measurement completed.', {
			target: targetUrl,
			samples,
			latencyMs
		});

		return {
			latencyMs,
			samples,
			target: targetUrl
		};
	} finally {
		if (session) {
			await session.cleanup();
		}
	}
}

export async function measureProxyDownloadSpeed(configUrl: string, targetUrl: string) {
	let session: Awaited<ReturnType<typeof createTemporaryProxySession>> | null = null;
	proxyPingLogger.debug('Starting proxy download speed measurement.', { target: targetUrl });

	try {
		session = await createTemporaryProxySession(configUrl);
		const result = await runProxyCurlRequest(session.socksPort, targetUrl, {
			output: 'discard',
			maxTimeSeconds: 90
		});

		if (result.exitCode !== 0) {
			throw new Error(curlError(result.stderr, session.getStderr(), 'درخواست تست سرعت از داخل پراکسی انجام نشد.'));
		}

		assertSuccessfulHttp(result.statusCode, result.stderr);
		const durationSeconds = Number(result.timeTotal);
		const downloadedBytes = Number(result.sizeDownload);

		if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(downloadedBytes)) {
			throw new Error('نتیجه تست سرعت معتبر نیست.');
		}

		const downloadMbps = Number(((downloadedBytes * 8) / durationSeconds / 1_000_000).toFixed(2));
		proxyPingLogger.debug('Proxy download speed measurement completed.', {
			target: targetUrl,
			downloadedBytes,
			durationSeconds,
			downloadMbps
		});

		return {
			downloadMbps,
			downloadedBytes,
			durationSeconds,
			target: targetUrl
		};
	} finally {
		if (session) {
			await session.cleanup();
		}
	}
}
