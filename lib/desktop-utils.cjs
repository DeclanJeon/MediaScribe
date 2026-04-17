const path = require('node:path');

const AUDIO_EXTENSIONS = new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.wav', '.wma']);
const VIDEO_EXTENSIONS = new Set(['.avi', '.m4v', '.mkv', '.mov', '.mp4', '.mpeg', '.mpg', '.webm']);
const DEFAULT_OUTPUT_FORMATS = ['srt', 'txt'];

function extensionOf(filePath) {
  return path.extname(String(filePath || '')).toLowerCase();
}

function classifyMediaFile(filePath) {
  const extension = extensionOf(filePath);
  if (AUDIO_EXTENSIONS.has(extension)) {
    return 'audio';
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return 'video';
  }
  return 'unsupported';
}

function isSupportedMediaFile(filePath) {
  return classifyMediaFile(filePath) !== 'unsupported';
}

function normalizeOutputFormats(value) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

  const supported = [];
  for (const format of rawValues) {
    const normalized = String(format).toLowerCase();
    if (!DEFAULT_OUTPUT_FORMATS.includes(normalized)) {
      continue;
    }
    if (!supported.includes(normalized)) {
      supported.push(normalized);
    }
  }

  return supported.length > 0 ? supported : [...DEFAULT_OUTPUT_FORMATS];
}

function resolveEngineRoot(appRoot) {
  return path.win32.resolve(String(appRoot), 'WhisperTranscriber');
}

function buildTranscriptionCommands({
  appRoot,
  engineRoot,
  inputFiles,
  outputDir,
  model,
  language,
  outputFormats,
}) {
  const runnerRoot = engineRoot || resolveEngineRoot(appRoot);
  const runnerScript = path.join(runnerRoot, 'run_transcribe.ps1').replace(/\\/g, '/');
  const normalizedFormats = normalizeOutputFormats(outputFormats).join(',');

  return inputFiles.map((inputFile) => {
    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      runnerScript,
      '-InputFile',
      inputFile,
      '-OutputDir',
      outputDir,
      '-Model',
      model,
      '-OutputFormat',
      normalizedFormats,
    ];

    if (language) {
      args.push('-Language', language);
    }

    return {
      executable: 'powershell.exe',
      args,
    };
  });
}

module.exports = {
  AUDIO_EXTENSIONS,
  VIDEO_EXTENSIONS,
  DEFAULT_OUTPUT_FORMATS,
  classifyMediaFile,
  isSupportedMediaFile,
  normalizeOutputFormats,
  resolveEngineRoot,
  buildTranscriptionCommands,
};
