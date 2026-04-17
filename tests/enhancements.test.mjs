import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildLogFilePath, inspectEnginePaths } from '../lib/system-utils.cjs';

const packageJson = JSON.parse(fs.readFileSync(path.resolve('./package.json'), 'utf8'));

test('nsis installer config is localized and user-friendly', () => {
  assert.equal(packageJson.build.nsis.oneClick, false);
  assert.equal(packageJson.build.nsis.language, '1042');
  assert.equal(packageJson.build.nsis.displayLanguageSelector, false);
  assert.equal(packageJson.build.nsis.warningsAsErrors, false);
});

test('buildLogFilePath creates a timestamped log file path inside chosen output directory', () => {
  const result = buildLogFilePath('C:/temp/output');

  assert.match(result, /^C:\/temp\/output\/MediaScribe-log-\d{8}-\d{6}\.txt$/);
});

test('inspectEnginePaths reports install and runner availability', () => {
  const status = inspectEnginePaths({
    engineRoot: 'C:/bundle/WhisperTranscriber',
    runnerExists: true,
    installerExists: false,
  });

  assert.equal(status.ready, true);
  assert.equal(status.runnerScript.endsWith('run_transcribe.ps1'), true);
  assert.equal(status.installerAvailable, false);
});
