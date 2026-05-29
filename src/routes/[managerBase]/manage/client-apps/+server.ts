import { isHiddenManagerPathAllowed } from '$lib/server/admin';
import { handleClientAppUpload } from '$lib/server/client-app-upload';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, request, params }) => {
	if (!(await isHiddenManagerPathAllowed(params.managerBase))) {
		error(404, 'Not found');
	}

	return handleClientAppUpload(cookies, request);
};
