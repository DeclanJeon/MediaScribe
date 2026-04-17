import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildProgressSnapshot, createLogEntry } from '../lib/progress-utils.cjs';

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve('./package.json'), 'utf8'),
);

test('electron-builder config includes portable and nsis installer targets', () => {
  assert.deepEqual(packageJson.build.win.target, ['portable', 'nsis']);
  assert.ok(packageJson.build.nsis);
  assert.equal(packageJson.build.nsis.oneClick, false);
});

test('buildProgressSnapshot returns total/completed/error counts and percent', () => {
  const snapshot = buildProgressSnapshot([
    { status: 'idle' },
    { status: 'processing', progress: 40 },
    { status: 'done', progress: 100 },
    { status: 'error', progress: 100 },
    { status: 'cancelled', progress: 25 },
  ]);

  assert.equal(snapshot.total, 5);
  assert.equal(snapshot.completed, 1);
  assert.equal(snapshot.failed, 1);
  assert.equal(snapshot.cancelled, 1);
  assert.equal(snapshot.active, 1);
  assert.equal(snapshot.percent, 68);
});

test('createLogEntry keeps timestamped human-readable messages', () => {
  const entry = createLogEntry('info', 'sample.mp4', '텍스트 추출을 시작했습니다.', '10:20:30');

  assert.equal(entry.level, 'info');
  assert.equal(entry.fileName, 'sample.mp4');
  assert.match(entry.message, /텍스트 추출을 시작했습니다/);
  assert.equal(entry.timestamp, '10:20:30');
});
