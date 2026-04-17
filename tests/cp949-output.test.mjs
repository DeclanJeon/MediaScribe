import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const transcribeScript = fs.readFileSync(path.resolve('../WhisperTranscriber/transcribe_media.py'), 'utf8');

test('transcriber configures stdout to avoid cp949 unicode crashes', () => {
  assert.match(transcribeScript, /reconfigure\(errors=['\"]backslashreplace['\"]\)/);
});

test('realtime transcript lines are emitted as ascii-safe json', () => {
  assert.match(transcribeScript, /json\.dumps\(payload, ensure_ascii=True\)/);
});
