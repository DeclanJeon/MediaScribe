import test from 'node:test';
import assert from 'node:assert/strict';

import systemUtils from '../lib/system-utils.cjs';

const { inspectEnginePaths, shouldRetryTranscriptionError } = systemUtils;

test('inspectEnginePaths exposes faster-whisper installation state', () => {
  const status = inspectEnginePaths({
    engineRoot: 'C:/bundle/WhisperTranscriber',
    runnerExists: true,
    installerExists: true,
    moduleInstalled: false,
  });

  assert.equal(status.moduleInstalled, false);
  assert.equal(status.ready, true);
});

test('shouldRetryTranscriptionError only retries once for missing faster-whisper', () => {
  assert.equal(shouldRetryTranscriptionError("No module named 'faster_whisper'", 0), true);
  assert.equal(shouldRetryTranscriptionError("No module named 'faster_whisper'", 1), false);
  assert.equal(shouldRetryTranscriptionError('some other error', 0), false);
});
