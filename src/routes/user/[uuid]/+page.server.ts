import type { PageServerLoad } from './$types';
import { loadUserPanel } from './user-panel.server';

export const load: PageServerLoad = async (event) => {
	return {
		initialUserPanel: await loadUserPanel(event)
	};
};
