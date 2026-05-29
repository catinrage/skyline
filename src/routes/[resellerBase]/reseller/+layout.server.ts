import { isHiddenResellerPathAllowed } from '$lib/server/admin';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params }) => {
	if (!(await isHiddenResellerPathAllowed(params.resellerBase))) {
		error(404, 'Not found');
	}

	return {};
};
