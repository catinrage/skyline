#!/usr/bin/env node

import { createClient } from '@libsql/client';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';

const scrypt = promisify(scryptCallback);
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const serviceName = process.env.SKYLINE_SERVICE || 'skyline';

loadEnv(resolve(projectRoot, '.env'));

const databasePath = process.env.DATABASE_PATH ?? resolve(projectRoot, 'data', 'skyline.sqlite');
const databaseUrl = pathToFileURL(databasePath).href;
const reservedPanelBasePaths = new Set([
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

function loadEnv(path) {
	if (!existsSync(path)) return;

	const envContent = readFileSync(path, 'utf8');
	for (const line of envContent.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

		const eq = trimmed.indexOf('=');
		const key = trimmed.slice(0, eq).trim();
		const value = trimmed
			.slice(eq + 1)
			.trim()
			.replace(/^["']|["']$/g, '');
		if (!process.env[key]) process.env[key] = value;
	}
}

function getDb() {
	return createClient({ url: databaseUrl, intMode: 'number' });
}

async function ensureAdminTables(db) {
	await db.executeMultiple(`
		CREATE TABLE IF NOT EXISTS admin_settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS admin_sessions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			token_hash TEXT NOT NULL UNIQUE,
			expires_at INTEGER NOT NULL
		);
	`);
}

async function hashSecret(value) {
	const salt = randomBytes(16);
	const derivedKey = await scrypt(value, salt, 64);
	return `scrypt$${salt.toString('base64')}$${derivedKey.toString('base64')}`;
}

function nowSeconds() {
	return Math.floor(Date.now() / 1000);
}

function col(value, width = 20) {
	const str = String(value ?? '');
	return str.length > width ? `${str.slice(0, width - 1)}.` : str.padEnd(width);
}

function normalizeUsername(value) {
	return String(value ?? '')
		.trim()
		.toLowerCase();
}

function normalizePanelBasePath(value) {
	return String(value ?? '')
		.trim()
		.replace(/^\/+|\/+$/g, '')
		.toLowerCase();
}

function validatePanelBasePath(value) {
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

function requireArg(value, usage) {
	if (value) return value;
	throw new Error(`Usage: ${usage}`);
}

function printHelp() {
	console.log(`Skyline server manager

Usage:
  sky                              Open interactive menu
  sky help                         Show this help
  sky version                      Show installed Skyline version

Service:
  sky status                       Show systemd status
  sky start                        Start Skyline service
  sky stop                         Stop Skyline service
  sky restart                      Restart Skyline service
  sky logs                         Follow Skyline service logs
  sky enable                       Enable service at boot
  sky disable                      Disable service at boot
  sky update                       Pull, install, build, restart
  sky service <command>            Same commands under service namespace

Admin:
  sky admin show
  sky admin username <username>
  sky admin password [password]
  sky admin reset <username> [password]

Panel paths:
  sky paths show
  sky paths set <manager-base> <reseller-base>
  sky paths clear

Resellers:
  sky resellers list
  sky resellers create <username> [password]
  sky resellers password <id> [password]
  sky resellers reset-password <id> [password]
  sky resellers activate <id>
  sky resellers deactivate <id>

Database:
  sky db path
  sky db integrity

Environment:
  DATABASE_PATH      Override SQLite path. Default: ${databasePath}
  SKYLINE_SERVICE   Override systemd service name. Default: ${serviceName}`);
}

function runCommand(command, args, options = {}) {
	const result = spawnSync(command, args, { stdio: 'inherit', ...options });
	if (result.error) throw result.error;
	if (typeof result.status === 'number' && result.status !== 0) process.exit(result.status);
}

function systemctl(args) {
	runCommand('systemctl', args);
}

function journalctl() {
	runCommand('journalctl', ['-u', serviceName, '-f', '-n', '100']);
}

async function prompt(question) {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	try {
		return (await rl.question(question)).trim();
	} finally {
		rl.close();
	}
}

async function promptSecret(question) {
	if (!process.stdin.isTTY || !process.stdout.isTTY) return prompt(question);

	return await new Promise((resolveValue) => {
		let value = '';
		const stdin = process.stdin;
		const stdout = process.stdout;

		function cleanup() {
			stdin.setRawMode(false);
			stdin.pause();
			stdin.off('data', onData);
		}

		function onData(chunk) {
			const char = String(chunk);
			if (char === '\u0003') {
				cleanup();
				stdout.write('\n');
				process.exit(130);
			}
			if (char === '\r' || char === '\n') {
				cleanup();
				stdout.write('\n');
				resolveValue(value);
				return;
			}
			if (char === '\u007f') {
				if (value.length > 0) value = value.slice(0, -1);
				return;
			}
			value += char;
			stdout.write('*');
		}

		stdout.write(question);
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding('utf8');
		stdin.on('data', onData);
	});
}

async function setSetting(db, key, value) {
	await ensureAdminTables(db);
	await db.execute({
		sql: `INSERT INTO admin_settings (key, value)
		      VALUES (?, ?)
		      ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		args: [key, value]
	});
}

async function getSetting(db, key) {
	await ensureAdminTables(db);
	const result = await db.execute({
		sql: 'SELECT value FROM admin_settings WHERE key = ? LIMIT 1',
		args: [key]
	});
	return result.rows[0]?.value ? String(result.rows[0].value) : '';
}

const commands = {
	version() {
		const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));
		console.log(`Skyline ${packageJson.version ?? 'unknown'}`);
	},

	async status() {
		systemctl(['status', serviceName, '--no-pager']);
	},

	async start() {
		systemctl(['start', serviceName]);
	},

	async stop() {
		systemctl(['stop', serviceName]);
	},

	async restart() {
		systemctl(['restart', serviceName]);
	},

	async enable() {
		systemctl(['enable', serviceName]);
	},

	async disable() {
		systemctl(['disable', serviceName]);
	},

	async logs() {
		journalctl();
	},

	async update() {
		runCommand('git', ['-C', projectRoot, 'pull', '--ff-only']);
		runCommand('npm', ['ci'], { cwd: projectRoot });
		runCommand('npm', ['run', 'build'], { cwd: projectRoot });
		systemctl(['restart', serviceName]);
	},

	service: {
		async status() {
			systemctl(['status', serviceName, '--no-pager']);
		},
		async start() {
			systemctl(['start', serviceName]);
		},
		async stop() {
			systemctl(['stop', serviceName]);
		},
		async restart() {
			systemctl(['restart', serviceName]);
		},
		async enable() {
			systemctl(['enable', serviceName]);
		},
		async disable() {
			systemctl(['disable', serviceName]);
		},
		async logs() {
			journalctl();
		}
	},

	admin: {
		async show() {
			const db = getDb();
			try {
				const username = (await getSetting(db, 'admin_username')) || 'admin';
				const hasPassword = Boolean(await getSetting(db, 'passkey_hash'));
				console.log(`Admin username: ${username}`);
				console.log(`Password set:    ${hasPassword ? 'yes' : 'no'}`);
				console.log(`Database:        ${databasePath}`);
			} finally {
				db.close();
			}
		},

		async username(username) {
			const nextUsername = requireArg(username, 'sky admin username <username>').trim();
			if (nextUsername.length < 3) throw new Error('Admin username must be at least 3 characters.');
			const db = getDb();
			try {
				await setSetting(db, 'admin_username', nextUsername);
				await db.execute('DELETE FROM admin_sessions');
				console.log(`Admin username changed to: ${nextUsername}`);
				console.log('Active admin sessions revoked.');
			} finally {
				db.close();
			}
		},

		async password(password) {
			const nextPassword = password || (await promptSecret('New admin password: '));
			if (nextPassword.length < 6) throw new Error('Admin password must be at least 6 characters.');
			const db = getDb();
			try {
				await setSetting(db, 'passkey_hash', await hashSecret(nextPassword));
				await db.execute('DELETE FROM admin_sessions');
				console.log('Admin password changed.');
				console.log('Active admin sessions revoked.');
			} finally {
				db.close();
			}
		},

		async reset(username, password) {
			const nextUsername = requireArg(username, 'sky admin reset <username> [password]').trim();
			const nextPassword = password || (await promptSecret('New admin password: '));
			if (nextUsername.length < 3) throw new Error('Admin username must be at least 3 characters.');
			if (nextPassword.length < 6) throw new Error('Admin password must be at least 6 characters.');
			const db = getDb();
			try {
				await setSetting(db, 'admin_username', nextUsername);
				await setSetting(db, 'passkey_hash', await hashSecret(nextPassword));
				await db.execute('DELETE FROM admin_sessions');
				console.log(`Admin username changed to: ${nextUsername}`);
				console.log('Admin password changed.');
				console.log('Active admin sessions revoked.');
			} finally {
				db.close();
			}
		}
	},

	paths: {
		async show() {
			const db = getDb();
			try {
				const managerBasePath = await getSetting(db, 'manager_base_path');
				const resellerBasePath = await getSetting(db, 'reseller_base_path');
				console.log(
					`Manager path:  ${managerBasePath ? `/${managerBasePath}/manager` : '/manage'}`
				);
				console.log(
					`Reseller path: ${resellerBasePath ? `/${resellerBasePath}/reseller` : '/reseller'}`
				);
			} finally {
				db.close();
			}
		},

		async set(managerBase, resellerBase) {
			const nextManagerBase = validatePanelBasePath(
				requireArg(managerBase, 'sky paths set <manager-base> <reseller-base>')
			);
			const nextResellerBase = validatePanelBasePath(
				requireArg(resellerBase, 'sky paths set <manager-base> <reseller-base>')
			);
			if (nextManagerBase && nextResellerBase && nextManagerBase === nextResellerBase) {
				throw new Error('Manager and reseller hidden paths cannot be the same.');
			}
			const db = getDb();
			try {
				await setSetting(db, 'manager_base_path', nextManagerBase);
				await setSetting(db, 'reseller_base_path', nextResellerBase);
				console.log(`Manager path:  /${nextManagerBase}/manager`);
				console.log(`Reseller path: /${nextResellerBase}/reseller`);
			} finally {
				db.close();
			}
		},

		async clear() {
			const db = getDb();
			try {
				await setSetting(db, 'manager_base_path', '');
				await setSetting(db, 'reseller_base_path', '');
				console.log('Panel paths cleared. Defaults are enabled: /manage and /reseller');
			} finally {
				db.close();
			}
		}
	},

	resellers: {
		async list() {
			const db = getDb();
			try {
				const result = await db.execute(
					`SELECT id, username, email, is_active, must_change_password, created_at
					 FROM reseller_accounts
					 WHERE COALESCE(is_system_manager, 0) = 0
					 ORDER BY created_at DESC`
				);
				if (result.rows.length === 0) {
					console.log('(no resellers)');
					return;
				}
				console.log(
					`${col('ID', 6)}${col('Username', 24)}${col('Email', 30)}${col('Active', 8)}${col('Must change', 14)}${col('Created', 12)}`
				);
				console.log('-'.repeat(94));
				for (const row of result.rows) {
					const created = row.created_at
						? new Date(Number(row.created_at) * 1000).toISOString().slice(0, 10)
						: '-';
					console.log(
						`${col(row.id, 6)}${col(row.username, 24)}${col(row.email || '-', 30)}${col(row.is_active ? 'yes' : 'no', 8)}${col(row.must_change_password ? 'yes' : 'no', 14)}${col(created, 12)}`
					);
				}
			} finally {
				db.close();
			}
		},

		async create(username, password) {
			const normalized = normalizeUsername(
				requireArg(username, 'sky resellers create <username> [password]')
			);
			const nextPassword = password || (await promptSecret('Reseller password: '));
			if (normalized.length < 3)
				throw new Error('Reseller username must be at least 3 characters.');
			if (nextPassword.length < 6)
				throw new Error('Reseller password must be at least 6 characters.');
			const db = getDb();
			try {
				const existing = await db.execute({
					sql: 'SELECT id FROM reseller_accounts WHERE username_normalized = ? LIMIT 1',
					args: [normalized]
				});
				if (existing.rows.length > 0) throw new Error(`Reseller "${normalized}" already exists.`);
				const now = nowSeconds();
				const result = await db.execute({
					sql: `INSERT INTO reseller_accounts
					      (username, username_normalized, password_hash, is_active, email, must_change_password, custom_message, created_at, updated_at)
					      VALUES (?, ?, ?, 1, '', 0, '', ?, ?)`,
					args: [normalized, normalized, await hashSecret(nextPassword), now, now]
				});
				console.log(`Reseller created: #${result.lastInsertRowid} ${normalized}`);
			} finally {
				db.close();
			}
		},

		async password(id, password) {
			const resellerId = Number(requireArg(id, 'sky resellers password <id> [password]'));
			if (!Number.isInteger(resellerId) || resellerId <= 0)
				throw new Error('Reseller id must be a positive integer.');
			const nextPassword = password || (await promptSecret('New reseller password: '));
			if (nextPassword.length < 6)
				throw new Error('Reseller password must be at least 6 characters.');
			const db = getDb();
			try {
				const result = await db.execute({
					sql: 'UPDATE reseller_accounts SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?',
					args: [await hashSecret(nextPassword), nowSeconds(), resellerId]
				});
				if (result.rowsAffected === 0) throw new Error(`Reseller #${resellerId} not found.`);
				await db.execute({
					sql: 'DELETE FROM reseller_sessions WHERE reseller_id = ?',
					args: [resellerId]
				});
				console.log(`Password changed for reseller #${resellerId}.`);
				console.log('Active reseller sessions revoked.');
			} finally {
				db.close();
			}
		},

		async 'reset-password'(id, password) {
			await commands.resellers.password(id, password || 'skyline123');
			console.log('Default password used: skyline123');
		},

		async activate(id) {
			await setResellerActive(id, true);
		},

		async deactivate(id) {
			await setResellerActive(id, false);
		}
	},

	db: {
		path() {
			console.log(databasePath);
		},

		async integrity() {
			const db = getDb();
			try {
				const result = await db.execute('PRAGMA integrity_check');
				const status = String(result.rows[0]?.integrity_check ?? 'unknown');
				if (status !== 'ok') throw new Error(`Database integrity check failed: ${status}`);
				console.log('Database integrity: OK');
			} finally {
				db.close();
			}
		}
	}
};

async function setResellerActive(id, active) {
	const resellerId = Number(
		requireArg(id, `sky resellers ${active ? 'activate' : 'deactivate'} <id>`)
	);
	if (!Number.isInteger(resellerId) || resellerId <= 0)
		throw new Error('Reseller id must be a positive integer.');
	const db = getDb();
	try {
		const result = await db.execute({
			sql: 'UPDATE reseller_accounts SET is_active = ?, updated_at = ? WHERE id = ?',
			args: [active ? 1 : 0, nowSeconds(), resellerId]
		});
		if (result.rowsAffected === 0) throw new Error(`Reseller #${resellerId} not found.`);
		if (!active)
			await db.execute({
				sql: 'DELETE FROM reseller_sessions WHERE reseller_id = ?',
				args: [resellerId]
			});
		console.log(`Reseller #${resellerId} ${active ? 'activated' : 'deactivated'}.`);
	} finally {
		db.close();
	}
}

async function runMenu() {
	for (;;) {
		console.log(`\nSkyline CLI (${serviceName})`);
		console.log('1) Service status');
		console.log('2) Start service');
		console.log('3) Stop service');
		console.log('4) Restart service');
		console.log('5) Follow logs');
		console.log('6) Show admin');
		console.log('7) Change admin username');
		console.log('8) Change admin password');
		console.log('9) Show panel paths');
		console.log('10) Set panel paths');
		console.log('11) List resellers');
		console.log('12) Create reseller');
		console.log('0) Exit');

		const choice = await prompt('Select: ');
		if (choice === '0') return;
		if (choice === '1') await commands.status();
		else if (choice === '2') await commands.start();
		else if (choice === '3') await commands.stop();
		else if (choice === '4') await commands.restart();
		else if (choice === '5') await commands.logs();
		else if (choice === '6') await commands.admin.show();
		else if (choice === '7') await commands.admin.username(await prompt('New admin username: '));
		else if (choice === '8') await commands.admin.password();
		else if (choice === '9') await commands.paths.show();
		else if (choice === '10')
			await commands.paths.set(
				await prompt('Manager base path: '),
				await prompt('Reseller base path: ')
			);
		else if (choice === '11') await commands.resellers.list();
		else if (choice === '12') await commands.resellers.create(await prompt('Reseller username: '));
		else console.log('Unknown option.');
	}
}

async function main() {
	const [group, subcommand, ...args] = process.argv.slice(2);

	if (!group) {
		await runMenu();
		return;
	}
	if (group === 'help' || group === '--help' || group === '-h') {
		printHelp();
		return;
	}

	const commandGroup = commands[group];
	if (typeof commandGroup === 'function') {
		await commandGroup(subcommand, ...args);
		return;
	}

	if (!commandGroup || typeof commandGroup !== 'object') {
		printHelp();
		process.exit(1);
	}

	const handler = commandGroup[subcommand];
	if (!handler) {
		console.error(`Unknown command: ${group}${subcommand ? ` ${subcommand}` : ''}\n`);
		printHelp();
		process.exit(1);
	}

	await handler(...args);
}

main().catch((error) => {
	console.error('Error:', error instanceof Error ? error.message : error);
	process.exit(1);
});
