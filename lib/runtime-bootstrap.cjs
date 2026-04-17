const path = require('node:path');

const DEFAULT_PYTHON_VERSION = '3.12.9';

function getBundledEngineRoot({ appPath, resourcesPath, isPackaged }) {
  return isPackaged
    ? path.win32.join(String(resourcesPath), 'WhisperTranscriber')
    : path.win32.resolve(String(appPath), '..', 'WhisperTranscriber');
}

function getWritableEngineRoot(userDataPath) {
  return path.win32.join(String(userDataPath), 'WhisperTranscriber');
}

function getPythonInstallRoot(engineRoot) {
  return path.win32.join(String(engineRoot), 'python');
}

function getVenvRoot(engineRoot) {
  return path.win32.join(String(engineRoot), 'venv');
}

function getPythonRuntimeExePath(engineRoot) {
  return path.win32.join(getPythonInstallRoot(engineRoot), 'python.exe');
}

function getPythonExePath(engineRoot) {
  return path.win32.join(getVenvRoot(engineRoot), 'Scripts', 'python.exe');
}

function getPythonInstallerUrl(version = DEFAULT_PYTHON_VERSION) {
  const safeVersion = String(version || DEFAULT_PYTHON_VERSION);
  return `https://www.python.org/ftp/python/${safeVersion}/python-${safeVersion}-amd64.exe`;
}

function buildPythonInstallerArgs(engineRoot, version = DEFAULT_PYTHON_VERSION) {
  const pythonInstallRoot = getPythonInstallRoot(engineRoot);
  return [
    '/quiet',
    'InstallAllUsers=0',
    'Include_launcher=1',
    'Include_pip=1',
    'Include_test=0',
    'PrependPath=0',
    `TargetDir=${pythonInstallRoot}`,
  ];
}

function buildVenvArgs(engineRoot) {
  return ['-m', 'venv', getVenvRoot(engineRoot)];
}

function buildPipUpgradeArgs(packages = ['pip', 'setuptools', 'wheel', 'faster-whisper']) {
  return ['-m', 'pip', 'install', '--upgrade', ...packages.map((item) => String(item))];
}

function buildPythonImportCheckArgs(moduleName = 'faster_whisper') {
  return ['-c', `import ${String(moduleName)}`];
}

function describeBootstrapPaths(engineRoot, version = DEFAULT_PYTHON_VERSION) {
  return {
    engineRoot: String(engineRoot),
    pythonInstallRoot: getPythonInstallRoot(engineRoot),
    pythonExe: getPythonExePath(engineRoot),
    pythonRuntimeExe: getPythonRuntimeExePath(engineRoot),
    venvRoot: getVenvRoot(engineRoot),
    installerUrl: getPythonInstallerUrl(version),
  };
}

module.exports = {
  DEFAULT_PYTHON_VERSION,
  buildPipUpgradeArgs,
  buildPythonImportCheckArgs,
  buildPythonInstallerArgs,
  buildVenvArgs,
  describeBootstrapPaths,
  getBundledEngineRoot,
  getPythonExePath,
  getPythonInstallRoot,
  getPythonInstallerUrl,
  getPythonRuntimeExePath,
  getVenvRoot,
  getWritableEngineRoot,
};
