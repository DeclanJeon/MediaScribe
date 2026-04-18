import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildDemoPickedFile,
  resolveDemoSettings,
} from '../lib/demo-utils.cjs';

test('buildDemoPickedFile returns desktop file metadata for supported media files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediascribe-demo-'));
  const demoFile = path.join(tempDir, 'sample.mp3');
  fs.writeFileSync(demoFile, 'demo-audio', 'utf8');

  const result = buildDemoPickedFile(demoFile);

  assert.deepEqual(result, {
    path: demoFile,
    name: 'sample.mp3',
    type: 'audio',
    size: Buffer.byteLength('demo-audio'),
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('buildDemoPickedFile returns null for missing or unsupported files', () => {
  assert.equal(buildDemoPickedFile('C:/missing/file.mp3'), null);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediascribe-demo-'));
  const unsupportedFile = path.join(tempDir, 'notes.txt');
  fs.writeFileSync(unsupportedFile, 'not-media', 'utf8');

  assert.equal(buildDemoPickedFile(unsupportedFile), null);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('resolveDemoSettings normalizes env-driven demo capture options', () => {
  const settings = resolveDemoSettings({
    MEDIASCRIBE_DEMO_FILE: 'C:/Users/Administrator/Desktop/remix/song.mp3',
    MEDIASCRIBE_DEMO_AUTOSTART: '1',
    MEDIASCRIBE_DEMO_CAPTURE_READY_PATH: 'C:/captures/ready.png',
    MEDIASCRIBE_DEMO_CAPTURE_DONE_PATH: 'C:/captures/done.png',
    MEDIASCRIBE_DEMO_EXIT_AFTER_CAPTURE: 'true',
  });

  assert.deepEqual(settings, {
    filePath: 'C:/Users/Administrator/Desktop/remix/song.mp3',
    autoStart: true,
    captureReadyPath: 'C:/captures/ready.png',
    captureDonePath: 'C:/captures/done.png',
    exitAfterCapture: true,
  });
});

test('resolveDemoSettings falls back to disabled defaults', () => {
  assert.deepEqual(resolveDemoSettings({}), {
    filePath: '',
    autoStart: false,
    captureReadyPath: '',
    captureDonePath: '',
    exitAfterCapture: false,
  });
});
