import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve('.');
const transcribeScript = path.join(repoRoot, 'WhisperTranscriber', 'transcribe_media.py');
const installScript = fs.readFileSync(path.join(repoRoot, 'WhisperTranscriber', 'install_whisper_windows.ps1'), 'utf8');
const runnerScript = fs.readFileSync(path.join(repoRoot, 'WhisperTranscriber', 'run_transcribe.ps1'), 'utf8');
const electronMain = fs.readFileSync(path.join(repoRoot, 'electron', 'main.cjs'), 'utf8');

test('prime-model command warms the default model cache without needing media input', () => {
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediascribe-prime-'));
  fs.writeFileSync(
    path.join(stubDir, 'faster_whisper.py'),
    [
      'class WhisperModel:',
      "    def __init__(self, model_name, device='auto', compute_type=None):",
      "        assert model_name == 'small', model_name",
      "        assert device == 'auto', device",
      "        assert compute_type == 'int8', compute_type",
      '',
    ].join('\n'),
    'utf8',
  );

  const result = spawnSync('python3', [transcribeScript, '--prime-model', 'small'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PYTHONPATH: stubDir,
    },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /APP_EVENT\|.*"type":\s*"model_prime_start"/);
  assert.match(result.stdout, /APP_EVENT\|.*"type":\s*"model_prime_complete"/);
});

test('installer and repair scripts prime the default model non-fatally', () => {
  assert.match(installScript, /Invoke-ModelCachePrime/);
  assert.match(installScript, /--prime-model \$ModelName/);
  assert.match(installScript, /continuing without blocking installation/);

  assert.match(runnerScript, /Warm-DefaultModelCache/);
  assert.match(runnerScript, /--prime-model \$ModelName/);
  assert.match(runnerScript, /continuing with transcription/);

  assert.match(electronMain, /primeDefaultModelCache\(engineRoot, 'small', session\)/);
  assert.match(electronMain, /model_prime_failed/);
});
