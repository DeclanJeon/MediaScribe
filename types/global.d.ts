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
    status?: 'processing' | 'done' | 'error';
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

  interface MediaScribeDesktopAPI {
    isDesktopApp: boolean;
    getAppState: () => Promise<{
      isPackaged: boolean;
      outputDirectory: string;
      engineRoot: string;
      engineStatus: DesktopEngineStatus;
    }>;
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
    }>;
    saveLogs: (payload: { outputDir: string; logs: DesktopLogEntry[] }) => Promise<{ path: string }>;
    repairEngine: () => Promise<{ started: boolean; engineRoot: string; pythonExists: boolean; moduleInstalled: boolean }>;
    openFolder: (targetPath: string) => Promise<{ ok: boolean }>;
    onTranscriptionProgress: (callback: (payload: DesktopProgressEvent) => void) => () => void;
  }

  interface Window {
    mediaScribe?: MediaScribeDesktopAPI;
  }
}
