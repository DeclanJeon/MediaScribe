'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BellRing,
  CloudOff,
  Copy,
  FileAudio,
  FileVideo,
  FolderOpen,
  Loader2,
  Minus,
  Save,
  ScrollText,
  Sparkles,
  Square,
  StopCircle,
  Trash2,
  UploadCloud,
  Wrench,
  X,
} from 'lucide-react';
import { buildProgressSnapshot, createLogEntry } from '@/lib/progress-utils.cjs';
import liveProgress from '@/lib/live-progress.cjs';

type JobStatus = 'idle' | 'processing' | 'done' | 'error' | 'cancelled';
type ToastTone = 'success' | 'error' | 'info';
type LogFilter = 'all' | 'info' | 'warn' | 'error' | 'success';

type QueuedFile = DesktopPickedFile & {
  id: string;
  status: JobStatus;
  progress: number;
  phase?: DesktopProgressEvent['phase'];
  retryCount?: number;
  liveTranscript: string[];
  result?: string;
  error?: string;
  outputs?: DesktopOutputFiles;
};

const MODEL_OPTIONS = ['tiny', 'base', 'small', 'medium', 'large-v3'];
const LANGUAGE_OPTIONS = [
  { label: '한국어', value: 'ko' },
  { label: 'English', value: 'en' },
  { label: '자동 감지', value: '' },
];

const { describePhase, summarizeLiveLogs, filterLogsByLevel, buildTimelineItems, formatElapsedSeconds, findDetectedLanguage } = liveProgress;

function makeId(file: DesktopPickedFile) {
  return `${file.path}-${file.size}`;
}

function formatSize(size: number) {
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function statusChip(status: JobStatus) {
  if (status === 'done') return '완료';
  if (status === 'processing') return '처리 중';
  if (status === 'error') return '실패';
  if (status === 'cancelled') return '중지됨';
  return '준비됨';
}

function getReadinessTone(isReady: boolean, isRepairing: boolean) {
  if (isRepairing) return 'info';
  return isReady ? 'success' : 'error';
}

function getReadinessLabel(isReady: boolean, isRepairing: boolean) {
  if (isRepairing) return '준비중';
  return isReady ? '준비 완료' : '준비중';
}

function playCompletionTone(isError: boolean) {
  if (typeof window === 'undefined') return;
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.type = isError ? 'sawtooth' : 'sine';
  oscillator.frequency.value = isError ? 220 : 880;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.25);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.28);
  oscillator.onended = () => {
    context.close().catch(() => undefined);
  };
}

export default function Home() {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [logs, setLogs] = useState<DesktopLogEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [windowState, setWindowState] = useState<DesktopWindowState>({ isMaximized: false, isMinimized: false });
  const [isConvertingAll, setIsConvertingAll] = useState(false);
  const [isStoppingTranscription, setIsStoppingTranscription] = useState(false);
  const [isSavingLogs, setIsSavingLogs] = useState(false);
  const [isRepairingEngine, setIsRepairingEngine] = useState(false);
  const autoRepairStartedRef = useRef(false);
  const [outputDir, setOutputDir] = useState('');
  const [model, setModel] = useState('small');
  const [language, setLanguage] = useState('');
  const [statusMessage, setStatusMessage] = useState('파일을 추가하세요.');
  const [outputFormats, setOutputFormats] = useState<string[]>(['srt', 'txt']);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [engineStatus, setEngineStatus] = useState<DesktopEngineStatus | null>(null);
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [phaseStartedAt, setPhaseStartedAt] = useState<number | null>(null);
  const [phaseElapsedSeconds, setPhaseElapsedSeconds] = useState(0);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const phaseStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!window.mediaScribe) return;

    setIsDesktop(true);
    const mediaScribe = window.mediaScribe;
    mediaScribe.getWindowState().then(setWindowState).catch(() => undefined);
    const unsubscribeWindowState = mediaScribe.onWindowStateChange((payload) => {
      setWindowState(payload);
    });

    mediaScribe.getAppState().then((state) => {
      setOutputDir(state.outputDirectory);
      setEngineStatus(state.engineStatus);

      const requiresRepair = !state.engineStatus?.ready || !state.engineStatus?.pythonExists || !state.engineStatus?.moduleInstalled;
      if (requiresRepair && !autoRepairStartedRef.current) {
        autoRepairStartedRef.current = true;
        setIsRepairingEngine(true);
        setStatusMessage('준비중... 필요한 파일을 다운로드하고 있습니다. 잠시만 기다려 주세요.');
        mediaScribe
          .repairEngine()
          .then((result) => {
            setEngineStatus((prev) =>
              prev
                ? { ...prev, engineRoot: result.engineRoot, pythonExists: result.pythonExists, moduleInstalled: result.moduleInstalled, bootstrapAvailable: true }
                : prev,
            );
            setToast({ message: `엔진 자동 복구를 완료했습니다: ${result.engineRoot}`, tone: 'info' });
          })
          .catch((error) => {
            setToast({ message: error instanceof Error ? error.message : '엔진 자동 복구에 실패했습니다.', tone: 'error' });
          })
          .finally(() => {
            setIsRepairingEngine(false);
          });
      } else {
        setStatusMessage('파일을 올리면 바로 추출을 시작합니다.');
      }
    });

    const unsubscribe = window.mediaScribe.onTranscriptionProgress((payload) => {
      if (payload.kind === 'log' && payload.logEntry) {
        setLogs((prev) => [...prev, payload.logEntry!].slice(-2000));
        return;
      }

      if (payload.kind !== 'status' || !payload.filePath || !payload.status) return;

      setFiles((prev) =>
        prev.map((item) => {
          if (item.path !== payload.filePath) return item;
          return {
            ...item,
            status: payload.status as JobStatus,
            progress: payload.progress ?? item.progress,
            phase: payload.phase ?? item.phase,
            retryCount: payload.retryCount ?? item.retryCount,
            liveTranscript: payload.partialText ? [...item.liveTranscript, payload.partialText].slice(-80) : item.liveTranscript,
            result: payload.text ?? item.result,
            error: payload.error ?? item.error,
            outputs: payload.outputFiles ?? item.outputs,
          };
        }),
      );

      if (payload.status === 'processing') {
        if (!phaseStartedAtRef.current) {
          const startedAt = Date.now();
          phaseStartedAtRef.current = startedAt;
          setPhaseStartedAt(startedAt);
          setPhaseElapsedSeconds(0);
        }
        if (payload.phase === 'installing_runtime') {
          setStatusMessage('Python 런타임을 자동 설치하는 중입니다...');
        } else if (payload.phase === 'installing_dependency') {
          setStatusMessage('faster-whisper 누락을 감지해 자동 복구 중입니다...');
        } else if (payload.phase === 'retrying') {
          setStatusMessage(`자동 복구 후 재시도 중... (${payload.retryCount ?? 1}회)`);
        } else {
          setStatusMessage(`변환 중... ${payload.current ?? 0}/${payload.total ?? 0}`);
        }
      } else if (payload.status === 'done') {
        phaseStartedAtRef.current = null;
        setPhaseStartedAt(null);
        setStatusMessage('텍스트 추출이 완료되었습니다.');
      } else if (payload.status === 'cancelled') {
        phaseStartedAtRef.current = null;
        setPhaseStartedAt(null);
        setStatusMessage('추출을 중지했습니다.');
      } else if (payload.status === 'error') {
        phaseStartedAtRef.current = null;
        setPhaseStartedAt(null);
        setStatusMessage('일부 파일 처리 중 오류가 발생했습니다.');
      }
    });

    return () => {
      unsubscribeWindowState();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!logContainerRef.current) return;
    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!phaseStartedAt) {
      setPhaseElapsedSeconds(0);
      return;
    }

    const tick = window.setInterval(() => {
      setPhaseElapsedSeconds(Math.max(0, Math.floor((Date.now() - phaseStartedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(tick);
  }, [phaseStartedAt]);

  const summary = useMemo(() => buildProgressSnapshot(files), [files]);
  const latestLines = useMemo(() => summarizeLiveLogs(logs, 12), [logs]);
  const filteredLogs = useMemo(() => filterLogsByLevel(logs, logFilter), [logs, logFilter]);
  const timelineItems = useMemo(() => buildTimelineItems(logs), [logs]);
  const activeFile = useMemo(() => files.find((item) => item.status === 'processing') ?? null, [files]);
  const activeDetectedLanguage = useMemo(() => findDetectedLanguage(logs, activeFile?.name), [logs, activeFile]);
  const latestDetectedLanguage = useMemo(() => findDetectedLanguage(logs), [logs]);
  const engineReady = Boolean(engineStatus?.ready);
  const runtimeReady = Boolean(engineStatus?.pythonExists);
  const moduleReady = Boolean(engineStatus?.moduleInstalled);
  const offlineReady = engineReady && runtimeReady && moduleReady;
  const needsRepair = isDesktop && !offlineReady;
  const readinessLabel = getReadinessLabel(offlineReady, isRepairingEngine);
  const readinessTone = getReadinessTone(offlineReady, isRepairingEngine);
  const primaryActionLabel = isConvertingAll
    ? '추출 중...'
    : files.length > 0
      ? '추출 시작'
      : '파일 업로드';
  const primaryActionHint = files.length > 0
    ? `${files.length}개 파일 준비됨`
    : '음성·영상 파일을 추가하세요.';
  const runtimeBadgeLabel = isRepairingEngine
    ? '준비중'
    : offlineReady
      ? '준비 완료'
      : '준비중';
  const runtimeBadgeTone = isRepairingEngine ? 'info' : offlineReady ? 'success' : 'error';
  const runtimeBadgeText = isRepairingEngine
    ? '필요한 파일을 다운로드하는 중입니다. 잠시만 기다려 주세요.'
    : offlineReady
      ? '파일을 올리면 바로 추출을 시작합니다.'
      : '엔진을 준비하는 중입니다.';
  const activeLiveLines = activeFile?.liveTranscript.slice(-8) ?? [];
  const showLivePanel = Boolean(isRepairingEngine || activeFile || isConvertingAll);
  const windowToggleLabel = windowState.isMaximized ? '창 복원' : '창 최대화';

  const handlePrimaryAction = async () => {
    if (files.length === 0) {
      await handleChooseFiles();
      return;
    }
    await handleConvertAll();
  };

  const addFiles = (pickedFiles: DesktopPickedFile[]) => {
    const supported = pickedFiles.filter((file) => file.type !== 'unsupported');
    if (supported.length === 0) {
      setStatusMessage('지원되는 음성/영상 파일만 추가할 수 있습니다.');
      setLogs((prev) => [...prev, createLogEntry('warn', '', '지원되지 않는 파일은 추가되지 않았습니다.')].slice(-2000));
      setToast({ message: '지원 포맷만 추가할 수 있습니다.', tone: 'error' });
      return;
    }

    setFiles((prev) => {
      const existing = new Map(prev.map((item) => [item.id, item]));
      for (const file of supported) {
        const id = makeId(file);
        if (!existing.has(id)) {
          existing.set(id, { ...file, id, status: 'idle', progress: 0, liveTranscript: [] });
        }
      }
      return Array.from(existing.values());
    });

    setStatusMessage(`${supported.length}개 파일을 대기열에 추가했습니다.`);
    setLogs((prev) => [...prev, createLogEntry('info', '', `${supported.length}개 파일을 대기열에 추가했습니다.`)].slice(-2000));
  };

  const refreshEngineStatus = async () => {
    const state = await window.mediaScribe?.getAppState();
    if (state) setEngineStatus(state.engineStatus);
  };

  const handleChooseFiles = async () => {
    const pickedFiles = await window.mediaScribe?.pickFiles();
    if (pickedFiles?.length) addFiles(pickedFiles);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const droppedFiles: DesktopPickedFile[] = Array.from(event.dataTransfer.files)
      .map((file) => {
        const detectedType: DesktopPickedFile['type'] = file.type.startsWith('audio/')
          ? 'audio'
          : file.type.startsWith('video/')
            ? 'video'
            : 'unsupported';
        return {
          path: (file as File & { path?: string }).path || '',
          name: file.name,
          type: detectedType,
          size: file.size,
        };
      })
      .filter((file) => Boolean(file.path));

    addFiles(droppedFiles);
  };

  const handleConvertAll = async () => {
    if (!window.mediaScribe || files.length === 0 || isConvertingAll) return;

    setIsConvertingAll(true);
    setIsStoppingTranscription(false);
    setLogs([]);
    phaseStartedAtRef.current = null;
    setPhaseStartedAt(null);
    setPhaseElapsedSeconds(0);
    setFiles((prev) => prev.map((item) => ({ ...item, status: 'idle', progress: 0, phase: undefined, retryCount: 0, liveTranscript: [], error: undefined })));

    try {
      const response = await window.mediaScribe.startTranscription({
        files,
        outputDir,
        model,
        language,
        outputFormats,
      });
      setOutputDir(response.outputDir);
      const hasErrors = response.results.some((item) => item.kind === 'status' && item.status === 'error');
      if (response.cancelled) {
        setStatusMessage('추출을 중지했습니다.');
        setToast({ message: '추출을 중지했습니다.', tone: 'info' });
      } else {
        setStatusMessage(hasErrors ? '완료되었지만 일부 파일은 실패했습니다.' : '모든 파일의 텍스트 추출이 끝났습니다.');
        setToast({ message: hasErrors ? '일부 파일 실패와 함께 작업이 끝났습니다.' : '텍스트 추출이 완료되었습니다.', tone: hasErrors ? 'error' : 'success' });
        playCompletionTone(hasErrors);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '변환을 시작하지 못했습니다.';
      setStatusMessage(message);
      setLogs((prev) => [...prev, createLogEntry('error', '', message)].slice(-2000));
      setToast({ message, tone: 'error' });
      playCompletionTone(true);
    } finally {
      setIsConvertingAll(false);
      setIsStoppingTranscription(false);
      await refreshEngineStatus();
    }
  };

  const handleChooseOutputDir = async () => {
    const nextPath = await window.mediaScribe?.chooseOutputDirectory(outputDir);
    if (nextPath) setOutputDir(nextPath);
  };

  const handleSaveLogs = async () => {
    if (!window.mediaScribe || logs.length === 0 || isSavingLogs) return;
    setIsSavingLogs(true);
    try {
      const result = await window.mediaScribe.saveLogs({ outputDir, logs });
      setToast({ message: `로그 저장 완료: ${result.path}`, tone: 'success' });
      await window.mediaScribe.openFolder(result.path);
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : '로그 저장 실패', tone: 'error' });
    } finally {
      setIsSavingLogs(false);
    }
  };

  const handleStopConversion = async () => {
    if (!window.mediaScribe || !isConvertingAll || isStoppingTranscription) return;
    setIsStoppingTranscription(true);
    setStatusMessage('추출을 중지하는 중입니다...');
    try {
      await window.mediaScribe.stopTranscription();
    } catch (error) {
      setIsStoppingTranscription(false);
      setToast({ message: error instanceof Error ? error.message : '추출 중지 요청에 실패했습니다.', tone: 'error' });
    }
  };

  const handleRepairEngine = async () => {
    if (!window.mediaScribe || isRepairingEngine) return;
    setIsRepairingEngine(true);
    setStatusMessage('엔진 복구를 시작합니다. 잠시만 기다려 주세요.');
    try {
      const result = await window.mediaScribe.repairEngine();
      setToast({ message: `엔진 복구를 완료했습니다: ${result.engineRoot}`, tone: 'info' });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : '엔진 복구를 시작하지 못했습니다.', tone: 'error' });
    } finally {
      setIsRepairingEngine(false);
      await refreshEngineStatus();
    }
  };

  const handlePurgeInstallation = async () => {
    if (!window.mediaScribe || isConvertingAll || isRepairingEngine) return;
    const confirmed = window.confirm('설치된 런타임, Python, 모델 캐시를 모두 삭제할까요?\n삭제 후 다시 추출하면 자동으로 재설치됩니다.');
    if (!confirmed) return;

    setStatusMessage('설치된 데이터를 삭제하는 중입니다...');
    try {
      const result = await window.mediaScribe.purgeInstallation();
      setToast({ message: result.removed ? `설치 데이터를 삭제했습니다: ${result.engineRoot}` : '삭제할 설치 데이터가 없습니다.', tone: 'info' });
      await refreshEngineStatus();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : '설치 데이터 삭제에 실패했습니다.', tone: 'error' });
    }
  };

  const toggleFormat = (format: 'srt' | 'txt') => {
    setOutputFormats((prev) => {
      const next = prev.includes(format) ? prev.filter((item) => item !== format) : [...prev, format];
      return next.length > 0 ? next : ['txt'];
    });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.16),_transparent_24%),radial-gradient(circle_at_80%_20%,_rgba(56,189,248,0.10),_transparent_22%),linear-gradient(180deg,_#06070a_0%,_#0b0d12_52%,_#09090b_100%)] text-slate-100 selection:bg-indigo-500/30 selection:text-white">
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.05] [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.7)_1px,transparent_0)] [background-size:22px_22px]" />
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-5 right-5 z-50 rounded-2xl px-4 py-3 shadow-2xl border ${toast.tone === 'success' ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-100' : toast.tone === 'error' ? 'bg-rose-500/10 border-rose-400/20 text-rose-100' : 'bg-white/5 border-white/10 text-slate-100 backdrop-blur-xl'}`}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <BellRing className="w-4 h-4" /> {toast.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isDesktop && (
        <header className="sticky top-0 z-50 px-4 pt-4 sm:px-6">
          <div className="mx-auto flex max-w-6xl items-center justify-between rounded-full border border-white/10 bg-black/35 px-4 py-3 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.95)] backdrop-blur-2xl sm:px-5" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-indigo-400/20 bg-indigo-500/12 text-indigo-100 shadow-[0_12px_30px_-18px_rgba(99,102,241,0.8)]">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.32em] text-slate-500">MediaScribe</p>
                <p className="text-sm text-slate-300">더 단순한 로컬 전사 작업실</p>
              </div>
            </div>
            <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <button onClick={() => window.mediaScribe?.minimizeWindow()} className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10 hover:text-white" aria-label="창 최소화" title="창 최소화">
                <Minus className="h-4 w-4" />
              </button>
              <button onClick={() => window.mediaScribe?.toggleMaximizeWindow()} className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10 hover:text-white" aria-label={windowToggleLabel} title={windowToggleLabel}>
                {windowState.isMaximized ? <Copy className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              </button>
              <button onClick={() => window.mediaScribe?.closeWindow()} className="rounded-full border border-rose-500/20 bg-rose-500/10 p-2 text-rose-100 transition-all duration-300 hover:-translate-y-0.5 hover:bg-rose-500/20 hover:text-white" aria-label="창 닫기" title="창 닫기">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>
      )}

      <main className="relative z-10 mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <motion.section initial={{ opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }} className={`overflow-hidden rounded-[36px] border p-6 shadow-[0_28px_90px_-40px_rgba(15,23,42,0.95)] backdrop-blur-xl sm:p-8 lg:p-10 ${needsRepair ? 'border-amber-400/20 bg-amber-500/10' : 'border-white/10 bg-white/[0.055]'}`}>
          <div className="grid gap-6 lg:grid-cols-[1.35fr_0.9fr] lg:items-start">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.28em] text-slate-300">
                <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
                Focused transcription flow
              </div>

              <div className="space-y-4">
                <h2 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
                  파일 하나 올리고,
                  <br className="hidden sm:block" />
                  바로 텍스트로 받으세요.
                </h2>
                <p className="max-w-2xl break-keep-all text-base leading-8 text-slate-300 sm:text-lg">
                  화면은 더 단순하게 줄이고, 필요한 상태만 위로 끌어올렸습니다. 업로드 버튼은 하나만 두고, 현재 준비 상태와 진행 상황은 한눈에 보이도록 정리했습니다.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button onClick={handlePrimaryAction} disabled={!isDesktop || isConvertingAll || isRepairingEngine} className={`inline-flex items-center rounded-full px-6 py-3.5 text-sm font-semibold transition-all duration-300 ${(!isDesktop || isConvertingAll || isRepairingEngine) ? 'cursor-not-allowed bg-white/10 text-slate-500' : 'bg-indigo-500 text-white shadow-[0_20px_45px_-22px_rgba(99,102,241,0.95)] hover:-translate-y-0.5 hover:bg-indigo-400 active:scale-[0.98]'}`}>
                  {isConvertingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                  {primaryActionLabel}
                  <span className="ml-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/15 text-white/90">
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </button>
                {isConvertingAll && (
                  <button onClick={handleStopConversion} disabled={isStoppingTranscription} className={`inline-flex items-center rounded-full border px-5 py-3.5 text-sm font-semibold transition-all duration-300 ${isStoppingTranscription ? 'cursor-not-allowed border-white/10 bg-white/5 text-slate-500' : 'border-rose-500/30 bg-rose-500/10 text-rose-100 hover:-translate-y-0.5 hover:bg-rose-500/20'}`}>
                    {isStoppingTranscription ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <StopCircle className="mr-2 h-4 w-4" />}
                    {isStoppingTranscription ? '중지 중...' : '추출 중지'}
                  </button>
                )}
                <button onClick={handleChooseOutputDir} className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-5 py-3.5 text-sm font-semibold text-slate-100 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10">
                  <FolderOpen className="mr-2 h-4 w-4" /> 출력 폴더
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${runtimeBadgeTone === 'success' ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100' : runtimeBadgeTone === 'error' ? 'border-amber-400/30 bg-amber-400/10 text-amber-100' : 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100'}`}>
                  {runtimeBadgeTone === 'success' ? <BadgeCheck className="h-4 w-4" /> : runtimeBadgeTone === 'error' ? <AlertTriangle className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                  런타임 {runtimeBadgeLabel}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">파일 {files.length}개</span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">출력 {outputFormats.join(', ')}</span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">모델 {model}</span>
              </div>

              <p className="text-sm text-slate-400">{primaryActionHint}</p>
              <p className="text-sm text-slate-400">{runtimeBadgeText}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-[28px] border border-white/10 bg-black/30 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">준비 상태</p>
                <p className="mt-3 text-xl font-semibold text-white">{readinessLabel}</p>
                <p className="mt-2 break-keep-all text-sm leading-6 text-slate-400">{needsRepair ? '엔진 준비가 끝나면 곧바로 추출할 수 있습니다.' : '지금 바로 파일을 올려 추출을 시작할 수 있습니다.'}</p>
              </div>
              <div className="rounded-[28px] border border-white/10 bg-black/30 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">현재 작업</p>
                <p className="mt-3 truncate text-xl font-semibold text-white">{activeFile ? activeFile.name : '대기 중'}</p>
                <p className="mt-2 break-keep-all text-sm leading-6 text-slate-400">{statusMessage}</p>
              </div>
              <div className="rounded-[28px] border border-white/10 bg-black/30 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">출력 위치</p>
                <p className="mt-3 text-xl font-semibold text-white">{outputDir ? '설정됨' : '미설정'}</p>
                <p className="mt-2 break-all text-sm leading-6 text-slate-400">{outputDir || '결과를 저장할 폴더를 선택하세요.'}</p>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className={`relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.045] p-7 shadow-[0_28px_90px_-40px_rgba(15,23,42,0.95)] backdrop-blur-xl transition-all duration-300 ${isDragging ? 'border-indigo-400/60 bg-indigo-500/10 scale-[1.01]' : 'hover:border-white/20 hover:bg-white/[0.065]'}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}>
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-white/10 bg-black/35 text-slate-100 shadow-[0_18px_40px_-28px_rgba(99,102,241,0.75)]">
                <UploadCloud className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-semibold tracking-tight text-white">{files.length > 0 ? '파일이 준비되었습니다.' : '여기에 파일을 끌어놓으세요.'}</h3>
                <p className="break-keep-all text-sm leading-7 text-slate-400">
                  업로드 버튼은 위에 하나만 남겼습니다. 여기서는 드래그 앤 드롭으로 바로 추가할 수 있고, 준비된 파일은 아래 대기열에서 확인하면 됩니다.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { title: '추가', text: '음성·영상 파일만 자동으로 분류합니다.' },
                { title: '시작', text: '준비되면 위 버튼이 바로 추출 시작으로 바뀝니다.' },
                { title: '확인', text: '완료 후 TXT와 SRT 위치를 바로 열 수 있습니다.' },
              ].map((step) => (
                <div key={step.title} className="rounded-[24px] border border-white/10 bg-black/30 p-4">
                  <p className="text-sm font-semibold text-white">{step.title}</p>
                  <p className="mt-2 break-keep-all text-sm leading-6 text-slate-400">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        <details className="group rounded-[28px] border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4">
            <div>
              <p className="text-sm font-semibold text-white">추가 설정</p>
              <p className="mt-1 text-xs text-slate-400">기본값으로 충분하면 접어두고 사용하세요.</p>
            </div>
            <div className="text-xs text-slate-400 transition-transform group-open:rotate-180">▾</div>
          </summary>
          <div className="border-t border-white/10 px-6 py-5">
            <div className="grid gap-4 lg:grid-cols-4">
              <div className="space-y-2 lg:col-span-2">
                <label className="text-sm font-medium text-slate-300">출력 폴더</label>
                <div className="flex gap-2">
                  <input value={outputDir} onChange={(event) => setOutputDir(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400" />
                  <button onClick={handleChooseOutputDir} className="rounded-2xl border border-white/10 bg-white/5 px-4 text-slate-100 hover:bg-white/10"><FolderOpen className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">모델</label>
                <select value={model} onChange={(event) => setModel(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-400">
                  {MODEL_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">언어</label>
                <select value={language} onChange={(event) => setLanguage(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-400">
                  {LANGUAGE_OPTIONS.map((option) => <option key={option.value || 'auto'} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="space-y-2 lg:col-span-4">
                <label className="text-sm font-medium text-slate-300">출력 형식</label>
                <div className="flex flex-wrap gap-3">
                  {(['txt', 'srt'] as const).map((format) => (
                    <button key={format} onClick={() => toggleFormat(format)} className={`rounded-full border px-4 py-2 text-sm transition-colors ${outputFormats.includes(format) ? 'border-indigo-400/30 bg-indigo-500/15 text-white' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-3 lg:col-span-4">
                <button onClick={handleRepairEngine} disabled={isRepairingEngine} className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">
                  {isRepairingEngine ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
                  {isRepairingEngine ? '복구 중...' : '엔진 복구'}
                </button>
                <button onClick={handlePurgeInstallation} disabled={isConvertingAll || isRepairingEngine} className="inline-flex items-center rounded-full border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-100 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50">
                  <Trash2 className="mr-2 h-4 w-4" /> 설치 데이터 삭제
                </button>
              </div>
            </div>
          </div>
        </details>

        {files.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 rounded-[32px] border border-white/10 bg-white/[0.045] p-6 shadow-[0_28px_90px_-40px_rgba(15,23,42,0.95)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-lg font-semibold text-white">대기열</h3>
                <p className="text-sm text-slate-400">{summary.completed}개 완료 · {summary.cancelled}개 중지 · {summary.failed}개 실패</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-slate-300">
                <ScrollText className="h-3.5 w-3.5" /> 전체 진행률 {summary.percent}%
              </div>
            </div>

            <div className="grid gap-4">
              {files.map((file) => (
                <motion.article key={file.id} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className={`rounded-xl p-3 ${file.type === 'audio' ? 'bg-amber-500/10 text-amber-200' : 'bg-indigo-500/10 text-indigo-200'}`}>
                        {file.type === 'audio' ? <FileAudio className="w-6 h-6" /> : <FileVideo className="w-6 h-6" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{file.name}</p>
                        <p className="text-sm text-slate-400">{formatSize(file.size)}</p>
                        {file.phase === 'installing_runtime' && <p className="mt-1 text-xs text-amber-300">준비중...</p>}
                        {file.phase === 'installing_dependency' && <p className="mt-1 text-xs text-amber-300">필요한 파일을 다운로드하는 중입니다.</p>}
                        {file.phase === 'retrying' && <p className="mt-1 text-xs text-cyan-300">다시 시도하는 중 ({file.retryCount ?? 1}회)</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-3 py-1 text-sm font-medium ${file.status === 'done' ? 'bg-emerald-500/10 text-emerald-200' : file.status === 'processing' ? 'bg-indigo-500/10 text-indigo-200' : file.status === 'error' ? 'bg-rose-500/10 text-rose-200' : file.status === 'cancelled' ? 'bg-slate-500/10 text-slate-200' : 'bg-white/5 text-slate-400'}`}>
                        {statusChip(file.status)}
                      </span>
                      <button onClick={() => removeFile(file.id)} disabled={file.status === 'processing'} className="rounded-full p-2 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-50">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{file.status === 'processing' ? '진행률' : '대기/완료 상태'}</span>
                      <span>{file.progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div className={`h-full rounded-full transition-all duration-300 ${file.status === 'error' ? 'bg-rose-500' : file.status === 'done' ? 'bg-emerald-500' : file.status === 'cancelled' ? 'bg-slate-500' : 'bg-indigo-500'}`} style={{ width: `${file.progress}%` }} />
                    </div>
                  </div>

                  {file.status === 'done' && file.result && (
                    <div className="mt-4 space-y-3">
                      <div className="relative group rounded-xl border border-white/10 bg-slate-950/80 p-4 text-sm leading-relaxed text-slate-200">
                        <pre className="whitespace-pre-wrap break-words font-sans">{file.result}</pre>
                        <button onClick={() => navigator.clipboard.writeText(file.result || '')} className="absolute right-3 top-3 rounded-lg bg-white/5 p-2 text-slate-400 opacity-0 transition-opacity hover:text-white group-hover:opacity-100" title="Copy to clipboard">
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 text-sm">
                        {file.outputs?.txt && <button onClick={() => window.mediaScribe?.openFolder(file.outputs?.txt || '')} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-slate-100 hover:bg-white/10">TXT 위치 열기</button>}
                        {file.outputs?.srt && <button onClick={() => window.mediaScribe?.openFolder(file.outputs?.srt || '')} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-slate-100 hover:bg-white/10">SRT 위치 열기</button>}
                      </div>
                    </div>
                  )}

                  {file.status === 'error' && file.error && <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm whitespace-pre-wrap text-rose-100">{file.error}</div>}
                </motion.article>
              ))}
            </div>
          </motion.section>
        )}

        {showLivePanel && (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-[28px] border border-white/10 bg-[#0b1220] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-lg font-semibold text-white">진행 상태</h3>
                <p className="mt-1 text-sm text-slate-400">{statusMessage}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-400">현재 단계</p>
                <p className="text-base font-semibold text-white">{describePhase(activeFile ?? { status: summary.active > 0 ? 'processing' : summary.failed > 0 ? 'error' : 'done' })}</p>
                <p className="mt-1 text-xs text-slate-500">{formatElapsedSeconds(phaseElapsedSeconds)}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">현재 작업</p>
                {activeFile ? (
                  <>
                    <p className="font-medium text-white break-all">{activeFile.name}</p>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-cyan-400 rounded-full transition-all duration-300" style={{ width: `${activeFile.progress}%` }} />
                    </div>
                    <p className="text-xs text-slate-400">{activeFile.progress}% · 재시도 {activeFile.retryCount ?? 0}회</p>
                    {activeDetectedLanguage && (
                      <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100 w-fit">
                        <span className="font-semibold uppercase">감지 언어 {activeDetectedLanguage.code}</span>
                        {activeDetectedLanguage.probability != null && <span className="text-cyan-200/90">신뢰도 {(Number(activeDetectedLanguage.probability) * 100).toFixed(1)}%</span>}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-medium text-white">{runtimeBadgeLabel}</p>
                    <p className="text-sm leading-6 text-slate-400">{runtimeBadgeText}</p>
                  </>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-2">실시간 추출 텍스트</p>
                <div className="max-h-[220px] overflow-y-auto space-y-2 text-sm leading-6 text-slate-100">
                  {activeLiveLines.length === 0 ? (
                    <p className="text-slate-500">아직 표시할 텍스트가 없습니다.</p>
                  ) : (
                    activeLiveLines.map((line, index) => (
                      <p key={`${activeFile?.id || 'live'}-${index}`} className="border-b border-slate-800/70 pb-2 break-words">{line}</p>
                    ))
                  )}
                </div>
              </div>
            </div>
          </motion.section>
        )}

        <details className="group rounded-[28px] border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4">
            <div>
              <p className="text-sm font-semibold text-white">상세 로그</p>
              <p className="mt-1 text-xs text-slate-400">필요할 때만 펼쳐서 확인하세요.</p>
            </div>
            <div className="text-xs text-slate-400 transition-transform group-open:rotate-180">▾</div>
          </summary>
          <div className="border-t border-white/10">
            <div className="flex items-center justify-between gap-3 px-6 py-4">
              <p className="text-sm text-slate-300">로그와 타임라인을 한곳에 모았습니다.</p>
              <div className="flex items-center gap-2">
                <button onClick={handleSaveLogs} disabled={isSavingLogs || logs.length === 0} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-40">
                  <Save className="w-3.5 h-3.5" /> {isSavingLogs ? '저장 중...' : '로그 저장'}
                </button>
                <button onClick={() => setLogs([])} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10">비우기</button>
              </div>
            </div>
            <div className="grid gap-0 border-t border-white/10 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="border-b border-white/10 lg:border-b-0 lg:border-r lg:border-white/10">
                <div className="flex flex-wrap items-center gap-2 px-6 py-4">
                  {(['all', 'info', 'warn', 'error', 'success'] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => setLogFilter(level)}
                      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${logFilter === level ? 'border-indigo-400/30 bg-indigo-500/15 text-white' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}
                    >
                      {level === 'all' ? '전체' : level.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div ref={logContainerRef} className="max-h-[320px] overflow-y-auto bg-slate-950/80 px-6 py-4 text-xs leading-6 text-slate-100">
                  {filteredLogs.length === 0 ? <p className="text-slate-500">로그가 아직 없습니다. 추출을 시작하면 준비, 전사, 저장 기록이 쌓입니다.</p> : filteredLogs.map((entry) => (
                    <div key={entry.id} className="border-b border-white/5 py-2 last:border-b-0">
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{entry.timestamp}</span>
                        <span className={`rounded-full px-2 py-0.5 ${entry.level === 'error' ? 'bg-rose-500/20 text-rose-200' : entry.level === 'warn' ? 'bg-amber-500/20 text-amber-200' : entry.level === 'success' ? 'bg-emerald-500/20 text-emerald-200' : 'bg-indigo-500/20 text-indigo-200'}`}>{entry.level.toUpperCase()}</span>
                        {entry.fileName ? <span className="truncate text-slate-300">{entry.fileName}</span> : <span className="text-slate-500">SYSTEM</span>}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-slate-100">{entry.message}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                  <div className="text-sm font-semibold text-white">진행 타임라인</div>
                  <div className="text-xs text-slate-400">{formatElapsedSeconds(phaseElapsedSeconds)}</div>
                </div>
                <div className="max-h-[320px] overflow-y-auto px-6 py-4 space-y-3">
                  {timelineItems.length === 0 ? (
                    <p className="text-sm text-slate-400">아직 타임라인이 비어 있습니다.</p>
                  ) : (
                    timelineItems.map((item) => (
                      <div key={item.id} className="flex gap-3">
                        <div className={`mt-1 h-2.5 w-2.5 rounded-full ${item.level === 'error' ? 'bg-rose-500' : item.level === 'warn' ? 'bg-amber-500' : item.level === 'success' ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span>{item.timestamp}</span>
                            <span>{item.label}</span>
                          </div>
                          <p className="break-words text-sm text-slate-100">{item.description}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </details>

        {!isDesktop && <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">이 화면은 Electron 데스크톱 앱에서 사용할 때 파일 선택/변환 기능이 활성화됩니다.</div>}
      </main>
    </div>
  );
}
