import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const packageJson = JSON.parse(fs.readFileSync(path.resolve('./package.json'), 'utf8'));

test('electron-builder bundles desktop helper modules used by main process', () => {
  assert.ok(packageJson.build.files.includes('lib/demo-utils.cjs'));
  assert.ok(packageJson.build.files.includes('lib/update-utils.cjs'));
});
