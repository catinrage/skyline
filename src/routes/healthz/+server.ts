import { execute } from '$lib/server/storage';
import { checkXuiHealth } from '$lib/server/xui';
import { checkXrayBinaryHealth } from '$lib/server/xray-proxy';
import { json } from '@sveltejs/kit';

type HealthCheck = {
	ok: boolean;
	label: string;
	message: string;
	meta?: Record<string, boolean | number | string | null>;
};

async function checkSqlite(): Promise<HealthCheck> {
	try {
		await execute('SELECT 1');
		return {
			ok: true,
			label: 'sqlite',
			message: 'Skyline SQLite database is reachable.'
		};
	} catch {
		return {
			ok: false,
			label: 'sqlite',
			message: 'Skyline SQLite database check failed.'
		};
	}
}

export async function GET() {
	const startedAt = Date.now();
	const [sqlite, xui, xray] = await Promise.all([
		checkSqlite(),
		checkXuiHealth(),
		checkXrayBinaryHealth()
	]);

	const checks: HealthCheck[] = [
		{
			ok: true,
			label: 'app',
			message: 'Skyline server is running.',
			meta: {
				nodeEnv: process.env.NODE_ENV ?? null
			}
		},
		sqlite,
		{
			ok: xui.envConfigured && xui.panelUrlValid && xui.tokenConfigured,
			label: 'xui_config',
			message: xui.envConfigured
				? 'x-ui runtime settings are configured.'
				: 'x-ui runtime settings are missing.',
			meta: {
				envConfigured: xui.envConfigured,
				panelUrlValid: xui.panelUrlValid,
				tokenConfigured: xui.tokenConfigured,
				panelScheme: xui.panelScheme,
				panelHostKind: xui.panelHostKind,
				panelPortConfigured: xui.panelPortConfigured,
				errorName: xui.errorName,
				errorCauseCode: xui.errorCauseCode
			}
		},
		{
			ok: xui.reachable,
			label: 'xui_reachable',
			message: xui.reachable ? 'x-ui API responded to Skyline.' : xui.message,
			meta: {
				httpStatus: xui.httpStatus,
				panelScheme: xui.panelScheme,
				panelHostKind: xui.panelHostKind,
				panelPortConfigured: xui.panelPortConfigured,
				errorName: xui.errorName,
				errorCauseCode: xui.errorCauseCode
			}
		},
		{
			ok: xui.tokenValid === true,
			label: 'xui_token',
			message:
				xui.tokenValid === true
					? 'x-ui API token was accepted.'
					: xui.tokenValid === false
						? 'x-ui API token was rejected.'
						: 'x-ui API token could not be validated because the API was unreachable.',
			meta: {
				httpStatus: xui.httpStatus
			}
		},
		{
			ok: xui.apiOk,
			label: 'xui_api',
			message: xui.message,
			meta: {
				httpStatus: xui.httpStatus
			}
		},
		{
			ok: xray.ok,
			label: 'xray_binary',
			message: xray.message,
			meta: {
				pathConfigured: Boolean(xray.path),
				errorName: xray.errorName
			}
		}
	];

	const ok = checks.every((check) => check.ok);

	return json(
		{
			ok,
			timestamp: new Date().toISOString(),
			durationMs: Date.now() - startedAt,
			checks
		},
		{
			status: ok ? 200 : 503,
			headers: {
				'cache-control': 'no-store'
			}
		}
	);
}
