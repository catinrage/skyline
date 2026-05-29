import { json } from '@sveltejs/kit';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { isAdminAuthenticated } from './admin';
import type { Cookies } from '@sveltejs/kit';

export const CLIENT_APP_MAX_MB = 200;
export const CLIENT_APP_MAX_BYTES = CLIENT_APP_MAX_MB * 1024 * 1024;
export const clientAppsUploadDir = resolve(process.cwd(), 'data', 'client-apps');

/** Strip characters unsafe in file names and URLs, collapse runs of underscores. */
export function sanitizeFilename(name: string): string {
	return (
		name
			.replace(/[^a-zA-Z0-9._-]/g, '_')
			.replace(/_{2,}/g, '_')
			.replace(/^[._-]+/, '')
			.slice(0, 80) || 'app'
	);
}

/** Shared handler used by both the default and hidden-path upload endpoints. */
export async function handleClientAppUpload(cookies: Cookies, request: Request): Promise<Response> {
	if (!(await isAdminAuthenticated(cookies))) {
		return new Response('Unauthorized', { status: 401 });
	}

	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return json({ error: 'درخواست نامعتبر است.' }, { status: 400 });
	}

	const file = formData.get('file');

	if (!(file instanceof File) || file.size === 0) {
		return json({ error: 'فایل معتبر ارسال نشده.' }, { status: 400 });
	}

	if (file.size > CLIENT_APP_MAX_BYTES) {
		return json({ error: `حجم فایل بیشتر از ${CLIENT_APP_MAX_MB} MB است.` }, { status: 400 });
	}

	await mkdir(clientAppsUploadDir, { recursive: true });

	const id = randomBytes(8).toString('hex');
	const safeName = sanitizeFilename(file.name || 'app');
	const fileName = `${id}-${safeName}`;
	const filePath = resolve(clientAppsUploadDir, fileName);

	await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

	return json({ fileName, relativeUrl: `/app-downloads/${fileName}` });
}
