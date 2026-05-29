import { getRuntimeSettings, type RuntimeSettings } from '$lib/server/admin';
import { logger } from '$lib/server/logger';
import { constants, mkdirSync, rmSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { Socket } from 'node:net';
import { resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';

const probeDirectory = resolve('/tmp', 'skyline-probes');
const proxyLogger = logger.child('xray-proxy');

type RunningProcess = ChildProcess & {
	exited: Promise<number | null>;
};

interface ParsedVlessConfig {
	id: string;
	address: string;
	port: number;
	network: string;
	security: string;
	flow?: string;
	host?: string;
	path?: string;
	serviceName?: string;
	headerType?: string;
	sni?: string;
	alpn?: string;
	fingerprint?: string;
	publicKey?: string;
	shortId?: string;
	spiderX?: string;
	decryption?: string;
}

export interface TemporaryProxySession {
	socksPort: number;
	process: RunningProcess;
	configPath: string;
	cleanup: () => Promise<void>;
}

export type XrayBinaryHealthResult = {
	ok: boolean;
	path: string;
	message: string;
	errorName: string | null;
};

async function getXrayBinaryPath(settings?: RuntimeSettings) {
	const runtimeSettings = settings ?? (await getRuntimeSettings());
	return runtimeSettings.xrayBinaryPath.trim();
}

export async function checkXrayBinaryHealth(
	settingsOverride?: RuntimeSettings
): Promise<XrayBinaryHealthResult> {
	const path = await getXrayBinaryPath(settingsOverride);

	try {
		await access(path, constants.X_OK);
		return {
			ok: true,
			path,
			message: 'Xray binary exists and is executable.',
			errorName: null
		};
	} catch (error) {
		return {
			ok: false,
			path,
			message: 'Xray binary path is missing or not executable.',
			errorName: error instanceof Error ? error.name : null
		};
	}
}

function getRandomPort() {
	return 20_000 + Math.floor(Math.random() * 20_000);
}

function parseVlessUri(configUrl: string): ParsedVlessConfig {
	const url = new URL(configUrl);

	if (url.protocol !== 'vless:') {
		throw new Error('فقط کانفیگ‌های VLESS پشتیبانی می‌شوند.');
	}

	const port = Number(url.port);

	if (!url.username || !url.hostname || !Number.isInteger(port) || port <= 0) {
		throw new Error('کانفیگ VLESS معتبر نیست.');
	}

	return {
		id: decodeURIComponent(url.username),
		address: url.hostname,
		port,
		network: url.searchParams.get('type') || 'tcp',
		security: url.searchParams.get('security') || 'none',
		flow: url.searchParams.get('flow') || undefined,
		host: url.searchParams.get('host') || undefined,
		path: url.searchParams.get('path') || undefined,
		serviceName: url.searchParams.get('serviceName') || undefined,
		headerType: url.searchParams.get('headerType') || undefined,
		sni: url.searchParams.get('sni') || undefined,
		alpn: url.searchParams.get('alpn') || undefined,
		fingerprint: url.searchParams.get('fp') || undefined,
		publicKey: url.searchParams.get('pbk') || undefined,
		shortId: url.searchParams.get('sid') || undefined,
		spiderX: url.searchParams.get('spx') || undefined,
		decryption: url.searchParams.get('decryption') || undefined
	};
}

function createXrayConfig(parsed: ParsedVlessConfig, socksPort: number) {
	const streamSettings: Record<string, unknown> = {
		network: parsed.network,
		security: parsed.security
	};

	if (parsed.network === 'ws') {
		streamSettings.wsSettings = {
			path: parsed.path || '/',
			headers: parsed.host ? { Host: parsed.host } : undefined
		};
	}

	if (parsed.network === 'grpc') {
		streamSettings.grpcSettings = {
			serviceName: parsed.serviceName || ''
		};
	}

	if (parsed.network === 'httpupgrade') {
		streamSettings.httpupgradeSettings = {
			path: parsed.path || '/',
			host: parsed.host || ''
		};
	}

	if (parsed.network === 'tcp' && parsed.headerType && parsed.headerType !== 'none') {
		streamSettings.tcpSettings = {
			header: {
				type: parsed.headerType
			}
		};
	}

	if (parsed.security === 'tls') {
		streamSettings.tlsSettings = {
			serverName: parsed.sni,
			alpn: parsed.alpn ? [parsed.alpn] : undefined
		};
	}

	if (parsed.security === 'reality') {
		streamSettings.realitySettings = {
			serverName: parsed.sni,
			fingerprint: parsed.fingerprint,
			publicKey: parsed.publicKey,
			shortId: parsed.shortId,
			spiderX: parsed.spiderX
		};
	}

	return {
		log: {
			loglevel: 'warning'
		},
		inbounds: [
			{
				tag: 'local-socks',
				listen: '127.0.0.1',
				port: socksPort,
				protocol: 'socks',
				settings: {
					auth: 'noauth',
					udp: false
				}
			}
		],
		outbounds: [
			{
				tag: 'proxy',
				protocol: 'vless',
				settings: {
					vnext: [
						{
							address: parsed.address,
							port: parsed.port,
							users: [
								{
									id: parsed.id,
									encryption: parsed.decryption || 'none',
									flow: parsed.flow
								}
							]
						}
					]
				},
				streamSettings
			}
		]
	};
}

async function waitForLocalPort(port: number, timeoutMs = 8_000) {
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		const connected = await new Promise<boolean>((resolve) => {
			const socket = new Socket();

			socket.setTimeout(750);
			socket.once('connect', () => {
				socket.destroy();
				resolve(true);
			});
			socket.once('error', () => {
				socket.destroy();
				resolve(false);
			});
			socket.once('timeout', () => {
				socket.destroy();
				resolve(false);
			});
			socket.connect(port, '127.0.0.1');
		});

		if (connected) {
			return;
		}

		await delay(150);
	}

	throw new Error('پروسه تست کانفیگ در زمان مناسب آماده نشد.');
}

async function terminateProcess(process: RunningProcess) {
	if (process.exitCode !== null) {
		await process.exited.catch(() => undefined);
		return;
	}

	process.kill('SIGTERM');
	await Promise.race([process.exited.catch(() => undefined), delay(1_500)]);

	if (process.exitCode === null) {
		process.kill('SIGKILL');
		await process.exited.catch(() => undefined);
	}
}

function spawnProcess(
	args: string[],
	options: {
		stdout: 'pipe' | 'ignore';
		stderr: 'pipe' | 'ignore';
	}
) {
	const [command, ...commandArgs] = args;
	const process = spawn(command, commandArgs, {
		stdio: ['ignore', options.stdout, options.stderr]
	}) as RunningProcess;

	process.exited = new Promise<number | null>((resolve, reject) => {
		process.once('error', reject);
		process.once('exit', (code) => resolve(code));
	});

	return process;
}

async function readStreamText(stream: Readable | null | undefined) {
	if (!stream) {
		return '';
	}

	const chunks: Buffer[] = [];

	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}

	return Buffer.concat(chunks).toString('utf8');
}

export async function runProxyCurlRequest(
	socksPort: number,
	url: string,
	options?: {
		output?: 'body' | 'discard';
		connectTimeoutSeconds?: number;
		maxTimeSeconds?: number;
		location?: boolean;
	}
) {
	const curlArgs = [
		'curl',
		'--silent',
		'--show-error',
		'--proxy',
		`socks5h://127.0.0.1:${socksPort}`,
		'--connect-timeout',
		String(options?.connectTimeoutSeconds ?? 8),
		'--max-time',
		String(options?.maxTimeSeconds ?? 20),
		'--write-out',
		'\n__SKYLINE_STATUS__ %{http_code} %{time_total} %{size_download}'
	];

	if (options?.location !== false) {
		curlArgs.push('--location');
	}

	if (options?.output === 'discard') {
		curlArgs.push('--output', '/dev/null');
	}

	curlArgs.push(url);
	proxyLogger.debug('Running proxy curl request.', {
		socksPort,
		url,
		output: options?.output ?? 'body',
		connectTimeoutSeconds: options?.connectTimeoutSeconds ?? 8,
		maxTimeSeconds: options?.maxTimeSeconds ?? 20,
		location: options?.location !== false
	});

	const curlProcess = spawnProcess(curlArgs, {
		stdout: 'pipe',
		stderr: 'pipe'
	});

	const [stdout, stderr] = await Promise.all([
		readStreamText(curlProcess.stdout),
		readStreamText(curlProcess.stderr)
	]);
	const exitCode = await curlProcess.exited;
	const markerIndex = stdout.lastIndexOf('\n__SKYLINE_STATUS__ ');
	const output = markerIndex >= 0 ? stdout.slice(0, markerIndex) : stdout;
	const meta = markerIndex >= 0 ? stdout.slice(markerIndex + '\n__SKYLINE_STATUS__ '.length).trim() : '';
	const [statusCode = '', timeTotal = '', sizeDownload = '0'] = meta.split(/\s+/);
	proxyLogger.debug('Proxy curl request finished.', {
		socksPort,
		url,
		exitCode,
		statusCode,
		timeTotal,
		sizeDownload: Number(sizeDownload)
	});

	return {
		exitCode,
		stdout: output,
		stderr,
		statusCode,
		timeTotal,
		sizeDownload: Number(sizeDownload)
	};
}

export async function createTemporaryProxySession(configUrl: string): Promise<TemporaryProxySession> {
	const parsed = parseVlessUri(configUrl);
	const socksPort = getRandomPort();
	const probeId = crypto.randomUUID();
	const configPath = resolve(probeDirectory, `${probeId}.json`);
	const binaryPath = await getXrayBinaryPath();

	mkdirSync(probeDirectory, { recursive: true });
	await writeFile(configPath, JSON.stringify(createXrayConfig(parsed, socksPort), null, 2));
	proxyLogger.debug('Created temporary Xray config.', {
		socksPort,
		configPath,
		address: parsed.address,
		port: parsed.port,
		network: parsed.network,
		security: parsed.security
	});

	const process = spawnProcess([binaryPath, 'run', '-c', configPath], {
		stdout: 'ignore',
		stderr: 'pipe'
	});
	proxyLogger.debug('Spawned Xray probe process.', {
		socksPort,
		configPath,
		binaryPath,
		pid: process.pid
	});

	try {
		await waitForLocalPort(socksPort);
		proxyLogger.debug('Temporary proxy session is ready.', {
			socksPort,
			configPath,
			pid: process.pid
		});
	} catch (error) {
		const stderr = await readStreamText(process.stderr);
		await terminateProcess(process);
		rmSync(configPath, { force: true });
		proxyLogger.error('Temporary proxy session failed to start.', {
			socksPort,
			configPath,
			binaryPath,
			pid: process.pid,
			stderr: stderr.trim() || null,
			error: error instanceof Error ? error : undefined
		});
		throw error;
	}

	return {
		socksPort,
		process,
		configPath,
		cleanup: async () => {
			await terminateProcess(process);
			rmSync(configPath, { force: true });
			proxyLogger.debug('Cleaned up temporary proxy session.', {
				socksPort,
				configPath,
				pid: process.pid
			});
		}
	};
}
