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
  getOfflineBundleRoot,
  getOfflineModelCacheRoot,
  getOfflinePythonInstallerPath,
  getOfflineWheelhouseRoot,
  getPythonExePath,
  getPythonInstallRoot,
  getPythonInstallerUrl,
  getVenvRoot,
  getWritableEngineRoot,
  resolveOfflineMode,
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

test('runtime bootstrap helpers describe offline bundle paths and commands', () => {
  const engineRoot = 'C:/Users/test/AppData/Roaming/MediaScribe/WhisperTranscriber';

  assert.equal(getPythonInstallerUrl('3.12.9'), 'https://www.python.org/ftp/python/3.12.9/python-3.12.9-amd64.exe');
  assert.equal(getOfflineBundleRoot(engineRoot), 'C:\\Users\\test\\AppData\\Roaming\\MediaScribe\\WhisperTranscriber\\offline');
  assert.equal(getOfflinePythonInstallerPath(engineRoot), 'C:\\Users\\test\\AppData\\Roaming\\MediaScribe\\WhisperTranscriber\\offline\\python\\python-3.12.9-amd64.exe');
  assert.equal(getOfflineWheelhouseRoot(engineRoot), 'C:\\Users\\test\\AppData\\Roaming\\MediaScribe\\WhisperTranscriber\\offline\\wheelhouse');
  assert.equal(getOfflineModelCacheRoot(engineRoot), 'C:\\Users\\test\\AppData\\Roaming\\MediaScribe\\WhisperTranscriber\\offline\\model-cache');
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
  assert.deepEqual(buildPipUpgradeArgs(['faster-whisper'], {
    offline: true,
    wheelhouseDir: 'C:/bundle/WhisperTranscriber/offline/wheelhouse',
  }), [
    '-m',
    'pip',
    'install',
    '--upgrade',
    '--no-index',
    '--find-links',
    'C:/bundle/WhisperTranscriber/offline/wheelhouse',
    'faster-whisper',
  ]);
  assert.deepEqual(buildPythonImportCheckArgs(), ['-c', 'import faster_whisper']);
  assert.equal(describeBootstrapPaths(engineRoot).offlineWheelhouseRoot, 'C:\\Users\\test\\AppData\\Roaming\\MediaScribe\\WhisperTranscriber\\offline\\wheelhouse');
});

test('runtime bootstrap helpers detect offline mode flags and env vars', () => {
  assert.equal(resolveOfflineMode({ argv: ['node', 'app', '--offline'] }), true);
  assert.equal(resolveOfflineMode({ argv: ['node', 'app'], env: { MEDIASCRIBE_OFFLINE: '1' } }), true);
  assert.equal(resolveOfflineMode({ argv: ['node', 'app'], env: { WHISPERTRANSCRIBER_OFFLINE: 'true' } }), true);
  assert.equal(resolveOfflineMode({ argv: ['node', 'app'] }), false);
});
