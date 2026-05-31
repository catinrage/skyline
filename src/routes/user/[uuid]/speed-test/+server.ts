import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	checkLatencyTestCooldown,
	getFeatureSettings,
	isFeatureEnabled,
	recordLatencyTest
} from '$lib/server/admin';
import { logger } from '$lib/server/logger';
import { measureProxyDownloadSpeedSample } from '$lib/server/proxy-ping';
import { getVpnClient } from '$lib/server/xui';

const speedStreamLogger = logger.child('user-speed-stream');
const sampleSeconds = 10;
const encoder = new TextEncoder();

type SpeedStreamEvent =
	| {
			type: 'progress';
			downloadMbps: number;
			downloadedBytes: number;
			durationSeconds: number;
	  }
	| {
			type: 'complete';
			downloadMbps: number;
			downloadedBytes: number;
			durationSeconds: number;
			speedSuccess: string;
	  }
	| { type: 'error'; speedError: string };

function streamEvent(
	controller: ReadableStreamDefaultController<Uint8Array>,
	event: SpeedStreamEvent
) {
	controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
}

export const POST: RequestHandler = async ({ params, request, url }) => {
	const uuid = params.uuid;

	if (!(await isFeatureEnabled('speed_test_widget'))) {
		return json({ speedError: 'تست سرعت در حال حاضر غیرفعال است.' }, { status: 403 });
	}

	const cooldown = await checkLatencyTestCooldown(`${uuid}:speed`, 30);

	if (!cooldown.allowed) {
		return json(
			{
				speedError: `تست سرعت موقتاً محدود شده است. ${cooldown.retryAfter} ثانیه دیگر دوباره تلاش کنید.`
			},
			{ status: 429 }
		);
	}

	const client = await getVpnClient(uuid, url.hostname);

	if (!client?.configUrl) {
		return json(
			{ speedError: 'برای این کاربر لینک اتصال قابل تست در دسترس نیست.' },
			{ status: 404 }
		);
	}

	if (client.status !== 'active') {
		return json({ speedError: 'تست سرعت فقط برای کانفیگ فعال در دسترس است.' }, { status: 409 });
	}

	const configUrl = client.configUrl;
	const featureSettings = await getFeatureSettings();

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				const result = await measureProxyDownloadSpeedSample(
					configUrl,
					featureSettings.speedTestTargetUrl,
					{
						sampleSeconds,
						signal: request.signal,
						onProgress: (progress) => {
							streamEvent(controller, { type: 'progress', ...progress });
						}
					}
				);

				await recordLatencyTest(`${uuid}:speed`);
				streamEvent(controller, {
					type: 'complete',
					speedSuccess: 'تست سرعت با موفقیت انجام شد.',
					downloadMbps: result.downloadMbps,
					downloadedBytes: result.downloadedBytes,
					durationSeconds: result.durationSeconds
				});
			} catch (error) {
				speedStreamLogger.error('Streaming speed test failed.', {
					uuid,
					error: error instanceof Error ? error : undefined
				});
				streamEvent(controller, {
					type: 'error',
					speedError: error instanceof Error ? error.message : 'تست سرعت انجام نشد.'
				});
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'cache-control': 'no-store',
			'content-type': 'application/x-ndjson; charset=utf-8'
		}
	});
};
