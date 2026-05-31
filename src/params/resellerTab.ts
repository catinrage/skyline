import type { ParamMatcher } from '@sveltejs/kit';

export const resellerTabIds = [
	'overview',
	'create',
	'configs',
	'telegram',
	'tickets',
	'message',
	'finance',
	'security',
	'sub-resellers'
] as const;

export type ResellerTabId = (typeof resellerTabIds)[number];

export const match: ParamMatcher = (param) => {
	return (resellerTabIds as readonly string[]).includes(param);
};
