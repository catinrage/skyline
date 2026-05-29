import { env } from '$env/dynamic/private';
import chalk from 'chalk';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type LogLevelName = 'debug' | 'info' | 'warning' | 'error';

interface LogMetadata {
	[key: string]: unknown;
}

interface LogEntry {
	timestamp: string;
	level: LogLevelName;
	context: string;
	message: string;
	metadata?: LogMetadata;
}

const levelPriority: Record<LogLevelName, number> = {
	debug: 10,
	info: 20,
	warning: 30,
	error: 40
};

function normalizeLogLevel(value: string | undefined): LogLevelName {
	const normalized = value?.trim().toLowerCase();

	if (normalized === 'warn') {
		return 'warning';
	}

	if (normalized === 'debug' || normalized === 'info' || normalized === 'warning' || normalized === 'error') {
		return normalized;
	}

	return 'warning';
}

function resolveLogFilePath(value: string | undefined) {
	const trimmed = value?.trim();

	if (!trimmed) {
		return null;
	}

	return trimmed.startsWith('/') ? trimmed : resolve(process.cwd(), trimmed);
}

function serializeError(error: Error): LogMetadata {
	return {
		name: error.name,
		message: error.message,
		stack: error.stack
	};
}

function normalizeMetadata(metadata: unknown): LogMetadata | undefined {
	if (metadata === undefined) {
		return undefined;
	}

	if (metadata instanceof Error) {
		return serializeError(metadata);
	}

	if (Array.isArray(metadata)) {
		return { items: metadata };
	}

	if (metadata && typeof metadata === 'object') {
		return metadata as LogMetadata;
	}

	return { value: metadata };
}

class Logger {
	private level = normalizeLogLevel(env.LOG_LEVEL);
	private filePath = resolveLogFilePath(env.LOG_FILE);

	configure(options: { level?: string; filePath?: string }) {
		this.level = normalizeLogLevel(options.level);
		this.filePath = resolveLogFilePath(options.filePath);
	}

	isLevelEnabled(level: LogLevelName) {
		return levelPriority[level] >= levelPriority[this.level];
	}

	child(context: string) {
		return {
			debug: (message: string, metadata?: unknown) => this.debug(context, message, metadata),
			info: (message: string, metadata?: unknown) => this.info(context, message, metadata),
			warn: (message: string, metadata?: unknown) => this.warn(context, message, metadata),
			error: (message: string, metadata?: unknown) => this.error(context, message, metadata)
		};
	}

	debug(context: string, message: string, metadata?: unknown) {
		this.log('debug', context, message, metadata);
	}

	info(context: string, message: string, metadata?: unknown) {
		this.log('info', context, message, metadata);
	}

	warn(context: string, message: string, metadata?: unknown) {
		this.log('warning', context, message, metadata);
	}

	error(context: string, message: string, metadata?: unknown) {
		this.log('error', context, message, metadata);
	}

	private log(level: LogLevelName, context: string, message: string, metadata?: unknown) {
		if (!this.isLevelEnabled(level)) {
			return;
		}

		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			context,
			message,
			metadata: normalizeMetadata(metadata)
		};

		const line = this.formatConsoleLine(entry);

		if (level === 'error') {
			console.error(line);
		} else if (level === 'warning') {
			console.warn(line);
		} else {
			console.log(line);
		}

		this.writeToFile(entry);
	}

	private formatConsoleLine(entry: LogEntry) {
		const colorize = this.getColorizer(entry.level);
		const header = `${chalk.gray(entry.timestamp)} ${colorize(entry.level.toUpperCase().padEnd(7))} ${chalk.cyan(`[${entry.context}]`)}`;
		const metadata = entry.metadata ? ` ${chalk.gray(JSON.stringify(entry.metadata))}` : '';

		return `${header} ${entry.message}${metadata}`;
	}

	private getColorizer(level: LogLevelName) {
		switch (level) {
			case 'debug':
				return chalk.blueBright;
			case 'info':
				return chalk.green;
			case 'warning':
				return chalk.yellow;
			case 'error':
				return chalk.redBright;
		}
	}

	private writeToFile(entry: LogEntry) {
		if (!this.filePath) {
			return;
		}

		try {
			mkdirSync(dirname(this.filePath), { recursive: true });
			appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, 'utf8');
		} catch (error) {
			const serialized = error instanceof Error ? JSON.stringify(serializeError(error)) : String(error);
			console.error(`Failed to write log file ${this.filePath}: ${serialized}`);
		}
	}
}

export const logger = new Logger();
