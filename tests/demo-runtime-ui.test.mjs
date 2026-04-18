import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const mainSource = fs.readFileSync(path.resolve('./electron/main.cjs'), 'utf8');
const preloadSource = fs.readFileSync(path.resolve('./electron/preload.cjs'), 'utf8');
const pageSource = fs.readFileSync(path.resolve('./app/page.tsx'), 'utf8');
const typeSource = fs.readFileSync(path.resolve('./types/global.d.ts'), 'utf8');

test('electron main exposes demo metadata, window capture support, and GitHub-backed updater hooks', () => {
  assert.match(mainSource, /resolveDemoSettings/);
  assert.match(mainSource, /buildDemoPickedFile/);
  assert.match(mainSource, /ipcMain\.handle\('window:capture'/);
  assert.match(mainSource, /capturePage\(/);
  assert.match(mainSource, /demo:\s*\{/);
  assert.match(mainSource, /checkForAppUpdates/);
  assert.match(mainSource, /applyDownloadedUpdate/);
  assert.match(mainSource, /selectReleaseAsset/);
  assert.match(mainSource, /updateState:\s*getUpdateState\(\)/);
  assert.match(mainSource, /mainWindow\.webContents\.send\('update:state-change'/);
});

test('preload and global typing expose demo settings without exposing capture IPC to the renderer surface', () => {
  assert.doesNotMatch(preloadSource, /captureWindow:\s*\(payload\)/);
  assert.match(typeSource, /interface DesktopDemoSettings/);
  assert.match(typeSource, /interface DesktopUpdateState/);
  assert.doesNotMatch(typeSource, /captureWindow:\s*\(payload:/);
  assert.match(typeSource, /demo:\s*DesktopDemoSettings/);
  assert.match(preloadSource, /onUpdateStateChange:\s*\(callback\)\s*=>\s*\{/);
  assert.match(typeSource, /updateState:\s*DesktopUpdateState/);
  assert.match(typeSource, /onUpdateStateChange:\s*\(callback:\s*\(payload:\s*DesktopUpdateState\)\s*=>\s*void\)\s*=>\s*\(\)\s*=>\s*void/);
});

test('renderer remains production-focused while main process owns demo automation hooks', () => {
  assert.doesNotMatch(pageSource, /const \[demoSettings, setDemoSettings\] = useState<DesktopDemoSettings \| null>/);
  assert.doesNotMatch(pageSource, /captureDemoFrame/);
  assert.doesNotMatch(pageSource, /state\.demo\?\.file/);
  assert.match(pageSource, /const \[updateState, setUpdateState\] = useState<DesktopUpdateState \| null>/);
  assert.match(pageSource, /mediaScribe\.onUpdateStateChange\(/);
  assert.match(pageSource, /업데이트 \{updateBadgeLabel\}/);

  assert.match(mainSource, /runDemoAutomation/);
  assert.match(mainSource, /document\.body\.innerText\.includes/);
  assert.match(mainSource, /buildDemoPickedFile\(demoSettings\.filePath\)/);
});
