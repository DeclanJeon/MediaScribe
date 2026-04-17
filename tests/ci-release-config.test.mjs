import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const packageJson = JSON.parse(fs.readFileSync(path.resolve('./package.json'), 'utf8'));
const releaseConfig = JSON.parse(fs.readFileSync(path.resolve('./.releaserc.json'), 'utf8'));
const ciWorkflow = fs.readFileSync(path.resolve('./.github/workflows/ci.yml'), 'utf8');
const releaseVersionWorkflow = fs.readFileSync(path.resolve('./.github/workflows/release-version.yml'), 'utf8');
const releaseAssetsWorkflow = fs.readFileSync(path.resolve('./.github/workflows/release-assets.yml'), 'utf8');

test('package scripts include multi-platform distribution and semantic-release commands', () => {
  assert.equal(packageJson.scripts['dist:win'].includes('electron-builder --publish never --win'), true);
  assert.equal(packageJson.scripts['dist:mac'].includes('electron-builder --publish never --mac'), true);
  assert.equal(packageJson.scripts['dist:linux'].includes('electron-builder --publish never --linux'), true);
  assert.equal(packageJson.scripts.release, 'semantic-release');
});

test('electron-builder config includes windows, macOS, and linux targets', () => {
  assert.equal(packageJson.author.includes('@users.noreply.github.com'), true);
  assert.deepEqual(packageJson.build.win.target, ['portable', 'nsis']);
  assert.deepEqual(packageJson.build.mac.target, ['dmg', 'zip']);
  assert.deepEqual(packageJson.build.linux.target, ['AppImage', 'deb']);
  assert.equal(packageJson.build.productName, 'MediaScribe');
  assert.equal(packageJson.build.appId, 'com.hermes.mediascribe');
});

test('semantic-release config targets main branch and disables npm publishing', () => {
  assert.deepEqual(releaseConfig.branches, ['main']);
  const npmPlugin = releaseConfig.plugins.find((entry) => Array.isArray(entry) && entry[0] === '@semantic-release/npm');
  assert.equal(npmPlugin[1].npmPublish, false);
});

test('CI workflow runs on macOS, Windows, and Linux', () => {
  assert.match(ciWorkflow, /ubuntu-latest/);
  assert.match(ciWorkflow, /windows-latest/);
  assert.match(ciWorkflow, /macos-latest/);
  assert.match(ciWorkflow, /npm test/);
  assert.match(ciWorkflow, /npm run lint/);
  assert.match(ciWorkflow, /npm run build:web/);
});

test('release workflows use semantic-release and upload platform assets', () => {
  assert.match(releaseVersionWorkflow, /semantic-release/);
  assert.match(releaseAssetsWorkflow, /workflow_run:/);
  assert.match(releaseAssetsWorkflow, /Release Version/);
  assert.match(releaseAssetsWorkflow, /releases\/latest/);
  assert.match(releaseAssetsWorkflow, /MediaScribe-Portable\.exe/);
  assert.match(releaseAssetsWorkflow, /MediaScribe-macOS-\*\.dmg/);
  assert.match(releaseAssetsWorkflow, /MediaScribe-linux-\*\.AppImage/);
  assert.match(releaseAssetsWorkflow, /MediaScribe-offline-bundle\.zip/);
});
