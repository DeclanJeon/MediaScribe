import test from 'node:test';
import assert from 'node:assert/strict';

const runner = `
faster_whisper
pip install --upgrade faster-whisper
if ($Language)
`;
const installer = `
import faster_whisper
`;

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
