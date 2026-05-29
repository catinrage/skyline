import { isDefaultManagerPathAllowed } from '$lib/server/admin';
import { handleClientAppUpload } from '$lib/server/client-app-upload';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, request }) => {
	if (!(await isDefaultManagerPathAllowed())) {
		error(404, 'Not found');
	}

	return handleClientAppUpload(cookies, request);
};
