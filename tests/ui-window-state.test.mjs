import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const mainSource = fs.readFileSync(path.resolve('./electron/main.cjs'), 'utf8');
const preloadSource = fs.readFileSync(path.resolve('./electron/preload.cjs'), 'utf8');
const pageSource = fs.readFileSync(path.resolve('./app/page.tsx'), 'utf8');
const typeSource = fs.readFileSync(path.resolve('./types/global.d.ts'), 'utf8');

test('desktop window opens at an optimized default size instead of forcing maximize on launch', () => {
  assert.match(mainSource, /width:\s*1440/);
  assert.match(mainSource, /height:\s*920/);
  assert.match(mainSource, /minWidth:\s*1080/);
  assert.match(mainSource, /minHeight:\s*720/);

  const readyToShowBlock = mainSource.match(/mainWindow\.once\('ready-to-show', \(\) => \{([\s\S]*?)\n\s*\}\);/);
  assert.ok(readyToShowBlock, 'ready-to-show handler should exist');
  assert.match(readyToShowBlock[0], /mainWindow\.show\(\);/);
  assert.match(readyToShowBlock[0], /broadcastWindowState\(\);/);
  assert.doesNotMatch(readyToShowBlock[0], /mainWindow\.maximize\(\);/);
});

test('electron preload exposes window state APIs for responsive titlebar controls', () => {
  assert.match(preloadSource, /getWindowState:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('window:get-state'\)/);
  assert.match(preloadSource, /onWindowStateChange:\s*\(callback\)\s*=>\s*\{/);
  assert.match(preloadSource, /ipcRenderer\.on\('window:state-change', listener\)/);
});

test('global desktop API typing includes window state subscription', () => {
  assert.match(typeSource, /interface DesktopWindowState/);
  assert.match(typeSource, /isMaximized:\s*boolean/);
  assert.match(typeSource, /isMinimized:\s*boolean/);
  assert.match(typeSource, /getWindowState:\s*\(\)\s*=>\s*Promise<DesktopWindowState>/);
  assert.match(typeSource, /onWindowStateChange:\s*\(callback:\s*\(payload:\s*DesktopWindowState\)\s*=>\s*void\)\s*=>\s*\(\)\s*=>\s*void/);
});

test('renderer toggles the maximize button icon based on live window state and keeps a single primary upload CTA', () => {
  assert.match(pageSource, /const \[windowState, setWindowState\] = useState<DesktopWindowState>/);
  assert.match(pageSource, /windowState\.isMaximized \? <Copy className=\"h-4 w-4\" \/> : <Square className=\"h-4 w-4\" \/>/);

  const uploadLabelMatches = [...pageSource.matchAll(/'파일 업로드'/g)];
  assert.equal(uploadLabelMatches.length, 1);
});
