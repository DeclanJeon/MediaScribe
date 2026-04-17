import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTranscriptionCommands,
  classifyMediaFile,
  isSupportedMediaFile,
  normalizeOutputFormats,
} from '../lib/desktop-utils.cjs';

test('classifyMediaFile recognizes audio and video extensions', () => {
  assert.equal(classifyMediaFile('sample.mp3'), 'audio');
  assert.equal(classifyMediaFile('movie.MP4'), 'video');
  assert.equal(classifyMediaFile('notes.txt'), 'unsupported');
});

test('isSupportedMediaFile returns true only for supported media files', () => {
  assert.equal(isSupportedMediaFile('voice.m4a'), true);
  assert.equal(isSupportedMediaFile('clip.webm'), true);
  assert.equal(isSupportedMediaFile('archive.zip'), false);
});

test('normalizeOutputFormats trims, deduplicates, and preserves supported formats', () => {
  assert.deepEqual(normalizeOutputFormats('srt, txt, srt'), ['srt', 'txt']);
  assert.deepEqual(normalizeOutputFormats(''), ['srt', 'txt']);
});

test('buildTranscriptionCommands points to the bundled faster-whisper runner', () => {
  const commands = buildTranscriptionCommands({
    appRoot: 'C:/bundle/MediaScribe',
    inputFiles: ['C:/media/a.mp4', 'C:/media/b.mp3'],
    outputDir: 'C:/media/output',
    model: 'small',
    language: 'ko',
    outputFormats: ['srt', 'txt'],
  });

  assert.equal(commands.length, 2);
  assert.equal(commands[0].executable, 'powershell.exe');
  assert.ok(commands[0].args.includes('C:/bundle/MediaScribe/WhisperTranscriber/run_transcribe.ps1'));
  assert.ok(commands[0].args.includes('C:/media/a.mp4'));
  assert.ok(commands[1].args.includes('C:/media/b.mp3'));
  assert.ok(commands[0].args.includes('srt,txt'));
});

test('buildTranscriptionCommands omits the language flag when auto-detect is selected', () => {
  const commands = buildTranscriptionCommands({
    appRoot: 'C:/bundle/MediaScribe',
    inputFiles: ['C:/media/song.mp3'],
    outputDir: 'C:/media/output',
    model: 'small',
    language: '',
    outputFormats: ['txt'],
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0].args.includes('-Language'), false);
  assert.ok(commands[0].args.includes('txt'));
});
