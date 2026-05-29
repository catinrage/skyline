import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

/**
 * Pure, side-effect-free helpers shared by the sky CLI.
 *
 * Kept in their own module (no process/argv/IO) so they can be unit tested
 * without executing the CLI entrypoint.
 */

export const reservedPanelBasePaths = new Set([
	'api',
	'build',
	'healthz',
	'manage',
	'manager',
	'reseller',
	'robots.txt',
	'user',
	'_app'
]);

export function nowSeconds() {
	return Math.floor(Date.now() / 1000);
}

export function normalizeUsername(value) {
	return String(value ?? '')
		.trim()
		.toLowerCase();
}

export function normalizePanelBasePath(value) {
	return String(value ?? '')
		.trim()
		.replace(/^\/+|\/+$/g, '')
		.toLowerCase();
}

export function validatePanelBasePath(value) {
	const normalized = normalizePanelBasePath(value);
	if (!normalized) return '';
	if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(normalized)) {
		throw new Error(
			'Panel path must be 3-64 chars and contain only lowercase letters, numbers, hyphen, or underscore.'
		);
	}
	if (reservedPanelBasePaths.has(normalized)) {
		throw new Error(`Panel path "${normalized}" is reserved by Skyline.`);
	}
	return normalized;
}

export async function hashSecret(value) {
	const salt = randomBytes(16);
	const derivedKey = await scrypt(value, salt, 64);
	return `scrypt$${salt.toString('base64')}$${derivedKey.toString('base64')}`;
}
