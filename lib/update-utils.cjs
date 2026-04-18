const path = require('node:path');

const DEFAULT_OWNER = 'DeclanJeon';
const DEFAULT_REPO = 'MediaScribe';

function normalizeVersion(value) {
  return String(value || '')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0];
}

function compareVersions(left, right) {
  const leftParts = normalizeVersion(left).split('.').map((part) => Number.parseInt(part || '0', 10));
  const rightParts = normalizeVersion(right).split('.').map((part) => Number.parseInt(part || '0', 10));
  const size = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < size; index += 1) {
    const a = leftParts[index] || 0;
    const b = rightParts[index] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }

  return 0;
}

function getReleaseApiUrl({ owner = DEFAULT_OWNER, repo = DEFAULT_REPO } = {}) {
  return `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
}

function isPortableEnvironment(env = process.env) {
  return Boolean(env.PORTABLE_EXECUTABLE_FILE || env.PORTABLE_EXECUTABLE_DIR);
}

function selectReleaseAsset(release, { platform = process.platform, env = process.env } = {}) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];

  if (platform === 'win32') {
    const matcher = isPortableEnvironment(env)
      ? /^MediaScribe-Portable\.exe$/i
      : /^MediaScribe-Setup\.exe$/i;
    return assets.find((asset) => matcher.test(String(asset.name || ''))) || null;
  }

  if (platform === 'darwin') {
    return assets.find((asset) => /MediaScribe-macOS-.*\.(zip|dmg)$/i.test(String(asset.name || ''))) || null;
  }

  if (platform === 'linux') {
    return assets.find((asset) => /MediaScribe-linux-.*\.AppImage$/i.test(String(asset.name || ''))) || null;
  }

  return null;
}

function buildUpdateDownloadPath({ baseDir, version, assetName }) {
  return path.join(String(baseDir || ''), normalizeVersion(version), String(assetName || 'update.bin'));
}

module.exports = {
  DEFAULT_OWNER,
  DEFAULT_REPO,
  normalizeVersion,
  compareVersions,
  getReleaseApiUrl,
  isPortableEnvironment,
  selectReleaseAsset,
  buildUpdateDownloadPath,
};
