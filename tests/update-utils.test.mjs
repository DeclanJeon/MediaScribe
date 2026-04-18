import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compareVersions,
  getReleaseApiUrl,
  isPortableEnvironment,
  selectReleaseAsset,
} from '../lib/update-utils.cjs';

test('compareVersions handles GitHub-style tags and semantic ordering', () => {
  assert.equal(compareVersions('v1.3.2', '1.3.2'), 0);
  assert.equal(compareVersions('v1.3.3', '1.3.2'), 1);
  assert.equal(compareVersions('1.3.2', 'v1.4.0'), -1);
});

test('getReleaseApiUrl targets the GitHub latest release endpoint', () => {
  assert.equal(
    getReleaseApiUrl({ owner: 'DeclanJeon', repo: 'MediaScribe' }),
    'https://api.github.com/repos/DeclanJeon/MediaScribe/releases/latest',
  );
});

test('isPortableEnvironment detects portable Electron runtime markers', () => {
  assert.equal(isPortableEnvironment({ PORTABLE_EXECUTABLE_FILE: 'C:/MediaScribe-Portable.exe' }), true);
  assert.equal(isPortableEnvironment({ PORTABLE_EXECUTABLE_DIR: 'C:/PortableApp' }), true);
  assert.equal(isPortableEnvironment({}), false);
});

test('selectReleaseAsset picks installer or portable artifacts based on environment', () => {
  const release = {
    tag_name: 'v1.3.3',
    assets: [
      { name: 'MediaScribe-Portable.exe', browser_download_url: 'https://example.com/portable.exe' },
      { name: 'MediaScribe-Setup.exe', browser_download_url: 'https://example.com/setup.exe' },
      { name: 'MediaScribe-macOS-arm64.zip', browser_download_url: 'https://example.com/mac.zip' },
      { name: 'MediaScribe-linux-x86_64.AppImage', browser_download_url: 'https://example.com/linux.AppImage' },
    ],
  };

  assert.equal(
    selectReleaseAsset(release, { platform: 'win32', env: { PORTABLE_EXECUTABLE_FILE: 'C:/MediaScribe-Portable.exe' } }).name,
    'MediaScribe-Portable.exe',
  );
  assert.equal(selectReleaseAsset(release, { platform: 'win32', env: {} }).name, 'MediaScribe-Setup.exe');
  assert.equal(selectReleaseAsset(release, { platform: 'darwin', env: {} }).name, 'MediaScribe-macOS-arm64.zip');
  assert.equal(selectReleaseAsset(release, { platform: 'linux', env: {} }).name, 'MediaScribe-linux-x86_64.AppImage');
});
