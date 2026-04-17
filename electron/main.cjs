const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { buildTranscriptionCommands, classifyMediaFile, normalizeOutputFormats } = require('../lib/desktop-utils.cjs');
const { createLogEntry } = require('../lib/progress-utils.cjs');
const { buildLogFilePath, inspectEnginePaths, shouldRetryTranscriptionError } = require('../lib/system-utils.cjs');
const { parseTaggedOutputLine } = require('../lib/tagged-output.cjs');

const isDev = !app.isPackaged;
let mainWindow = null;

function getEngineRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'WhisperTranscriber')
    : path.resolve(app.getAppPath(), '..', 'WhisperTranscriber');
}

function getInstallerPath(engineRoot = getEngineRoot()) {
  return path.resolve(engineRoot, '..', 'install_whisper_windows.bat');
}

function isFasterWhisperInstalled(engineRoot) {
  const pythonExe = path.join(engineRoot, 'venv', 'Scripts', 'python.exe');
  if (!fs.existsSync(pythonExe)) {
    return false;
  }
  const result = spawnSync(pythonExe, ['-c', 'import faster_whisper'], {
    windowsHide: true,
    encoding: 'utf8',
  });
  return result.status === 0;
}

function getEngineStatus() {
  const engineRoot = getEngineRoot();
  const runnerScript = path.join(engineRoot, 'run_transcribe.ps1');
  const installerScript = getInstallerPath(engineRoot);
  return inspectEnginePaths({
    engineRoot,
    runnerExists: fs.existsSync(runnerScript),
    installerExists: fs.existsSync(installerScript),
    moduleInstalled: isFasterWhisperInstalled(engineRoot),
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

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    title: 'MediaScribe',
    backgroundColor: '#f5f5f5',
    icon: getAssetPath('app-icon-256.png'),
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: false,
    },
  });

  await mainWindow.loadURL(getUiEntry());
}

function ensureEngineInstalled() {
  const engineStatus = getEngineStatus();
  if (!engineStatus.ready) {
    throw new Error(`Whisper engine not found: ${engineStatus.runnerScript}`);
  }
  return engineStatus;
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

function runCommand(command, file) {
  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args, {
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

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

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
        return;
      }
      reject(new Error(stderr || stdout || `Command failed with exit code ${code}`));
    });
  });
}

async function runTranscriptionWithRetry(command, file) {
  let attemptCount = 0;
  while (true) {
    try {
      return await runCommand(command, file);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!shouldRetryTranscriptionError(message, attemptCount)) {
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

ipcMain.handle('app:get-state', async () => ({
  isPackaged: app.isPackaged,
  outputDirectory: getDefaultOutputDir(),
  engineRoot: getEngineRoot(),
  engineStatus: getEngineStatus(),
}));

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

ipcMain.handle('engine:repair', async () => {
  const engineStatus = getEngineStatus();
  if (!engineStatus.installerAvailable) {
    throw new Error(`Installer not found: ${engineStatus.installerScript}`);
  }

  spawn('cmd.exe', ['/c', 'start', '', engineStatus.installerScript], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  }).unref();

  return {
    started: true,
    installerPath: engineStatus.installerScript,
  };
});

ipcMain.handle('transcription:start', async (_event, payload) => {
  const { files = [], outputDir, model = 'small', language = '', outputFormats = ['srt', 'txt'] } = payload || {};
  if (!files.length) {
    throw new Error('No files selected.');
  }

  const engineStatus = ensureEngineInstalled();
  const targetOutputDir = outputDir || getDefaultOutputDir();
  fs.mkdirSync(targetOutputDir, { recursive: true });

  sendLog('info', '', `작업 시작: ${files.length}개 파일, 모델=${model}, 언어=${language || 'auto'}, 출력=${normalizeOutputFormats(outputFormats).join(', ')}`);
  sendLog('info', '', `엔진 위치: ${engineStatus.engineRoot}`);
  sendLog('info', '', `faster-whisper 설치 상태: ${engineStatus.moduleInstalled ? '설치됨' : '미설치(자동 복구 가능)'}`);

  const commands = buildTranscriptionCommands({
    appRoot: app.getAppPath(),
    engineRoot: engineStatus.engineRoot,
    inputFiles: files.map((file) => file.path),
    outputDir: targetOutputDir,
    model,
    language,
    outputFormats: normalizeOutputFormats(outputFormats),
  });

  const results = [];
  for (let index = 0; index < files.length; index += 1) {
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
      await runTranscriptionWithRetry(command, file);
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

  sendLog('info', '', `작업 종료: 완료 ${results.filter((item) => item.status === 'done').length}, 실패 ${results.filter((item) => item.status === 'error').length}`);

  return {
    outputDir: targetOutputDir,
    results,
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
