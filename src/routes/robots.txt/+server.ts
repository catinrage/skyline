import type { RequestHandler } from './$types';

const body = ['User-agent: *', 'Disallow: /'].join('\n');

export const GET: RequestHandler = () => {
	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
};
