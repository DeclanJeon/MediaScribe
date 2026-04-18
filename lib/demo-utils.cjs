const fs = require('node:fs');
const path = require('node:path');
const { classifyMediaFile } = require('./desktop-utils.cjs');

function toBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function normalizePath(value) {
  return String(value || '').trim();
}

function resolveDemoSettings(env = process.env) {
  return {
    filePath: normalizePath(env.MEDIASCRIBE_DEMO_FILE),
    autoStart: toBoolean(env.MEDIASCRIBE_DEMO_AUTOSTART),
    captureReadyPath: normalizePath(env.MEDIASCRIBE_DEMO_CAPTURE_READY_PATH),
    captureDonePath: normalizePath(env.MEDIASCRIBE_DEMO_CAPTURE_DONE_PATH),
    exitAfterCapture: toBoolean(env.MEDIASCRIBE_DEMO_EXIT_AFTER_CAPTURE),
  };
}

function buildDemoPickedFile(filePath) {
  const normalizedPath = normalizePath(filePath);
  if (!normalizedPath || !fs.existsSync(normalizedPath)) {
    return null;
  }

  const type = classifyMediaFile(normalizedPath);
  if (type === 'unsupported') {
    return null;
  }

  return {
    path: normalizedPath,
    name: path.basename(normalizedPath),
    type,
    size: fs.statSync(normalizedPath).size,
  };
}

module.exports = {
  buildDemoPickedFile,
  resolveDemoSettings,
};
