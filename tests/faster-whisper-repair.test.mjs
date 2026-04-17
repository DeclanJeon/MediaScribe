import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const runner = fs.readFileSync(path.resolve('../WhisperTranscriber/run_transcribe.ps1'), 'utf8');
const installer = fs.readFileSync(path.resolve('../install_whisper_windows.ps1'), 'utf8');

test('runner auto-recovers when faster_whisper module is missing', () => {
  assert.match(runner, /faster_whisper/);
  assert.match(runner, /pip install --upgrade faster-whisper/);
});

test('runner only forwards --language when an explicit override is present', () => {
  assert.match(runner, /if \(\$Language\)/);
});

test('installer verifies faster-whisper import after installation', () => {
  assert.match(installer, /import faster_whisper/);
});
