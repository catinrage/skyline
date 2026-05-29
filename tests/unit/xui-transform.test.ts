import test from 'node:test';
import assert from 'node:assert/strict';

import {
	classifyPanelHost,
	getActivationExpiryDays,
	getStatus,
	normalizeExpiry,
	parseJson,
	summarizeClients,
	summarizeInbounds
} from '../../src/lib/server/xui-transform.ts';
import type { VpnClientUsage } from '../../src/lib/types/vpn.ts';

function makeClient(overrides: Partial<VpnClientUsage> = {}): VpnClientUsage {
	return {
		uuid: 'uuid',
		email: 'user@example.com',
		inboundRemark: 'inbound',
		upBytes: 0,
		downBytes: 0,
		usedBytes: 0,
		totalBytes: null,
		remainingBytes: null,
		usageRatio: null,
		expiresAt: null,
		activationExpiryDays: null,
		enabled: true,
		status: 'active',
		configUrl: null,
		configQrCodeDataUrl: null,
		isOnline: null,
		...overrides
	};
}

test('parseJson returns null for nullish input', () => {
	assert.equal(parseJson(null), null);
	assert.equal(parseJson(undefined), null);
});

test('parseJson returns objects as-is (3x-ui now sends parsed objects)', () => {
	const obj = { clients: [{ id: 'a' }] };
	assert.equal(parseJson(obj), obj);
	const arr = [1, 2, 3];
	assert.equal(parseJson(arr as unknown as object), arr);
});

test('parseJson parses valid JSON strings', () => {
	assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
});

test('parseJson returns null for invalid JSON strings', () => {
	assert.equal(parseJson('not json'), null);
});

test('normalizeExpiry rejects empty / non-timestamp values', () => {
	assert.equal(normalizeExpiry(undefined), null);
	assert.equal(normalizeExpiry(0), null);
	assert.equal(normalizeExpiry(-5), null);
	assert.equal(normalizeExpiry(500), null); // duration, not a timestamp
});

test('normalizeExpiry converts second and millisecond timestamps', () => {
	assert.equal(normalizeExpiry(1_700_000_000), new Date(1_700_000_000 * 1000).toISOString());
	assert.equal(normalizeExpiry(1_700_000_000_000), new Date(1_700_000_000_000).toISOString());
});

test('getActivationExpiryDays prefers explicit day fields', () => {
	assert.equal(getActivationExpiryDays({ expiryDays: 30 }), 30);
	assert.equal(getActivationExpiryDays({ totalDays: 7 }), 7);
	assert.equal(getActivationExpiryDays({ day: 15 }), 15);
});

test('getActivationExpiryDays derives days from duration-shaped expiryTime', () => {
	assert.equal(getActivationExpiryDays({ expiryTime: 30 * 60 * 60 * 24 }), 30); // seconds
	assert.equal(getActivationExpiryDays({ expiryTime: 30 * 60 * 60 * 24 * 1000 }), 30); // ms
});

test('getActivationExpiryDays returns null for real timestamps and empty input', () => {
	assert.equal(getActivationExpiryDays({ expiryTime: 1_700_000_001 }), null);
	assert.equal(getActivationExpiryDays({}), null);
});

test('classifyPanelHost classifies loopback / private / public / unknown', () => {
	for (const h of ['localhost', '127.0.0.1', '::1']) {
		assert.equal(classifyPanelHost(h), 'loopback');
	}
	for (const h of ['10.0.0.5', '192.168.1.1', '172.16.0.1', '172.31.255.255']) {
		assert.equal(classifyPanelHost(h), 'private');
	}
	for (const h of ['172.15.0.1', '8.8.8.8', 'example.com']) {
		assert.equal(classifyPanelHost(h), 'public');
	}
	assert.equal(classifyPanelHost(''), 'unknown');
});

test('getStatus resolves the right lifecycle state', () => {
	const past = new Date(Date.now() - 1000).toISOString();
	const future = new Date(Date.now() + 1_000_000).toISOString();
	assert.equal(getStatus(true, past, 50, 100), 'expired');
	assert.equal(getStatus(true, null, null, null), 'active');
	assert.equal(getStatus(false, null, null, null), 'disabled');
	assert.equal(getStatus(true, null, 0, 100), 'depleted');
	assert.equal(getStatus(false, null, 50, 100), 'disabled');
	assert.equal(getStatus(true, future, 50, 100), 'active');
});

test('summarizeClients aggregates quota and usage across clients', () => {
	const clients = [
		makeClient({ status: 'active', totalBytes: 100, remainingBytes: 40, usedBytes: 60 }),
		makeClient({ status: 'active', totalBytes: 200, remainingBytes: 150, usedBytes: 50 }),
		makeClient({ status: 'disabled', totalBytes: null, usedBytes: 10 })
	];
	const summary = summarizeClients(clients);
	assert.equal(summary.totalClients, 3);
	assert.equal(summary.activeClients, 2);
	assert.equal(summary.activeLimitedClients, 2);
	assert.equal(summary.depletedClients, 0);
	assert.equal(summary.totalUsedBytes, 120);
	assert.equal(summary.totalQuotaBytes, 300);
	assert.equal(summary.activeLimitedRemainingBytes, 190);
	assert.equal(summary.expiringSoonClients, 0);
});

test('summarizeClients reports null quota when no limited plans exist', () => {
	const summary = summarizeClients([
		makeClient({ totalBytes: null }),
		makeClient({ totalBytes: null })
	]);
	assert.equal(summary.totalQuotaBytes, null);
	assert.equal(summary.activeLimitedRemainingBytes, null);
});

test('summarizeInbounds groups clients by remark and sorts by name', () => {
	const clients = [
		makeClient({ inboundRemark: 'A', status: 'active', totalBytes: 100, remainingBytes: 40 }),
		makeClient({ inboundRemark: 'A', status: 'active', totalBytes: 200, remainingBytes: 150 }),
		makeClient({ inboundRemark: 'B', status: 'disabled', totalBytes: null })
	];
	const result = summarizeInbounds(clients);
	assert.deepEqual(result, [
		{ remark: 'A', totalClients: 2, activeLimitedClients: 2, activeLimitedRemainingBytes: 190 },
		{ remark: 'B', totalClients: 1, activeLimitedClients: 0, activeLimitedRemainingBytes: null }
	]);
});
