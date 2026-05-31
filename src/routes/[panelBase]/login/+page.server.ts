import { error } from '@sveltejs/kit';
import {
	getPanelPathSettings,
	isHiddenPanelLoginPathAllowed,
	normalizePanelBasePath
} from '$lib/server/admin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	if (!(await isHiddenPanelLoginPathAllowed(params.panelBase))) {
		error(404, 'Not found');
	}

	const settings = await getPanelPathSettings();
	const panelBase = normalizePanelBasePath(params.panelBase);

	return {
		basePath: `/${panelBase}`,
		showForgotPassword: settings.resellerBasePath === panelBase
	};
};
