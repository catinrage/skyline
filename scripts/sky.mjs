#!/usr/bin/env node

import { createClient } from '@libsql/client';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import chalk from 'chalk';
import ora from 'ora';
import enquirer from 'enquirer';
import {
	hashSecret,
	normalizeUsername,
	nowSeconds,
	validatePanelBasePath
} from './sky-utils.mjs';

const { Select, Password, Input, Confirm } = enquirer;

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const serviceName = process.env.SKYLINE_SERVICE || 'skyline';

loadEnv(resolve(projectRoot, '.env'));

const databasePath = process.env.DATABASE_PATH ?? resolve(projectRoot, 'data', 'skyline.sqlite');
const databaseUrl = pathToFileURL(databasePath).href;

/* -------------------------------------------------------------------------- */
/* Theme & presentation helpers                                               */
/* -------------------------------------------------------------------------- */

const theme = {
	brand: chalk.hex('#38bdf8'),
	brandBold: chalk.hex('#38bdf8').bold,
	accent: chalk.hex('#a78bfa'),
	success: chalk.hex('#34d399'),
	error: chalk.hex('#f87171'),
	warn: chalk.hex('#fbbf24'),
	info: chalk.hex('#60a5fa'),
	muted: chalk.hex('#94a3b8'),
	value: chalk.whiteBright,
	dim: chalk.dim,
	bold: chalk.bold
};

const ansiPattern = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

function visibleLength(value) {
	return String(value).replace(ansiPattern, '').length;
}

function padEndVisible(value, width) {
	const str = String(value);
	return str + ' '.repeat(Math.max(0, width - visibleLength(str)));
}

function ok(message) {
	console.log(`${theme.success('✓')} ${message}`);
}

function fail(message) {
	console.log(`${theme.error('✗')} ${message}`);
}

function info(message) {
	console.log(`${theme.info('ℹ')} ${message}`);
}

function box(lines, { title = '', color = theme.brand } = {}) {
	const padding = 1;
	const titleLen = title ? visibleLength(title) : 0;
	const inner = Math.max(0, ...lines.map(visibleLength), title ? titleLen + 2 : 0) + padding * 2;
	const top = title
		? color('╭─ ') +
			theme.brandBold(title) +
			color(' ' + '─'.repeat(Math.max(1, inner - titleLen - 3)) + '╮')
		: color('╭' + '─'.repeat(inner) + '╮');
	const bottom = color('╰' + '─'.repeat(inner) + '╯');
	const body = lines.map((line) => {
		const content = ' '.repeat(padding) + line + ' '.repeat(inner - padding - visibleLength(line));
		return color('│') + content + color('│');
	});
	console.log([top, ...body, bottom].join('\n'));
}

function section(title) {
	console.log();
	console.log(theme.brandBold(`▌ ${title}`));
	console.log(theme.dim('─'.repeat(visibleLength(title) + 2)));
}

function kv(pairs) {
	const labelWidth = Math.max(...pairs.map(([key]) => visibleLength(key)));
	for (const [key, value] of pairs) {
		console.log(`  ${theme.muted(padEndVisible(key, labelWidth))}   ${value}`);
	}
}

function table(headers, rows) {
	const widths = headers.map((header, index) =>
		Math.max(visibleLength(header), ...rows.map((row) => visibleLength(row[index] ?? '')), 0)
	);
	const gap = '   ';
	const headerLine = headers
		.map((header, index) => theme.brandBold(padEndVisible(header, widths[index])))
		.join(gap);
	const totalWidth =
		widths.reduce((sum, width) => sum + width, 0) + gap.length * (headers.length - 1);
	console.log(headerLine);
	console.log(theme.dim('─'.repeat(totalWidth)));
	for (const row of rows) {
		console.log(row.map((cell, index) => padEndVisible(cell ?? '', widths[index])).join(gap));
	}
}

function readVersion() {
	try {
		const pkg = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));
		return pkg.version ?? 'unknown';
	} catch {
		return 'unknown';
	}
}

function header() {
	box(
		[
			theme.muted('Server manager  ') + theme.brand('v' + readVersion()),
			theme.muted('Service   ') + theme.value(serviceName),
			theme.muted('Database  ') + theme.value(databasePath)
		],
		{ title: '✦ SKYLINE' }
	);
}

async function withSpinner(text, task, successText) {
	const spinner = ora({ text, spinner: 'dots', color: 'cyan' }).start();
	try {
		const result = await task();
		spinner.succeed(successText ?? text);
		return result;
	} catch (error) {
		spinner.fail(theme.error(error instanceof Error ? error.message : String(error)));
		if (error && error.output) console.log(theme.dim(String(error.output).trim()));
		throw error;
	}
}

/* -------------------------------------------------------------------------- */
/* Interactive prompts (enquirer)                                             */
/* -------------------------------------------------------------------------- */

function ensureTty() {
	if (!process.stdin.isTTY) {
		throw new Error(
			'This action needs an interactive terminal. Pass the value as an argument instead.'
		);
	}
}

async function askText(message, { validate } = {}) {
	ensureTty();
	const answer = await new Input({ message, validate }).run();
	return answer.trim();
}

async function askSecret(message) {
	ensureTty();
	return await new Password({ message }).run();
}

async function askConfirm(message, initial = false) {
	ensureTty();
	return await new Confirm({ message, initial }).run();
}

async function askSelect(message, choices) {
	ensureTty();
	return await new Select({ message, choices }).run();
}

/* -------------------------------------------------------------------------- */
/* Core helpers                                                               */
/* -------------------------------------------------------------------------- */

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

function requireArg(value, usage) {
	if (value) return value;
	throw new Error(`Usage: ${usage}`);
}

function printHelp() {
	header();
	console.log();
	const group = (title, rows) => {
		console.log(theme.brandBold(title));
		for (const [cmd, desc] of rows) {
			console.log(`  ${theme.accent(padEndVisible(cmd, 46))}${theme.muted(desc)}`);
		}
		console.log();
	};

	group('General', [
		['sky', 'Open the interactive menu'],
		['sky help', 'Show this help'],
		['sky version', 'Show installed Skyline version']
	]);
	group('Service', [
		['sky status', 'Show systemd status'],
		['sky start', 'Start Skyline service'],
		['sky stop', 'Stop Skyline service'],
		['sky restart', 'Restart Skyline service'],
		['sky logs', 'Follow Skyline service logs'],
		['sky enable', 'Enable service at boot'],
		['sky disable', 'Disable service at boot'],
		['sky update', 'Pull, install, build, restart'],
		['sky repair', 'Reinstall deps, rebuild, verify DB, restart'],
		['sky uninstall [--purge]', 'Remove service & sky CLI (--purge deletes DB)'],
		['sky service <command>', 'Same commands under service namespace']
	]);
	group('Admin', [
		['sky admin show', 'Show admin account info'],
		['sky admin username <username>', 'Change admin username'],
		['sky admin password [password]', 'Change admin password'],
		['sky admin reset <username> [password]', 'Reset admin username and password']
	]);
	group('Panel paths', [
		['sky paths show', 'Show panel paths'],
		['sky paths set <manager> <reseller>', 'Set hidden base paths'],
		['sky paths clear', 'Reset to default paths']
	]);
	group('Resellers', [
		['sky resellers list', 'List reseller accounts'],
		['sky resellers create <username> [password]', 'Create a reseller'],
		['sky resellers password <id> [password]', 'Change reseller password'],
		['sky resellers reset-password <id> [password]', 'Reset to default password'],
		['sky resellers activate <id>', 'Activate a reseller'],
		['sky resellers deactivate <id>', 'Deactivate a reseller']
	]);
	group('Database', [
		['sky db path', 'Show database path'],
		['sky db integrity', 'Run integrity check'],
		['sky db exec "<sql>"', 'Run a SQL statement']
	]);

	console.log(theme.brandBold('Environment'));
	console.log(
		`  ${theme.accent(padEndVisible('DATABASE_PATH', 46))}${theme.muted('Override SQLite path. Default: ' + databasePath)}`
	);
	console.log(
		`  ${theme.accent(padEndVisible('SKYLINE_SERVICE', 46))}${theme.muted('Override service name. Default: ' + serviceName)}`
	);
}

function runCommand(command, args, options = {}) {
	const result = spawnSync(command, args, { stdio: 'inherit', ...options });
	if (result.error) throw result.error;
	if (typeof result.status === 'number' && result.status !== 0) process.exit(result.status);
}

function runAsync(command, args, options = {}) {
	return new Promise((resolveValue, rejectValue) => {
		const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
		let output = '';
		child.stdout?.on('data', (chunk) => (output += chunk));
		child.stderr?.on('data', (chunk) => (output += chunk));
		child.on('error', rejectValue);
		child.on('close', (code) => {
			if (code === 0) resolveValue(output);
			else
				rejectValue(
					Object.assign(new Error(`${command} ${args.join(' ')} exited with code ${code}`), {
						output
					})
				);
		});
	});
}

function isRoot() {
	return typeof process.getuid === 'function' && process.getuid() === 0;
}

function privCommand(command, args) {
	return isRoot() ? [command, args] : ['sudo', [command, ...args]];
}

function runPriv(command, args) {
	const [cmd, cmdArgs] = privCommand(command, args);
	runCommand(cmd, cmdArgs);
}

function tryPriv(command, args) {
	const [cmd, cmdArgs] = privCommand(command, args);
	const result = spawnSync(cmd, cmdArgs, { stdio: 'inherit' });
	return !result.error && result.status === 0;
}

function systemctl(args) {
	runCommand('systemctl', args);
}

function journalctl() {
	runCommand('journalctl', ['-u', serviceName, '-f', '-n', '100']);
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

/* -------------------------------------------------------------------------- */
/* Service operations                                                         */
/* -------------------------------------------------------------------------- */

const svc = {
	status() {
		section(`Service status · ${serviceName}`);
		systemctl(['status', serviceName, '--no-pager']);
	},
	start() {
		systemctl(['start', serviceName]);
		ok(`${theme.value(serviceName)} started.`);
	},
	stop() {
		systemctl(['stop', serviceName]);
		ok(`${theme.value(serviceName)} stopped.`);
	},
	restart() {
		systemctl(['restart', serviceName]);
		ok(`${theme.value(serviceName)} restarted.`);
	},
	enable() {
		systemctl(['enable', serviceName]);
		ok(`${theme.value(serviceName)} enabled at boot.`);
	},
	disable() {
		systemctl(['disable', serviceName]);
		ok(`${theme.value(serviceName)} disabled at boot.`);
	},
	logs() {
		info(`Following logs for ${theme.value(serviceName)} ${theme.dim('(Ctrl+C to stop)')}`);
		journalctl();
	}
};

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

const commands = {
	version() {
		console.log(`${theme.brandBold('Skyline')} ${theme.value(readVersion())}`);
	},

	status: () => svc.status(),
	start: () => svc.start(),
	stop: () => svc.stop(),
	restart: () => svc.restart(),
	enable: () => svc.enable(),
	disable: () => svc.disable(),
	logs: () => svc.logs(),

	async update() {
		header();
		console.log();
		await withSpinner(
			'Pulling latest changes',
			() => runAsync('git', ['-C', projectRoot, 'pull', '--ff-only']),
			'Pulled latest changes'
		);
		await withSpinner(
			'Installing dependencies',
			() => runAsync('npm', ['ci'], { cwd: projectRoot }),
			'Dependencies installed'
		);
		await withSpinner(
			'Building application',
			() => runAsync('npm', ['run', 'build'], { cwd: projectRoot }),
			'Build complete'
		);
		await withSpinner(
			'Restarting service',
			() => runAsync('systemctl', ['restart', serviceName]),
			`${serviceName} restarted`
		);
		console.log();
		ok(theme.bold('Skyline updated successfully.'));
	},

	async repair() {
		header();
		console.log();
		await withSpinner(
			'Reinstalling dependencies',
			() => runAsync('npm', ['ci'], { cwd: projectRoot }),
			'Dependencies reinstalled'
		);
		await withSpinner(
			'Rebuilding application',
			() => runAsync('npm', ['run', 'build'], { cwd: projectRoot }),
			'Rebuild complete'
		);
		await withSpinner(
			'Verifying database',
			async () => {
				const db = getDb();
				try {
					await ensureAdminTables(db);
					const result = await db.execute('PRAGMA integrity_check');
					const status = String(result.rows[0]?.integrity_check ?? 'unknown');
					if (status !== 'ok') throw new Error(`integrity check failed: ${status}`);
					return status;
				} finally {
					db.close();
				}
			},
			'Database verified'
		);
		await withSpinner(
			'Restarting service',
			() => runAsync('systemctl', ['restart', serviceName]),
			`${serviceName} restarted`
		);
		console.log();
		ok(theme.bold('Repair complete.'));
	},

	async uninstall(...flags) {
		const purge = flags.includes('--purge') || flags.includes('-p');
		if (process.stdin.isTTY) {
			const confirmed = await askConfirm(
				`Uninstall the ${serviceName} service${purge ? ' and DELETE the database' : ''}?`
			);
			if (!confirmed) {
				info('Cancelled.');
				return;
			}
		}
		section(`Uninstall · ${serviceName}`);
		const unitPath = `/etc/systemd/system/${serviceName}.service`;

		tryPriv('systemctl', ['disable', '--now', serviceName]);
		if (tryPriv('rm', ['-f', unitPath])) ok('Removed systemd unit.');
		runPriv('systemctl', ['daemon-reload']);
		tryPriv('systemctl', ['reset-failed', serviceName]);

		if (tryPriv('rm', ['-f', '/usr/local/bin/sky'])) ok('Removed sky CLI symlink.');

		if (purge) {
			tryPriv('rm', ['-f', databasePath, `${databasePath}-wal`, `${databasePath}-shm`]);
			ok('Database deleted.');
		} else {
			info(`Database preserved at ${theme.value(databasePath)}`);
		}
		info(`Project files remain at ${theme.value(projectRoot)}`);
		console.log();
		ok(theme.bold('Skyline service uninstalled.'));
	},

	service: svc,

	admin: {
		async show() {
			const db = getDb();
			try {
				const username = (await getSetting(db, 'admin_username')) || 'admin';
				const hasPassword = Boolean(await getSetting(db, 'passkey_hash'));
				section('Admin account');
				kv([
					['Username', theme.value(username)],
					['Password', hasPassword ? theme.success('set') : theme.warn('not set')],
					['Database', theme.muted(databasePath)]
				]);
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
				ok(`Admin username changed to ${theme.value(nextUsername)}.`);
				info('Active admin sessions revoked.');
			} finally {
				db.close();
			}
		},

		async password(password) {
			const nextPassword = password || (await askSecret('New admin password:'));
			if (nextPassword.length < 6) throw new Error('Admin password must be at least 6 characters.');
			const db = getDb();
			try {
				await setSetting(db, 'passkey_hash', await hashSecret(nextPassword));
				await db.execute('DELETE FROM admin_sessions');
				ok('Admin password changed.');
				info('Active admin sessions revoked.');
			} finally {
				db.close();
			}
		},

		async reset(username, password) {
			const nextUsername = requireArg(username, 'sky admin reset <username> [password]').trim();
			const nextPassword = password || (await askSecret('New admin password:'));
			if (nextUsername.length < 3) throw new Error('Admin username must be at least 3 characters.');
			if (nextPassword.length < 6) throw new Error('Admin password must be at least 6 characters.');
			const db = getDb();
			try {
				await setSetting(db, 'admin_username', nextUsername);
				await setSetting(db, 'passkey_hash', await hashSecret(nextPassword));
				await db.execute('DELETE FROM admin_sessions');
				ok(`Admin username changed to ${theme.value(nextUsername)}.`);
				ok('Admin password changed.');
				info('Active admin sessions revoked.');
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
				section('Panel paths');
				kv([
					['Manager', theme.value(managerBasePath ? `/${managerBasePath}/manager` : '/manage')],
					[
						'Reseller',
						theme.value(resellerBasePath ? `/${resellerBasePath}/reseller` : '/reseller')
					]
				]);
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
				ok('Panel paths updated.');
				kv([
					['Manager', theme.value(`/${nextManagerBase}/manager`)],
					['Reseller', theme.value(`/${nextResellerBase}/reseller`)]
				]);
			} finally {
				db.close();
			}
		},

		async clear() {
			const db = getDb();
			try {
				await setSetting(db, 'manager_base_path', '');
				await setSetting(db, 'reseller_base_path', '');
				ok('Panel paths cleared.');
				info('Defaults enabled: /manage and /reseller');
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
				section('Resellers');
				if (result.rows.length === 0) {
					info(theme.muted('No resellers yet.'));
					return;
				}
				const rows = result.rows.map((row) => {
					const created = row.created_at
						? new Date(Number(row.created_at) * 1000).toISOString().slice(0, 10)
						: '-';
					return [
						theme.muted(`#${row.id}`),
						theme.value(String(row.username)),
						String(row.email || '-'),
						row.is_active ? theme.success('active') : theme.error('inactive'),
						row.must_change_password ? theme.warn('yes') : theme.dim('no'),
						theme.muted(created)
					];
				});
				table(['ID', 'Username', 'Email', 'Status', 'Must change', 'Created'], rows);
			} finally {
				db.close();
			}
		},

		async create(username, password) {
			const normalized = normalizeUsername(
				requireArg(username, 'sky resellers create <username> [password]')
			);
			const nextPassword = password || (await askSecret('Reseller password:'));
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
				ok(
					`Reseller created: ${theme.muted('#' + result.lastInsertRowid)} ${theme.value(normalized)}`
				);
			} finally {
				db.close();
			}
		},

		async password(id, password) {
			const resellerId = Number(requireArg(id, 'sky resellers password <id> [password]'));
			if (!Number.isInteger(resellerId) || resellerId <= 0)
				throw new Error('Reseller id must be a positive integer.');
			const nextPassword = password || (await askSecret('New reseller password:'));
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
				ok(`Password changed for reseller ${theme.muted('#' + resellerId)}.`);
				info('Active reseller sessions revoked.');
			} finally {
				db.close();
			}
		},

		async 'reset-password'(id, password) {
			await commands.resellers.password(id, password || 'skyline123');
			info(`Default password used: ${theme.value('skyline123')}`);
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
			console.log(theme.value(databasePath));
		},

		async integrity() {
			const db = getDb();
			try {
				await withSpinner(
					'Checking database integrity',
					async () => {
						const result = await db.execute('PRAGMA integrity_check');
						const status = String(result.rows[0]?.integrity_check ?? 'unknown');
						if (status !== 'ok') throw new Error(`integrity check failed: ${status}`);
						return status;
					},
					'Database integrity: OK'
				);
			} finally {
				db.close();
			}
		},

		async exec(sql) {
			const query = requireArg(sql, 'sky db exec "<sql>"').trim();
			const db = getDb();
			try {
				const result = await db.execute(query);
				if (result.rows.length > 0) {
					const cols = result.columns;
					const rows = result.rows.map((row) => cols.map((col) => String(row[col] ?? '')));
					console.log();
					table(cols, rows);
					console.log();
					console.log(theme.muted(`${result.rows.length} row(s)`));
				} else {
					ok(`Query OK. ${result.rowsAffected} row(s) affected.`);
				}
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
		ok(
			`Reseller ${theme.muted('#' + resellerId)} ${active ? theme.success('activated') : theme.warn('deactivated')}.`
		);
	} finally {
		db.close();
	}
}

/* -------------------------------------------------------------------------- */
/* Interactive menu                                                           */
/* -------------------------------------------------------------------------- */

const separator = { role: 'separator', message: theme.dim('────────────') };

async function pickReseller(message) {
	const db = getDb();
	try {
		const result = await db.execute(
			`SELECT id, username, is_active FROM reseller_accounts
			 WHERE COALESCE(is_system_manager, 0) = 0
			 ORDER BY created_at DESC`
		);
		if (result.rows.length === 0) {
			info(theme.muted('No resellers found.'));
			return null;
		}
		const choice = await askSelect(message, [
			...result.rows.map((row) => ({
				name: String(row.id),
				message: `${theme.muted('#' + row.id)}  ${theme.value(String(row.username))}  ${row.is_active ? theme.success('active') : theme.error('inactive')}`
			})),
			separator,
			{ name: 'back', message: theme.muted('Back') }
		]);
		return choice === 'back' ? null : Number(choice);
	} finally {
		db.close();
	}
}

async function serviceMenu() {
	const action = await askSelect('Service management', [
		{ name: 'status', message: 'Status' },
		{ name: 'start', message: 'Start' },
		{ name: 'stop', message: 'Stop' },
		{ name: 'restart', message: 'Restart' },
		{ name: 'enable', message: 'Enable at boot' },
		{ name: 'disable', message: 'Disable at boot' },
		{ name: 'logs', message: 'Follow logs' },
		separator,
		{ name: 'update', message: 'Update (pull, build, restart)' },
		{ name: 'repair', message: 'Repair (reinstall, rebuild, restart)' },
		{ name: 'uninstall', message: theme.warn('Uninstall service') },
		separator,
		{ name: 'back', message: theme.muted('Back') }
	]);
	if (action === 'back') return;
	if (action === 'update') return commands.update();
	if (action === 'repair') return commands.repair();
	if (action === 'uninstall') return commands.uninstall();
	await svc[action]();
}

async function adminMenu() {
	const action = await askSelect('Admin account', [
		{ name: 'show', message: 'Show admin info' },
		{ name: 'username', message: 'Change username' },
		{ name: 'password', message: 'Change password' },
		separator,
		{ name: 'back', message: theme.muted('Back') }
	]);
	if (action === 'back') return;
	if (action === 'show') return commands.admin.show();
	if (action === 'username') {
		const username = await askText('New admin username:', {
			validate: (value) => value.trim().length >= 3 || 'At least 3 characters.'
		});
		return commands.admin.username(username);
	}
	if (action === 'password') return commands.admin.password();
}

async function pathsMenu() {
	const action = await askSelect('Panel paths', [
		{ name: 'show', message: 'Show paths' },
		{ name: 'set', message: 'Set paths' },
		{ name: 'clear', message: 'Reset to defaults' },
		separator,
		{ name: 'back', message: theme.muted('Back') }
	]);
	if (action === 'back') return;
	if (action === 'show') return commands.paths.show();
	if (action === 'set') {
		const managerBase = await askText('Manager base path:');
		const resellerBase = await askText('Reseller base path:');
		return commands.paths.set(managerBase, resellerBase);
	}
	if (action === 'clear') {
		if (await askConfirm('Reset panel paths to defaults?')) return commands.paths.clear();
		info('Cancelled.');
	}
}

async function resellersMenu() {
	const action = await askSelect('Resellers', [
		{ name: 'list', message: 'List resellers' },
		{ name: 'create', message: 'Create reseller' },
		{ name: 'password', message: 'Change reseller password' },
		{ name: 'activate', message: 'Activate reseller' },
		{ name: 'deactivate', message: 'Deactivate reseller' },
		separator,
		{ name: 'back', message: theme.muted('Back') }
	]);
	if (action === 'back') return;
	if (action === 'list') return commands.resellers.list();
	if (action === 'create') {
		const username = await askText('Reseller username:', {
			validate: (value) => normalizeUsername(value).length >= 3 || 'At least 3 characters.'
		});
		const password = await askSecret('Reseller password:');
		return commands.resellers.create(username, password);
	}

	const id = await pickReseller('Select a reseller');
	if (!id) return;
	if (action === 'password') {
		const password = await askSecret('New reseller password:');
		return commands.resellers.password(String(id), password);
	}
	if (action === 'activate') return commands.resellers.activate(String(id));
	if (action === 'deactivate') {
		if (await askConfirm(`Deactivate reseller #${id}?`))
			return commands.resellers.deactivate(String(id));
		info('Cancelled.');
	}
}

async function databaseMenu() {
	const action = await askSelect('Database', [
		{ name: 'path', message: 'Show database path' },
		{ name: 'integrity', message: 'Run integrity check' },
		{ name: 'exec', message: 'Run a SQL statement' },
		separator,
		{ name: 'back', message: theme.muted('Back') }
	]);
	if (action === 'back') return;
	if (action === 'path') return commands.db.path();
	if (action === 'integrity') return commands.db.integrity();
	if (action === 'exec') {
		const { Input } = await import('enquirer');
		const sql = await new Input({ message: 'SQL', hint: 'e.g. SELECT * FROM settings' }).run();
		return commands.db.exec(sql);
	}
}

async function runMenu() {
	ensureTty();
	console.log();
	header();
	for (;;) {
		console.log();
		const choice = await askSelect('What would you like to do?', [
			{ name: 'service', message: 'Service management' },
			{ name: 'admin', message: 'Admin account' },
			{ name: 'paths', message: 'Panel paths' },
			{ name: 'resellers', message: 'Resellers' },
			{ name: 'database', message: 'Database' },
			separator,
			{ name: 'exit', message: theme.muted('Exit') }
		]);

		if (choice === 'exit') {
			info('Goodbye.');
			return;
		}

		try {
			if (choice === 'service') await serviceMenu();
			else if (choice === 'admin') await adminMenu();
			else if (choice === 'paths') await pathsMenu();
			else if (choice === 'resellers') await resellersMenu();
			else if (choice === 'database') await databaseMenu();
		} catch (error) {
			if (error === '' || error == null) continue;
			fail(error instanceof Error ? error.message : String(error));
		}
	}
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

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
	if (typeof handler !== 'function') {
		fail(`Unknown command: ${group}${subcommand ? ` ${subcommand}` : ''}`);
		console.log();
		printHelp();
		process.exit(1);
	}

	await handler(...args);
}

main().catch((error) => {
	if (error === '' || error == null) {
		console.log();
		process.exit(0);
	}
	console.log();
	fail(theme.bold(error instanceof Error ? error.message : String(error)));
	process.exit(1);
});
