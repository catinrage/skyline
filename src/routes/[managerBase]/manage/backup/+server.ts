import { isAdminAuthenticated, isHiddenManagerPathAllowed } from '$lib/server/admin';
import { databasePath } from '$lib/server/storage';
import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { RequestHandler } from './$types';

function backupFilename() {
	return `skyline-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.sqlite`;
}

export const GET: RequestHandler = async ({ cookies, params, url }) => {
	if (!(await isHiddenManagerPathAllowed(params.managerBase))) {
		error(404, 'Not found');
	}

	if (!(await isAdminAuthenticated(cookies))) {
		return new Response('Unauthorized', { status: 401 });
	}

	const selected = url.searchParams.get('file');
	const fileName = selected && /^[\w.-]+\.sqlite$/.test(selected) ? basename(selected) : backupFilename();
	const path = selected ? join(dirname(databasePath), 'backups', fileName) : databasePath;
	const file = await readFile(path).catch(() => error(404, 'Backup not found'));

	return new Response(file, {
		headers: {
			'content-type': 'application/vnd.sqlite3',
			'content-disposition': `attachment; filename="${fileName}"`,
			'cache-control': 'no-store'
		}
	});
};
