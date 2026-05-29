import { createClient, type Client, type InArgs, type Row } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const databasePath = resolve(process.cwd(), 'data', 'skyline.sqlite');
const databaseUrl = pathToFileURL(databasePath).href;
const scrypt = promisify(scryptCallback);

let db: Client | null = null;

mkdirSync(dirname(databasePath), { recursive: true });

export async function getDatabase() {
	if (!db) {
		db = createClient({
			url: databaseUrl,
			intMode: 'number'
		});
	}

	return db;
}

export async function execute(sql: string, args?: InArgs) {
	const database = await getDatabase();
	return database.execute(args ? { sql, args } : sql);
}

export async function queryFirst<T extends Row>(sql: string, args?: InArgs) {
	const result = await execute(sql, args);
	return (result.rows[0] as T | undefined) ?? null;
}

export async function queryAll<T extends Row>(sql: string, args?: InArgs) {
	const result = await execute(sql, args);
	return result.rows as T[];
}

export async function run(sql: string, args?: InArgs) {
	await execute(sql, args);
}

export async function executeMultiple(sql: string) {
	const database = await getDatabase();
	await database.executeMultiple(sql);
}

export function closeDatabase() {
	if (db) {
		db.close();
		db = null;
	}
}

export async function hashSecret(value: string) {
	const salt = randomBytes(16);
	const derivedKey = (await scrypt(value, salt, 64)) as Buffer;

	return `scrypt$${salt.toString('base64')}$${derivedKey.toString('base64')}`;
}

export async function verifySecret(value: string, hash: string) {
	const [algorithm, saltBase64, keyBase64] = hash.split('$');

	if (algorithm !== 'scrypt' || !saltBase64 || !keyBase64) {
		return false;
	}

	const salt = Buffer.from(saltBase64, 'base64');
	const storedKey = Buffer.from(keyBase64, 'base64');
	const derivedKey = (await scrypt(value, salt, storedKey.length)) as Buffer;

	return timingSafeEqual(storedKey, derivedKey);
}

export { databasePath, databaseUrl };
