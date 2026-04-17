import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import taggedOutput from '../lib/tagged-output.cjs';

const transcribeScript = fs.readFileSync(path.resolve('../WhisperTranscriber/transcribe_media.py'), 'utf8');
const electronMain = fs.readFileSync(path.resolve('./electron/main.cjs'), 'utf8');
const { parseTaggedOutputLine } = taggedOutput;

test('python transcriber emits tagged realtime transcript lines', () => {
  assert.match(transcribeScript, /TRANSCRIPT_LINE\|/);
});

test('python transcriber emits structured app event lines for process lifecycle logs', () => {
  assert.match(transcribeScript, /APP_EVENT\|/);
});

test('electron bridge parses tagged realtime transcript lines via shared parser', () => {
  assert.match(electronMain, /parseTaggedOutputLine/);
});

test('tagged output parser restores unicode transcript text from ascii-safe json', () => {
  const parsed = parseTaggedOutputLine('TRANSCRIPT_LINE|{"file_name":"\\u6d99.mp3","start":0.0,"end":1.0,"text":"\\u6d99 Dream"}', {
    path: 'C:/media/涙.mp3',
    name: '涙.mp3',
  }, 45);

  assert.equal(parsed.handled, true);
  assert.equal(parsed.status?.partialText, '涙 Dream');
  assert.equal(parsed.status?.transcriptSegment?.file_name, '涙.mp3');
});

test('tagged output parser turns structured lifecycle events into user-friendly logs', () => {
  const parsed = parseTaggedOutputLine('APP_EVENT|{"type":"file_done","file_name":"\\u6d99.mp3","outputs":{"txt":"C:/out/\\u6d99.txt","srt":"C:/out/\\u6d99.srt"}}', {
    path: 'C:/media/涙.mp3',
    name: '涙.mp3',
  }, 45);

  assert.equal(parsed.handled, true);
  assert.equal(parsed.log?.message, '처리 완료 · TXT, SRT 저장');
  assert.equal(parsed.status?.status, 'done');
  assert.equal(parsed.status?.outputFiles?.txt, 'C:/out/涙.txt');
});
