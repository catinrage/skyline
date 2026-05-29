import test from 'node:test';
import assert from 'node:assert/strict';

import {
	hashSecret,
	normalizePanelBasePath,
	normalizeUsername,
	nowSeconds,
	validatePanelBasePath
} from '../../scripts/sky-utils.mjs';

test('normalizeUsername trims and lowercases', () => {
	assert.equal(normalizeUsername('  ADMIN '), 'admin');
	assert.equal(normalizeUsername('MixedCase'), 'mixedcase');
	assert.equal(normalizeUsername(undefined), '');
});

test('normalizePanelBasePath strips surrounding slashes and lowercases', () => {
	assert.equal(normalizePanelBasePath('/Foo/'), 'foo');
	assert.equal(normalizePanelBasePath('MyPanel'), 'mypanel');
	assert.equal(normalizePanelBasePath('///'), '');
});

test('validatePanelBasePath accepts empty and valid paths', () => {
	assert.equal(validatePanelBasePath(''), '');
	assert.equal(validatePanelBasePath('   '), '');
	assert.equal(validatePanelBasePath('MyPanel'), 'mypanel');
	assert.equal(validatePanelBasePath('a1-b_2'), 'a1-b_2');
});

test('validatePanelBasePath rejects too-short and invalid characters', () => {
	assert.throws(() => validatePanelBasePath('ab'), /3-64 chars/);
	assert.throws(() => validatePanelBasePath('bad space'), /3-64 chars/);
	assert.throws(() => validatePanelBasePath('-leadinghyphen'), /3-64 chars/);
});

test('validatePanelBasePath rejects reserved paths', () => {
	assert.throws(() => validatePanelBasePath('manage'), /reserved/);
	assert.throws(() => validatePanelBasePath('api'), /reserved/);
	assert.throws(() => validatePanelBasePath('reseller'), /reserved/);
});

test('hashSecret produces a scrypt triple and is salted', async () => {
	const hash = await hashSecret('s3cret');
	const parts = hash.split('$');
	assert.equal(parts.length, 3);
	assert.equal(parts[0], 'scrypt');
	assert.ok(parts[1].length > 0);
	assert.ok(parts[2].length > 0);

	const other = await hashSecret('s3cret');
	assert.notEqual(hash, other); // random salt => different output for same input
});

test('nowSeconds returns an integer near the current epoch second', () => {
	const now = nowSeconds();
	assert.ok(Number.isInteger(now));
	assert.ok(Math.abs(now - Math.floor(Date.now() / 1000)) <= 1);
});
