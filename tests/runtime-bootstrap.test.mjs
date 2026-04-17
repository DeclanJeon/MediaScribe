import test from 'node:test';
import assert from 'node:assert/strict';

import runtimeBootstrap from '../lib/runtime-bootstrap.cjs';

const {
  buildPipUpgradeArgs,
  buildPythonImportCheckArgs,
  buildPythonInstallerArgs,
  buildVenvArgs,
  describeBootstrapPaths,
  getBundledEngineRoot,
  getPythonExePath,
  getPythonInstallRoot,
  getPythonInstallerUrl,
  getVenvRoot,
  getWritableEngineRoot,
} = runtimeBootstrap;

test('runtime bootstrap helpers build Windows engine paths predictably', () => {
  const engineRoot = 'C:/Users/test/AppData/Roaming/MediaScribe/WhisperTranscriber';

  assert.equal(getPythonInstallRoot(engineRoot), 'C:\\Users\\test\\AppData\\Roaming\\MediaScribe\\WhisperTranscriber\\python');
  assert.equal(getVenvRoot(engineRoot), 'C:\\Users\\test\\AppData\\Roaming\\MediaScribe\\WhisperTranscriber\\venv');
  assert.equal(getPythonExePath(engineRoot), 'C:\\Users\\test\\AppData\\Roaming\\MediaScribe\\WhisperTranscriber\\venv\\Scripts\\python.exe');
  assert.equal(getWritableEngineRoot('C:/Users/test/AppData/Roaming/MediaScribe'), 'C:\\Users\\test\\AppData\\Roaming\\MediaScribe\\WhisperTranscriber');
  assert.equal(getBundledEngineRoot({ appPath: 'C:/bundle/MediaScribe', resourcesPath: 'C:/bundle/resources', isPackaged: false }), 'C:\\bundle\\MediaScribe\\WhisperTranscriber');
  assert.equal(getBundledEngineRoot({ appPath: 'C:/bundle/MediaScribe', resourcesPath: 'C:/bundle/resources', isPackaged: true }), 'C:\\bundle\\resources\\WhisperTranscriber');
});

test('runtime bootstrap helpers describe install commands', () => {
  const engineRoot = 'C:/Users/test/AppData/Roaming/MediaScribe/WhisperTranscriber';

  assert.equal(getPythonInstallerUrl('3.12.9'), 'https://www.python.org/ftp/python/3.12.9/python-3.12.9-amd64.exe');
  assert.deepEqual(buildPythonInstallerArgs(engineRoot), [
    '/quiet',
    'InstallAllUsers=0',
    'Include_launcher=1',
    'Include_pip=1',
    'Include_test=0',
    'PrependPath=0',
    'TargetDir=C:\\Users\\test\\AppData\\Roaming\\MediaScribe\\WhisperTranscriber\\python',
  ]);
  assert.deepEqual(buildVenvArgs(engineRoot), [
    '-m',
    'venv',
    'C:\\Users\\test\\AppData\\Roaming\\MediaScribe\\WhisperTranscriber\\venv',
  ]);
  assert.deepEqual(buildPipUpgradeArgs(['pip', 'faster-whisper']), [
    '-m',
    'pip',
    'install',
    '--upgrade',
    'pip',
    'faster-whisper',
  ]);
  assert.deepEqual(buildPythonImportCheckArgs(), ['-c', 'import faster_whisper']);
  assert.equal(describeBootstrapPaths(engineRoot).pythonExe, 'C:\\Users\\test\\AppData\\Roaming\\MediaScribe\\WhisperTranscriber\\venv\\Scripts\\python.exe');
});
