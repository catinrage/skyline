import type { ParamMatcher } from '@sveltejs/kit';

export const manageTabIds = [
	'traffic',
	'create',
	'message',
	'client-apps',
	'vless-rewrite',
	'settings',
	'security',
	'resellers',
	'groups',
	'plans',
	'credit-requests',
	'templates',
	'backups',
	'passkey',
	'features',
	'reports'
] as const;

export type ManageTabId = (typeof manageTabIds)[number];

export const match: ParamMatcher = (param) => {
	return (manageTabIds as readonly string[]).includes(param);
};
