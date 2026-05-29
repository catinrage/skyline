import { error } from '@sveltejs/kit';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { clientAppsUploadDir } from '$lib/server/client-app-upload';
import type { RequestHandler } from './$types';

/** Maps common VPN client app extensions to MIME types. */
const CONTENT_TYPES: Record<string, string> = {
	apk: 'application/vnd.android.package-archive',
	ipa: 'application/octet-stream',
	exe: 'application/vnd.microsoft.portable-executable',
	dmg: 'application/x-apple-diskimage',
	pkg: 'application/octet-stream',
	deb: 'application/vnd.debian.binary-package',
	rpm: 'application/x-rpm',
	appimage: 'application/x-executable'
};

export const GET: RequestHandler = async ({ params }) => {
	const { filename } = params;

	// Block path traversal: only allow the sanitized characters used during upload
	if (!filename || !/^[a-zA-Z0-9._-]+$/.test(filename)) {
		error(404, 'Not found');
	}

	const filePath = resolve(clientAppsUploadDir, filename);

	// Ensure the resolved path is still inside the upload directory
	if (!filePath.startsWith(clientAppsUploadDir)) {
		error(404, 'Not found');
	}

	try {
		await stat(filePath);
	} catch {
		error(404, 'File not found');
	}

	const file = await readFile(filePath);
	const ext = filename.split('.').pop()?.toLowerCase() ?? '';
	const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';

	// Strip the 16-char hex prefix + dash to recover the original filename
	const displayName = /^[0-9a-f]{16}-/.test(filename) ? filename.slice(17) : filename;

	return new Response(file, {
		headers: {
			'content-type': contentType,
			'content-disposition': `attachment; filename="${displayName}"`,
			'cache-control': 'public, max-age=31536000, immutable'
		}
	});
};
