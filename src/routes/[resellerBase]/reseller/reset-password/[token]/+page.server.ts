import { isHiddenResellerPathAllowed } from '$lib/server/admin';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	if (!(await isHiddenResellerPathAllowed(params.resellerBase))) {
		error(404, 'Not found');
	}

	return {};
};
