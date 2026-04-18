import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const mainSource = fs.readFileSync(path.resolve('./electron/main.cjs'), 'utf8');
const preloadSource = fs.readFileSync(path.resolve('./electron/preload.cjs'), 'utf8');
const pageSource = fs.readFileSync(path.resolve('./app/page.tsx'), 'utf8');
const typeSource = fs.readFileSync(path.resolve('./types/global.d.ts'), 'utf8');

test('electron main exposes demo metadata and window capture support', () => {
  assert.match(mainSource, /resolveDemoSettings/);
  assert.match(mainSource, /buildDemoPickedFile/);
  assert.match(mainSource, /ipcMain\.handle\('window:capture'/);
  assert.match(mainSource, /capturePage\(/);
  assert.match(mainSource, /demo:\s*\{/);
});

test('preload and global typing expose demo settings without exposing capture IPC to the renderer surface', () => {
  assert.doesNotMatch(preloadSource, /captureWindow:\s*\(payload\)/);
  assert.match(typeSource, /interface DesktopDemoSettings/);
  assert.doesNotMatch(typeSource, /captureWindow:\s*\(payload:/);
  assert.match(typeSource, /demo:\s*DesktopDemoSettings/);
});

test('renderer remains production-focused while main process owns demo automation hooks', () => {
  assert.doesNotMatch(pageSource, /const \[demoSettings, setDemoSettings\] = useState<DesktopDemoSettings \| null>/);
  assert.doesNotMatch(pageSource, /captureDemoFrame/);
  assert.doesNotMatch(pageSource, /state\.demo\?\.file/);

  assert.match(mainSource, /runDemoAutomation/);
  assert.match(mainSource, /document\.body\.innerText\.includes/);
  assert.match(mainSource, /buildDemoPickedFile\(demoSettings\.filePath\)/);
});
