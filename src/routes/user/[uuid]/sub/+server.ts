import { buildUserSubscriptionResponse } from '$lib/server/subscription';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, url }) => {
	return buildUserSubscriptionResponse(
		params.uuid!,
		url.hostname,
		new URL(`/user/${params.uuid}`, url.origin).toString()
	);
};
