import type { RequestEvent } from '@sveltejs/kit';

export function getSafeClientAddress(
	event: Pick<RequestEvent, 'getClientAddress' | 'request'>
): string {
	try {
		return event.getClientAddress();
	} catch {
		const forwardedFor = event.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
		const proxyAddress =
			forwardedFor ||
			event.request.headers.get('cf-connecting-ip')?.trim() ||
			event.request.headers.get('x-real-ip')?.trim();

		return proxyAddress || 'unknown';
	}
}
