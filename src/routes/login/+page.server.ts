import { getPanelPathSettings, getSharedPanelBasePath } from '$lib/server/admin';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const settings = await getPanelPathSettings();
	const sharedBasePath = getSharedPanelBasePath(settings);

	if (sharedBasePath) {
		const target = new URL(`/${sharedBasePath}/login`, url);
		url.searchParams.forEach((value, key) => target.searchParams.set(key, value));
		throw redirect(302, target.pathname + target.search);
	}

	return {
		basePath: '',
		showForgotPassword: url.searchParams.get('panel') === 'reseller'
	};
};
