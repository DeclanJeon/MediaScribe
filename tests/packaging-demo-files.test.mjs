import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const packageJson = JSON.parse(fs.readFileSync(path.resolve('./package.json'), 'utf8'));

test('electron-builder bundles demo automation helper modules used by main process', () => {
  assert.ok(packageJson.build.files.includes('lib/demo-utils.cjs'));
});
