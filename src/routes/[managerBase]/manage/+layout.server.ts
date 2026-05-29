import { isHiddenManagerPathAllowed } from '$lib/server/admin';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
	if (!(await isHiddenManagerPathAllowed(params.managerBase))) {
		throw error(404, 'Not found');
	}
}
