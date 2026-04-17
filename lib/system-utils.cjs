const path = require('node:path');

function pad(value) {
  return String(value).padStart(2, '0');
}

function timestampForFile(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('') + '-' + [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('');
}

function buildLogFilePath(outputDir, date = new Date()) {
  return path.join(String(outputDir), `MediaScribe-log-${timestampForFile(date)}.txt`).replace(/\\/g, '/');
}

function inspectEnginePaths({ engineRoot, runnerExists = false, installerExists = false, moduleInstalled = false, pythonExists = false, bootstrapAvailable = false }) {
  const root = String(engineRoot);
  return {
    engineRoot: root,
    runnerScript: path.win32.join(root, 'run_transcribe.ps1'),
    installerScript: path.win32.join(root, 'install_whisper_windows.bat'),
    ready: Boolean(runnerExists),
    installerAvailable: Boolean(installerExists),
    moduleInstalled: Boolean(moduleInstalled),
    pythonExists: Boolean(pythonExists),
    bootstrapAvailable: Boolean(bootstrapAvailable),
  };
}

function shouldRetryTranscriptionError(message, attemptCount = 0) {
  const text = String(message || '').toLowerCase();
  if (attemptCount >= 1) {
    return false;
  }
  return text.includes("no module named 'faster_whisper'") || text.includes('no module named faster_whisper');
}

module.exports = {
  buildLogFilePath,
  inspectEnginePaths,
  shouldRetryTranscriptionError,
  timestampForFile,
};
