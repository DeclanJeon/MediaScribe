export {};

declare global {
  interface DesktopPickedFile {
    path: string;
    name: string;
    type: 'audio' | 'video' | 'unsupported';
    size: number;
  }

  interface DesktopOutputFiles {
    txt?: string | null;
    srt?: string | null;
  }

  interface DesktopLogEntry {
    id: string;
    level: 'info' | 'warn' | 'error' | 'success';
    fileName: string;
    message: string;
    timestamp: string;
    meta?: {
      eventType?: string;
      detectedLanguage?: string;
      languageProbability?: number | null;
      retryCount?: number;
      outputFiles?: DesktopOutputFiles;
      [key: string]: unknown;
    };
  }

  interface DesktopEngineStatus {
    engineRoot: string;
    runnerScript: string;
    installerScript: string;
    ready: boolean;
    installerAvailable: boolean;
    moduleInstalled: boolean;
    pythonExists: boolean;
    bootstrapAvailable: boolean;
  }

  interface DesktopProgressEvent {
    kind: 'status' | 'log';
    filePath?: string;
    fileName?: string;
    status?: 'processing' | 'done' | 'error' | 'cancelled';
    progress?: number;
    current?: number;
    total?: number;
    text?: string;
    partialText?: string;
    transcriptSegment?: {
      file_name: string;
      start: number;
      end: number;
      text: string;
    };
    error?: string;
    outputFiles?: DesktopOutputFiles;
    logEntry?: DesktopLogEntry;
    phase?: 'installing_dependency' | 'installing_runtime' | 'retrying';
    retryCount?: number;
  }

  interface DesktopWindowState {
    isMaximized: boolean;
    isMinimized: boolean;
  }

  interface MediaScribeDesktopAPI {
    isDesktopApp: boolean;
    getAppState: () => Promise<{
      isPackaged: boolean;
      outputDirectory: string;
      engineRoot: string;
      engineStatus: DesktopEngineStatus;
    }>;
    getWindowState: () => Promise<DesktopWindowState>;
    pickFiles: () => Promise<DesktopPickedFile[]>;
    chooseOutputDirectory: (currentPath?: string) => Promise<string>;
    startTranscription: (payload: {
      files: DesktopPickedFile[];
      outputDir: string;
      model: string;
      language: string;
      outputFormats: string[];
    }) => Promise<{
      outputDir: string;
      results: DesktopProgressEvent[];
      cancelled?: boolean;
    }>;
    stopTranscription: () => Promise<{ stopped: boolean }>;
    saveLogs: (payload: { outputDir: string; logs: DesktopLogEntry[] }) => Promise<{ path: string }>;
    repairEngine: () => Promise<{ started: boolean; engineRoot: string; pythonExists: boolean; moduleInstalled: boolean }>;
    purgeInstallation: () => Promise<{ removed: boolean; engineRoot: string; removedTargets: string[] }>;
    minimizeWindow: () => Promise<{ ok: boolean; isMaximized: boolean; isMinimized: boolean }>;
    toggleMaximizeWindow: () => Promise<{ ok: boolean; maximized: boolean; isMaximized: boolean; isMinimized: boolean }>;
    closeWindow: () => Promise<{ ok: boolean }>;
    openFolder: (targetPath: string) => Promise<{ ok: boolean }>;
    onWindowStateChange: (callback: (payload: DesktopWindowState) => void) => () => void;
    onTranscriptionProgress: (callback: (payload: DesktopProgressEvent) => void) => () => void;
  }

  interface Window {
    mediaScribe?: MediaScribeDesktopAPI;
  }
}
