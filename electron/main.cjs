const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { buildTranscriptionCommands, classifyMediaFile, normalizeOutputFormats } = require('../lib/desktop-utils.cjs');
const { createLogEntry } = require('../lib/progress-utils.cjs');
const { buildLogFilePath, inspectEnginePaths, shouldRetryTranscriptionError } = require('../lib/system-utils.cjs');
const { parseTaggedOutputLine } = require('../lib/tagged-output.cjs');
const { buildPipUpgradeArgs, buildModelPrimeArgs, buildPythonImportCheckArgs, buildPythonInstallerArgs, buildVenvArgs, describeBootstrapPaths, getBundledEngineRoot, getOfflineBundleRoot, getOfflineModelCacheRoot, getOfflinePythonInstallerPath, getOfflineWheelhouseRoot, getPythonExePath, getPythonRuntimeExePath, getWritableEngineRoot, resolveOfflineMode } = require('../lib/runtime-bootstrap.cjs');

const isDev = !app.isPackaged;
const offlineModeEnabled = resolveOfflineMode();
let mainWindow = null;
let activeTranscriptionSession = null;

function getOfflinePaths(engineRoot) {
  return {
    offlineBundleRoot: getOfflineBundleRoot(engineRoot),
    wheelhouseRoot: getOfflineWheelhouseRoot(engineRoot),
    modelCacheRoot: getOfflineModelCacheRoot(engineRoot),
    offlinePythonInstaller: getOfflinePythonInstallerPath(engineRoot),
  };
}

function getEngineRoot() {
  const writableRoot = getWritableEngineRoot(app.getPath('userData'));
  const writableRunner = path.join(writableRoot, 'run_transcribe.ps1');
  if (fs.existsSync(writableRunner)) {
    return writableRoot;
  }
  return getBundledEngineRoot({
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    isPackaged: app.isPackaged,
  });
}

function ensureEngineWorkspace() {
  if (!app.isPackaged) {
    return getEngineRoot();
  }

  const bundledRoot = getBundledEngineRoot({
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    isPackaged: app.isPackaged,
  });
  const writableRoot = getWritableEngineRoot(app.getPath('userData'));
  const writableRunner = path.join(writableRoot, 'run_transcribe.ps1');

  if (fs.existsSync(writableRunner)) {
    return writableRoot;
  }
  if (!fs.existsSync(bundledRoot)) {
    throw new Error(`WhisperTranscriber bundle not found: ${bundledRoot}`);
  }

  fs.mkdirSync(path.dirname(writableRoot), { recursive: true });
  fs.cpSync(bundledRoot, writableRoot, { recursive: true });
  return writableRoot;
}

function getInstallerPath(engineRoot = getEngineRoot()) {
  return path.resolve(engineRoot, 'install_whisper_windows.bat');
}

function isFasterWhisperInstalled(engineRoot) {
  const pythonExe = getPythonExePath(engineRoot);
  if (!fs.existsSync(pythonExe)) {
    return false;
  }
  const result = spawnSync(pythonExe, buildPythonImportCheckArgs(), {
    windowsHide: true,
    encoding: 'utf8',
  });
  return result.status === 0;
}

function getEngineStatus() {
  const engineRoot = getEngineRoot();
  const runnerScript = path.join(engineRoot, 'run_transcribe.ps1');
  const installerScript = getInstallerPath(engineRoot);
  const pythonExe = getPythonExePath(engineRoot);
  const { offlineBundleRoot, wheelhouseRoot, modelCacheRoot } = getOfflinePaths(engineRoot);
  return inspectEnginePaths({
    engineRoot,
    runnerExists: fs.existsSync(runnerScript),
    installerExists: fs.existsSync(installerScript),
    moduleInstalled: isFasterWhisperInstalled(engineRoot),
    pythonExists: fs.existsSync(pythonExe),
    bootstrapAvailable: true,
    offlineMode: offlineModeEnabled,
    offlineBundleExists: fs.existsSync(offlineBundleRoot),
    wheelhouseExists: fs.existsSync(wheelhouseRoot),
    modelCacheExists: fs.existsSync(modelCacheRoot),
  });
}

function getDefaultOutputDir() {
  return path.join(os.homedir(), 'Documents', 'MediaScribe Output');
}

function getAssetPath(fileName) {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar', 'assets', fileName)
    : path.join(app.getAppPath(), 'assets', fileName);
}

function getUiEntry() {
  if (isDev) {
    return 'http://127.0.0.1:3000';
  }
  return `file://${path.join(app.getAppPath(), 'out', 'index.html')}`;
}

function sendProgress(payload) {
  mainWindow?.webContents.send('transcription:progress', payload);
}

function sendLog(level, fileName, message, meta) {
  sendProgress({
    kind: 'log',
    logEntry: createLogEntry(level, fileName, message, undefined, meta),
  });
}

function getWindowState() {
  return {
    isMaximized: Boolean(mainWindow?.isMaximized()),
    isMinimized: Boolean(mainWindow?.isMinimized()),
  };
}

function broadcastWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('window:state-change', getWindowState());
}

function isCancellationMessage(message) {
  const text = String(message || '').toLowerCase();
  return text.includes('cancelled by user') || text.includes('stopped by user') || text.includes('사용자가 추출을 중지했습니다');
}

function terminateChildProcess(child) {
  if (!child || child.killed) {
    return;
  }

  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      return;
    } catch {
      // fall through to direct kill
    }
  }

  try {
    child.kill('SIGTERM');
  } catch {
    // ignore kill failures
  }
}

function createTranscriptionSession() {
  const session = {
    stopRequested: false,
    activeChild: null,
  };
  activeTranscriptionSession = session;
  return session;
}

function clearTranscriptionSession(session) {
  if (activeTranscriptionSession === session) {
    activeTranscriptionSession = null;
  }
}

function requestTranscriptionStop() {
  const session = activeTranscriptionSession;
  if (!session) {
    return false;
  }

  session.stopRequested = true;
  terminateChildProcess(session.activeChild);
  return true;
}

function removePathRecursive(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return false;
  }
  fs.rmSync(targetPath, { recursive: true, force: true });
  return true;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    title: 'MediaScribe',
    backgroundColor: '#09090b',
    icon: getAssetPath('app-icon-256.png'),
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: false,
    },
  });

  mainWindow.center();

  mainWindow.on('closed', () => {
    if (mainWindow === null) {
      return;
    }
    mainWindow = null;
  });

  ['maximize', 'unmaximize', 'minimize', 'restore', 'enter-full-screen', 'leave-full-screen'].forEach((eventName) => {
    mainWindow.on(eventName, broadcastWindowState);
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) {
      return;
    }
    mainWindow.show();
    broadcastWindowState();
  });

  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);

  await mainWindow.loadURL(getUiEntry());
}


async function downloadFile(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, buffer);
  return destination;
}

async function runShellCommand(executable, args, fileName = 'bootstrap', session = null) {
  return runCommand({ executable, args }, {
    name: fileName,
    path: executable,
  }, session);
}

async function primeDefaultModelCache(engineRoot, modelName = 'small', session = null) {
  const venvPython = getPythonExePath(engineRoot);
  const transcribeScript = path.join(engineRoot, 'transcribe_media.py');

  if (session?.stopRequested) {
    return false;
  }

  if (!fs.existsSync(venvPython) || !fs.existsSync(transcribeScript)) {
    sendLog('info', '', 'Whisper 모델 프라임을 건너뜁니다. 런타임 또는 스크립트가 아직 없습니다.');
    return false;
  }

  const result = spawnSync(venvPython, [transcribeScript, ...buildModelPrimeArgs(modelName)], {
    windowsHide: true,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    sendLog('warn', '', `기본 모델(${modelName}) 캐시 프라임을 완료하지 못했습니다. 계속 진행합니다.`, {
      eventType: 'model_prime_failed',
      error: result.stderr || result.stdout || 'prime command failed',
    });
    return false;
  }

  sendLog('info', '', `기본 모델(${modelName}) 캐시를 미리 준비했습니다.`);
  return true;
}

async function bootstrapEngineRuntime(engineRoot, session = null) {
  const bootstrapPaths = describeBootstrapPaths(engineRoot);
  const venvPython = getPythonExePath(engineRoot);
  const runtimePython = getPythonRuntimeExePath(engineRoot);
  const runtimePythonExists = fs.existsSync(runtimePython);
  const venvPythonExists = fs.existsSync(venvPython);
  const moduleInstalled = venvPythonExists && isFasterWhisperInstalled(engineRoot);
  const wheelhouseExists = fs.existsSync(bootstrapPaths.offlineWheelhouseRoot);
  const modelCacheExists = fs.existsSync(bootstrapPaths.offlineModelCacheRoot);
  const offlinePythonInstallerExists = fs.existsSync(bootstrapPaths.offlinePythonInstaller);

  if (offlineModeEnabled) {
    if (!modelCacheExists) {
      throw new Error(`Offline mode requires a preseeded model cache: ${bootstrapPaths.offlineModelCacheRoot}`);
    }
    if (!runtimePythonExists && !offlinePythonInstallerExists) {
      throw new Error(`Offline mode requires a local Python installer: ${bootstrapPaths.offlinePythonInstaller}`);
    }
    if (!moduleInstalled && !wheelhouseExists) {
      throw new Error(`Offline mode requires a local wheelhouse: ${bootstrapPaths.offlineWheelhouseRoot}`);
    }
  }

  if (runtimePythonExists && moduleInstalled) {
    return getEngineStatus();
  }

  sendProgress({
    kind: 'status',
    filePath: '',
    fileName: '',
    status: 'processing',
    progress: 5,
    phase: runtimePythonExists ? 'installing_dependency' : 'installing_runtime',
  });

  if (!runtimePythonExists) {
    const installerUrl = bootstrapPaths.installerUrl;
    const installerPath = offlineModeEnabled ? bootstrapPaths.offlinePythonInstaller : path.join(os.tmpdir(), `MediaScribe-python-${Date.now()}.exe`);
    sendLog('warn', '', offlineModeEnabled
      ? `오프라인 모드로 Python 런타임을 설치합니다. ${installerPath}`
      : `Python 런타임이 없어 자동 설치를 시작합니다. ${installerUrl}`);

    if (!offlineModeEnabled) {
      await downloadFile(installerUrl, installerPath);
    }
    await runShellCommand(installerPath, buildPythonInstallerArgs(engineRoot), 'python-installer', session);
    if (!offlineModeEnabled) {
      try {
        fs.unlinkSync(installerPath);
      } catch {
        // ignore cleanup failures
      }
    }
  }

  if (!fs.existsSync(runtimePython)) {
    throw new Error(`Python runtime installation failed: ${runtimePython}`);
  }

  if (!venvPythonExists) {
    await runShellCommand(runtimePython, buildVenvArgs(engineRoot), 'python-venv', session);
  }

  if (!fs.existsSync(venvPython)) {
    throw new Error(`Virtual environment creation failed: ${venvPython}`);
  }

  sendProgress({
    kind: 'status',
    filePath: '',
    fileName: '',
    status: 'processing',
    progress: 35,
    phase: 'installing_dependency',
  });

  const pipOptions = {
    offline: offlineModeEnabled,
    wheelhouseDir: wheelhouseExists ? bootstrapPaths.offlineWheelhouseRoot : '',
  };
  await runShellCommand(venvPython, buildPipUpgradeArgs(['pip', 'setuptools', 'wheel'], pipOptions), 'pip-upgrade', session);
  await runShellCommand(venvPython, buildPipUpgradeArgs(['faster-whisper'], pipOptions), 'faster-whisper-install', session);

  const verify = spawnSync(venvPython, buildPythonImportCheckArgs(), {
    windowsHide: true,
    encoding: 'utf8',
  });
  if (verify.status !== 0) {
    throw new Error(verify.stderr || verify.stdout || 'Failed to verify faster-whisper after bootstrap.');
  }

  await primeDefaultModelCache(engineRoot, 'small', session);
  return getEngineStatus();
}

async function ensureRuntimeReady(session = null) {
  const engineRoot = ensureEngineWorkspace();
  const engineStatus = getEngineStatus();
  if (!engineStatus.ready) {
    throw new Error(`Whisper engine not found: ${engineStatus.runnerScript}`);
  }
  if (engineStatus.moduleInstalled && engineStatus.pythonExists) {
    return engineStatus;
  }
  sendLog('info', '', 'faster-whisper 런타임이 부족해 자동 설치를 시작합니다.');
  return bootstrapEngineRuntime(engineRoot, session);
}

function readTextIfPresent(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  } catch {
    return '';
  }
}

function collectOutputFiles(outputDir, fileName) {
  const stem = path.parse(fileName).name;
  const txtPath = path.join(outputDir, `${stem}.txt`);
  const srtPath = path.join(outputDir, `${stem}.srt`);
  return {
    txt: fs.existsSync(txtPath) ? txtPath : null,
    srt: fs.existsSync(srtPath) ? srtPath : null,
  };
}

function emitProcessLine(file, level, line, progress) {
  const trimmed = String(line || '').trim();
  if (!trimmed) {
    return;
  }

  const parsed = parseTaggedOutputLine(trimmed, file, progress);
  if (parsed.handled) {
    if (parsed.log) {
      sendProgress({
        kind: 'log',
        logEntry: parsed.log,
      });
    }
    if (parsed.status) {
      sendProgress(parsed.status);
    }
    return;
  }

  sendLog(level, file.name, trimmed);

  const payload = {
    kind: 'status',
    filePath: file.path,
    fileName: file.name,
    status: 'processing',
    progress,
  };

  const normalized = trimmed.toLowerCase();
  if (normalized.includes('faster-whisper module not found. installing it now')) {
    payload.phase = 'installing_dependency';
    payload.progress = 15;
  }
  if (normalized.includes('retrying transcription after dependency recovery')) {
    payload.phase = 'retrying';
    payload.progress = 30;
  }

  sendProgress(payload);
}

function runCommand(command, file, session = null) {
  return new Promise((resolve, reject) => {
    if (session?.stopRequested) {
      reject(new Error('Transcription cancelled by user.'));
      return;
    }

    const child = spawn(command.executable, command.args, {
      windowsHide: true,
      env: command.env ? { ...process.env, ...command.env } : process.env,
    });

    if (session) {
      session.activeChild = child;
    }

    let stdout = '';
    let stderr = '';

    const finalize = (error, payload) => {
      if (session && session.activeChild === child) {
        session.activeChild = null;
      }
      if (error) {
        reject(error);
      } else {
        resolve(payload);
      }
    };

    const handleChunk = (kind, chunk) => {
      const text = chunk.toString();
      if (kind === 'stdout') {
        stdout += text;
      } else {
        stderr += text;
      }

      const lines = text.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        emitProcessLine(file, kind === 'stdout' ? 'info' : 'warn', line, kind === 'stdout' ? 45 : 55);
      }
    };

    child.stdout.on('data', (chunk) => handleChunk('stdout', chunk));
    child.stderr.on('data', (chunk) => handleChunk('stderr', chunk));

    child.on('error', (error) => finalize(error));
    child.on('close', (code, signal) => {
      if (session?.stopRequested || signal === 'SIGTERM' || signal === 'SIGKILL') {
        finalize(new Error('Transcription cancelled by user.'));
        return;
      }
      if (code === 0) {
        finalize(null, { stdout, stderr, code });
        return;
      }
      finalize(new Error(stderr || stdout || `Command failed with exit code ${code}`));
    });
  });
}

async function runTranscriptionWithRetry(command, file, session = null) {
  let attemptCount = 0;
  while (true) {
    try {
      return await runCommand(command, file, session);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (session?.stopRequested || isCancellationMessage(message) || !shouldRetryTranscriptionError(message, attemptCount)) {
        throw error;
      }

      attemptCount += 1;
      sendLog('warn', file.name, '의존성 복구 후 변환을 한 번 더 시도합니다.', {
        eventType: 'dependency_retry',
        retryCount: attemptCount,
      });
      sendProgress({
        kind: 'status',
        filePath: file.path,
        fileName: file.name,
        status: 'processing',
        progress: 25,
        phase: 'retrying',
        retryCount: attemptCount,
      });
    }
  }
}

ipcMain.handle('app:get-state', async () => {
  if (app.isPackaged) {
    ensureEngineWorkspace();
  }

  return {
    isPackaged: app.isPackaged,
    outputDirectory: getDefaultOutputDir(),
    engineRoot: getEngineRoot(),
    engineStatus: getEngineStatus(),
  };
});

ipcMain.handle('dialog:pick-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Media Files',
        extensions: ['aac', 'avi', 'flac', 'm4a', 'm4v', 'mkv', 'mov', 'mp3', 'mp4', 'mpeg', 'mpg', 'ogg', 'wav', 'webm', 'wma'],
      },
    ],
  });

  if (result.canceled) {
    return [];
  }

  return result.filePaths.map((filePath) => ({
    path: filePath,
    name: path.basename(filePath),
    type: classifyMediaFile(filePath),
    size: fs.statSync(filePath).size,
  }));
});

ipcMain.handle('dialog:choose-output-directory', async (_event, currentPath) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: currentPath || getDefaultOutputDir(),
  });

  if (result.canceled || result.filePaths.length === 0) {
    return currentPath || '';
  }

  return result.filePaths[0];
});

ipcMain.handle('shell:open-folder', async (_event, targetPath) => {
  if (!targetPath) {
    return { ok: false };
  }

  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
    shell.showItemInFolder(targetPath);
    return { ok: true };
  }

  await shell.openPath(targetPath);
  return { ok: true };
});

ipcMain.handle('logs:save', async (_event, payload) => {
  const outputDir = payload?.outputDir || getDefaultOutputDir();
  const logs = Array.isArray(payload?.logs) ? payload.logs : [];
  fs.mkdirSync(outputDir, { recursive: true });
  const logPath = buildLogFilePath(outputDir);
  const content = logs
    .map((entry) => `[${entry.timestamp}] [${String(entry.level).toUpperCase()}] ${entry.fileName ? `${entry.fileName} :: ` : ''}${entry.message}`)
    .join(os.EOL);
  fs.writeFileSync(logPath, content, 'utf8');
  return { path: logPath };
});

ipcMain.handle('window:get-state', async () => getWindowState());

ipcMain.handle('window:minimize', async () => {
  if (!mainWindow) {
    return { ok: false };
  }
  mainWindow.minimize();
  return { ok: true, ...getWindowState() };
});

ipcMain.handle('window:toggle-maximize', async () => {
  if (!mainWindow) {
    return { ok: false, maximized: false };
  }
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  const windowState = getWindowState();
  return { ok: true, maximized: windowState.isMaximized, ...windowState };
});

ipcMain.handle('window:close', async () => {
  if (!mainWindow) {
    return { ok: false };
  }
  mainWindow.close();
  return { ok: true };
});

ipcMain.handle('engine:purge', async () => {
  requestTranscriptionStop();
  const userDataRoot = app.getPath('userData');
  const writableRoot = getWritableEngineRoot(userDataRoot);
  const removedTargets = [];

  if (removePathRecursive(writableRoot)) {
    removedTargets.push(writableRoot);
  }
  if (removePathRecursive(userDataRoot)) {
    removedTargets.push(userDataRoot);
  }

  if (removedTargets.length > 0) {
    sendLog('warn', '', `설치된 런타임과 모델 캐시를 삭제했습니다: ${removedTargets.join(', ')}`);
  }
  return {
    removed: removedTargets.length > 0,
    engineRoot: writableRoot,
    removedTargets,
  };
});

ipcMain.handle('engine:repair', async () => {
  const engineStatus = await ensureRuntimeReady();
  return {
    started: true,
    engineRoot: engineStatus.engineRoot,
    pythonExists: engineStatus.pythonExists,
    moduleInstalled: engineStatus.moduleInstalled,
  };
});

ipcMain.handle('transcription:stop', async () => {
  return { stopped: requestTranscriptionStop() };
});

ipcMain.handle('transcription:start', async (_event, payload) => {
  const { files = [], outputDir, model = 'small', language = '', outputFormats = ['srt', 'txt'] } = payload || {};
  if (!files.length) {
    throw new Error('No files selected.');
  }

  const session = createTranscriptionSession();
  const engineStatus = await ensureRuntimeReady(session);
  const targetOutputDir = outputDir || getDefaultOutputDir();
  fs.mkdirSync(targetOutputDir, { recursive: true });

  sendLog('info', '', `작업 시작: ${files.length}개 파일, 모델=${model}, 언어=${language || 'auto'}, 출력=${normalizeOutputFormats(outputFormats).join(', ')}`);
  sendLog('info', '', `엔진 위치: ${engineStatus.engineRoot}`);
  sendLog('info', '', `faster-whisper 설치 상태: ${engineStatus.moduleInstalled ? '설치됨' : '미설치(자동 복구 가능)'}`);
  if (offlineModeEnabled) {
    sendLog('info', '', `오프라인 모드 활성화: wheelhouse=${getOfflineWheelhouseRoot(engineStatus.engineRoot)}, model-cache=${getOfflineModelCacheRoot(engineStatus.engineRoot)}`);
  }

  const commands = buildTranscriptionCommands({
    appRoot: app.getAppPath(),
    engineRoot: engineStatus.engineRoot,
    inputFiles: files.map((file) => file.path),
    outputDir: targetOutputDir,
    model,
    language,
    outputFormats: normalizeOutputFormats(outputFormats),
    offlineMode: offlineModeEnabled,
    wheelhouseRoot: getOfflineWheelhouseRoot(engineStatus.engineRoot),
    modelCacheRoot: getOfflineModelCacheRoot(engineStatus.engineRoot),
  });

  const results = [];
  let cancelled = false;

  try {
    for (let index = 0; index < files.length; index += 1) {
      if (session.stopRequested) {
        cancelled = true;
        break;
      }

      const file = files[index];
      const command = commands[index];

      sendLog('info', file.name, `처리 시작 (${index + 1}/${files.length})`);
      sendProgress({
        kind: 'status',
        filePath: file.path,
        fileName: file.name,
        status: 'processing',
        progress: 10,
        current: index + 1,
        total: files.length,
      });

      try {
        await runTranscriptionWithRetry(command, file, session);
        const outputFiles = collectOutputFiles(targetOutputDir, file.name);
        const result = {
          kind: 'status',
          filePath: file.path,
          fileName: file.name,
          status: 'done',
          progress: 100,
          text: readTextIfPresent(outputFiles.txt || ''),
          outputFiles,
        };
        results.push(result);
        sendLog('success', file.name, '텍스트 추출 완료', {
          eventType: 'result_ready',
          outputFiles,
        });
        sendProgress(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (session.stopRequested || isCancellationMessage(message)) {
          cancelled = true;
          const result = {
            kind: 'status',
            filePath: file.path,
            fileName: file.name,
            status: 'cancelled',
            progress: 0,
            error: '사용자가 추출을 중지했습니다.',
          };
          results.push(result);
          sendLog('warn', file.name, '사용자가 추출을 중지했습니다.', {
            eventType: 'cancelled',
          });
          sendProgress(result);
          break;
        }

        const result = {
          kind: 'status',
          filePath: file.path,
          fileName: file.name,
          status: 'error',
          progress: 100,
          error: message,
        };
        results.push(result);
        sendLog('error', file.name, message);
        sendProgress(result);
      }
    }
  } finally {
    clearTranscriptionSession(session);
  }

  sendLog('info', '', cancelled
    ? `작업 종료: 중지 ${results.filter((item) => item.status === 'cancelled').length}, 완료 ${results.filter((item) => item.status === 'done').length}, 실패 ${results.filter((item) => item.status === 'error').length}`
    : `작업 종료: 완료 ${results.filter((item) => item.status === 'done').length}, 실패 ${results.filter((item) => item.status === 'error').length}`);

  return {
    outputDir: targetOutputDir,
    results,
    cancelled,
  };
});

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
