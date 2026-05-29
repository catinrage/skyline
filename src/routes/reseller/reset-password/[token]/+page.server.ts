import { isDefaultResellerPathAllowed } from '$lib/server/admin';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	if (!(await isDefaultResellerPathAllowed())) {
		error(404, 'Not found');
	}

	return {};
};
