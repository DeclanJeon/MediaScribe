import test from 'node:test';
import assert from 'node:assert/strict';
import liveProgress from '../lib/live-progress.cjs';

const { describePhase, summarizeLiveLogs, filterLogsByLevel, buildTimelineItems, formatElapsedSeconds, findDetectedLanguage } = liveProgress;

test('describePhase returns user-friendly live step labels', () => {
  assert.equal(describePhase({ status: 'processing', phase: 'installing_dependency' }), '의존성 자동 복구 중');
  assert.equal(describePhase({ status: 'processing', phase: 'retrying', retryCount: 1 }), '자동 복구 후 재시도 1회차');
  assert.equal(describePhase({ status: 'done' }), '텍스트 추출 완료');
});

test('summarizeLiveLogs preserves latest lines in order', () => {
  const result = summarizeLiveLogs([
    { message: 'line 1' },
    { message: 'line 2' },
    { message: 'line 3' },
  ], 2);

  assert.deepEqual(result, ['line 2', 'line 3']);
});

test('filterLogsByLevel returns only requested log levels', () => {
  const logs = [
    { level: 'info', message: 'a' },
    { level: 'warn', message: 'b' },
    { level: 'error', message: 'c' },
  ];

  assert.deepEqual(filterLogsByLevel(logs, 'warn').map((item) => item.message), ['b']);
  assert.deepEqual(filterLogsByLevel(logs, 'all').map((item) => item.message), ['a', 'b', 'c']);
});

test('buildTimelineItems turns logs into readable timeline rows', () => {
  const items = buildTimelineItems([
    { timestamp: '10:00:00', level: 'info', fileName: 'a.mp3', message: '처리 시작' },
    { timestamp: '10:00:05', level: 'success', fileName: 'a.mp3', message: '텍스트 추출 완료' },
  ]);

  assert.equal(items.length, 2);
  assert.match(items[0].label, /a.mp3/);
  assert.match(items[1].description, /텍스트 추출 완료/);
});

test('formatElapsedSeconds returns m:ss format', () => {
  assert.equal(formatElapsedSeconds(4), '0:04');
  assert.equal(formatElapsedSeconds(83), '1:23');
});

test('findDetectedLanguage prefers structured metadata when available', () => {
  const detected = findDetectedLanguage([
    {
      level: 'info',
      fileName: '涙.mp3',
      message: '언어 감지 완료',
      meta: {
        eventType: 'detected_language',
        detectedLanguage: 'ja',
        languageProbability: 0.98,
      },
    },
  ], '涙.mp3');

  assert.deepEqual(detected, {
    code: 'ja',
    probability: 0.98,
    fileName: '涙.mp3',
  });
});
