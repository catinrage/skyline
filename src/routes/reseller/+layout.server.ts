import { isDefaultResellerPathAllowed } from '$lib/server/admin';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	if (!(await isDefaultResellerPathAllowed())) {
		error(404, 'Not found');
	}

	return {};
};
