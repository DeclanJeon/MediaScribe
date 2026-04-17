const path = require('node:path');

const DEFAULT_PYTHON_VERSION = '3.12.9';

function getBundledEngineRoot({ appPath, resourcesPath, isPackaged }) {
  return isPackaged
    ? path.win32.join(String(resourcesPath), 'WhisperTranscriber')
    : path.win32.resolve(String(appPath), 'WhisperTranscriber');
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

function getOfflineBundleRoot(engineRoot) {
  return path.win32.join(String(engineRoot), 'offline');
}

function getOfflinePythonInstallerPath(engineRoot, version = DEFAULT_PYTHON_VERSION) {
  const safeVersion = String(version || DEFAULT_PYTHON_VERSION);
  return path.win32.join(getOfflineBundleRoot(engineRoot), 'python', `python-${safeVersion}-amd64.exe`);
}

function getOfflineWheelhouseRoot(engineRoot) {
  return path.win32.join(getOfflineBundleRoot(engineRoot), 'wheelhouse');
}

function getOfflineModelCacheRoot(engineRoot) {
  return path.win32.join(getOfflineBundleRoot(engineRoot), 'model-cache');
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

function buildPipUpgradeArgs(packages = ['pip', 'setuptools', 'wheel', 'faster-whisper'], options = {}) {
  const args = ['-m', 'pip', 'install', '--upgrade'];
  const wheelhouseDir = options.wheelhouseDir ? String(options.wheelhouseDir) : '';
  const offline = Boolean(options.offline);

  if (offline) {
    args.push('--no-index');
  }
  if (wheelhouseDir) {
    args.push('--find-links', wheelhouseDir);
  }

  return args.concat(...packages.map((item) => String(item)));
}

function buildPythonImportCheckArgs(moduleName = 'faster_whisper') {
  return ['-c', `import ${String(moduleName)}`];
}

function buildModelPrimeArgs(modelName = 'small') {
  return ['--prime-model', String(modelName || 'small')];
}

function resolveOfflineMode({ argv = process.argv, env = process.env } = {}) {
  const normalizedEnv = String(env?.MEDIASCRIBE_OFFLINE ?? env?.WHISPERTRANSCRIBER_OFFLINE ?? '')
    .trim()
    .toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalizedEnv)) {
    return true;
  }

  return Array.isArray(argv) && argv.some((entry) => {
    const value = String(entry || '').toLowerCase();
    return value === '--offline' || value.startsWith('--offline=') || value === '--offline-mode' || value.startsWith('--offline-mode=');
  });
}

function describeBootstrapPaths(engineRoot, version = DEFAULT_PYTHON_VERSION) {
  return {
    engineRoot: String(engineRoot),
    pythonInstallRoot: getPythonInstallRoot(engineRoot),
    pythonExe: getPythonExePath(engineRoot),
    pythonRuntimeExe: getPythonRuntimeExePath(engineRoot),
    venvRoot: getVenvRoot(engineRoot),
    installerUrl: getPythonInstallerUrl(version),
    offlineBundleRoot: getOfflineBundleRoot(engineRoot),
    offlinePythonInstaller: getOfflinePythonInstallerPath(engineRoot, version),
    offlineWheelhouseRoot: getOfflineWheelhouseRoot(engineRoot),
    offlineModelCacheRoot: getOfflineModelCacheRoot(engineRoot),
  };
}

module.exports = {
  DEFAULT_PYTHON_VERSION,
  buildPipUpgradeArgs,
  buildModelPrimeArgs,
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
  getPythonRuntimeExePath,
  getVenvRoot,
  getWritableEngineRoot,
  resolveOfflineMode,
};

