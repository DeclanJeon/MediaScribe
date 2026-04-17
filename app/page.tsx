'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BellRing,
  CheckCircle2,
  Copy,
  FileAudio,
  FileText,
  FileVideo,
  FolderOpen,
  Loader2,
  Save,
  ScrollText,
  Sparkles,
  UploadCloud,
  Wrench,
  X,
} from 'lucide-react';
import { buildProgressSnapshot, createLogEntry } from '@/lib/progress-utils.cjs';
import liveProgress from '@/lib/live-progress.cjs';

type JobStatus = 'idle' | 'processing' | 'done' | 'error';
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
  return '준비됨';
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
  const [isConvertingAll, setIsConvertingAll] = useState(false);
  const [isSavingLogs, setIsSavingLogs] = useState(false);
  const [isRepairingEngine, setIsRepairingEngine] = useState(false);
  const autoRepairStartedRef = useRef(false);
  const [outputDir, setOutputDir] = useState('');
  const [model, setModel] = useState('small');
  const [language, setLanguage] = useState('');
  const [statusMessage, setStatusMessage] = useState('음성/영상을 추가한 뒤 텍스트 추출을 시작하세요.');
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
    mediaScribe.getAppState().then((state) => {
      setOutputDir(state.outputDirectory);
      setEngineStatus(state.engineStatus);

      const requiresRepair = !state.engineStatus?.ready || !state.engineStatus?.pythonExists || !state.engineStatus?.moduleInstalled;
      if (requiresRepair && !autoRepairStartedRef.current) {
        autoRepairStartedRef.current = true;
        setIsRepairingEngine(true);
        setStatusMessage('엔진을 자동 복구하는 중입니다...');
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
      } else if (payload.status === 'error') {
        phaseStartedAtRef.current = null;
        setPhaseStartedAt(null);
        setStatusMessage('일부 파일 처리 중 오류가 발생했습니다.');
      }
    });

    return unsubscribe;
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
      setStatusMessage(hasErrors ? '완료되었지만 일부 파일은 실패했습니다.' : '모든 파일의 텍스트 추출이 끝났습니다.');
      setToast({ message: hasErrors ? '일부 파일 실패와 함께 작업이 끝났습니다.' : '텍스트 추출이 완료되었습니다.', tone: hasErrors ? 'error' : 'success' });
      playCompletionTone(hasErrors);
    } catch (error) {
      const message = error instanceof Error ? error.message : '변환을 시작하지 못했습니다.';
      setStatusMessage(message);
      setLogs((prev) => [...prev, createLogEntry('error', '', message)].slice(-2000));
      setToast({ message, tone: 'error' });
      playCompletionTone(true);
    } finally {
      setIsConvertingAll(false);
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

  const handleRepairEngine = async () => {
    if (!window.mediaScribe || isRepairingEngine) return;
    setIsRepairingEngine(true);
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

  const toggleFormat = (format: 'srt' | 'txt') => {
    setOutputFormats((prev) => {
      const next = prev.includes(format) ? prev.filter((item) => item !== format) : [...prev, format];
      return next.length > 0 ? next : ['txt'];
    });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(94,106,210,0.18),_transparent_28%),linear-gradient(180deg,_#09090b_0%,_#0b0d10_100%)] text-slate-100 font-sans selection:bg-indigo-500/30 selection:text-white">
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.95fr]">
          <section className="space-y-8">
            <div className="text-center">
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center justify-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 shadow-2xl backdrop-blur-xl mb-6">
                <div className="rounded-full bg-indigo-500/15 text-indigo-200 p-2">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">MediaScribe</p>
                  <h1 className="text-sm font-semibold text-white">깔끔한 전사 워크플로우</h1>
                </div>
              </motion.div>

              <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-4xl md:text-5xl font-semibold tracking-tight mb-4 text-white">
                음성·영상을 세련된 작업 흐름으로 정리하세요.
              </motion.h2>

              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="text-lg text-slate-400 max-w-3xl mx-auto leading-8">
                faster-whisper 기반 데스크톱 앱이 파일 추가부터 실시간 진행, 로그 저장, 엔진 복구까지 한 번에 처리합니다. 설치형이지만 복잡함은 줄이고, 결과는 더 빠르게 확인할 수 있습니다.
              </motion.p>
            </div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <div
                className={`relative rounded-[28px] border border-white/10 bg-white/5 p-10 text-center shadow-2xl backdrop-blur-xl transition-all duration-200 ease-out ${isDragging ? 'border-indigo-400/60 bg-indigo-500/10 scale-[1.01]' : 'hover:border-white/20 hover:bg-white/7'}`}
                onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-200">
                  <UploadCloud className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-semibold tracking-tight mb-2 text-white">파일을 끌어놓거나 선택해서 시작하세요</h3>
                <p className="mb-6 text-slate-400 leading-7">MP3, WAV, M4A, MP4, MKV, WEBM 등 지원 포맷을 빠르게 처리합니다. 로컬에서 실행되므로 업로드 대기 없이 바로 전사가 시작됩니다.</p>
                <button onClick={handleChooseFiles} className="inline-flex items-center rounded-full bg-indigo-500 px-6 py-3 font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-400 active:scale-[0.98]">
                  파일 선택
                </button>
              </div>
            </motion.div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 space-y-5 shadow-2xl backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-lg font-semibold text-white">요약 진행률</h3>
                  <p className="mt-1 text-sm text-slate-400">{statusMessage}</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-semibold tracking-tight text-white">{summary.percent}%</p>
                  <p className="text-sm text-slate-400">완료 {summary.completed} / {summary.total} · 실패 {summary.failed}</p>
                </div>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-indigo-500 to-cyan-400 transition-all duration-300" style={{ width: `${summary.percent}%` }} />
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[#0b1220] p-6 space-y-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-lg font-semibold text-white">라이브 상태</h3>
                  <p className="mt-1 text-sm text-slate-400">진행 중인 단계와 방금 나온 로그를 정리해서 보여줍니다.</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-400">현재 단계</p>
                  <p className="text-base font-semibold text-white">{describePhase(activeFile ?? { status: summary.active > 0 ? 'processing' : summary.failed > 0 ? 'error' : 'done' })}</p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">현재 작업</p>
                  {activeFile ? (
                    <>
                      <p className="font-medium text-white break-all">{activeFile.name}</p>
                      <p className="text-sm text-slate-300">{describePhase(activeFile)}</p>
                      {activeDetectedLanguage && (
                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100 w-fit">
                          <span className="font-semibold uppercase">감지 언어 {activeDetectedLanguage.code}</span>
                          {activeDetectedLanguage.probability != null && <span className="text-cyan-200/90">신뢰도 {(Number(activeDetectedLanguage.probability) * 100).toFixed(1)}%</span>}
                        </div>
                      )}
                      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-cyan-400 rounded-full transition-all duration-300" style={{ width: `${activeFile.progress}%` }} />
                      </div>
                      <p className="text-xs text-slate-400">{activeFile.progress}% · 재시도 {activeFile.retryCount ?? 0}회 · 현재 단계 {formatElapsedSeconds(phaseElapsedSeconds)}</p>
                      <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-2">실시간 추출 텍스트</p>
                        <div className="max-h-[180px] overflow-y-auto space-y-2 text-sm leading-6 text-slate-100">
                          {activeFile.liveTranscript.length === 0 ? (
                            <p className="text-slate-500">아직 추출된 텍스트가 없습니다.</p>
                          ) : (
                            activeFile.liveTranscript.slice(-12).map((line, index) => (
                              <p key={`${activeFile.id}-live-${index}`} className="border-b border-slate-800/70 pb-2 break-words">{line}</p>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">현재 실행 중인 파일이 없습니다.</p>
                  )}
                </div>

                <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-3">실시간 출력</p>
                  <div className="space-y-2 font-mono text-xs leading-6 max-h-[240px] overflow-y-auto">
                    {latestLines.length === 0 ? (
                      <p className="text-slate-500">로그가 아직 없습니다.</p>
                    ) : (
                      latestLines.map((line, index) => (
                        <div key={`${index}-${line.slice(0, 20)}`} className="border-b border-slate-800/60 pb-2 text-slate-200 break-all">
                          {line}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {files.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-6">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <h3 className="text-lg font-medium text-white">작업 대기열 ({files.length})</h3>
                      <p className="text-sm text-slate-400">처리 중 {summary.active} · 완료 {summary.completed} · 실패 {summary.failed}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <button onClick={() => window.mediaScribe?.openFolder(outputDir)} className="flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2.5 font-medium text-slate-100 hover:bg-white/10">
                        <FolderOpen className="w-4 h-4 mr-2" /> 출력 폴더 열기
                      </button>
                      <button onClick={handleConvertAll} disabled={isConvertingAll || !isDesktop || !engineStatus?.ready} className={`flex items-center rounded-full px-5 py-2.5 font-medium transition-all ${(isConvertingAll || !isDesktop || !engineStatus?.ready) ? 'cursor-not-allowed bg-white/10 text-slate-500' : 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-400 active:scale-[0.98]'}`}>
                        {isConvertingAll ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 변환 중...</> : <><FileText className="w-4 h-4 mr-2" /> 전체 추출 시작</>}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    {files.map((file) => (
                      <motion.div key={file.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur-xl">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 items-center space-x-4">
                            <div className={`rounded-xl p-3 ${file.type === 'audio' ? 'bg-amber-500/10 text-amber-200' : 'bg-indigo-500/10 text-indigo-200'}`}>
                              {file.type === 'audio' ? <FileAudio className="w-6 h-6" /> : <FileVideo className="w-6 h-6" />}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-white">{file.name}</p>
                              <p className="text-sm text-slate-400">{formatSize(file.size)}</p>
                              {file.phase === 'installing_runtime' && <p className="mt-1 text-xs text-amber-300">Python 런타임 자동 설치 중...</p>}
                              {file.phase === 'installing_dependency' && <p className="mt-1 text-xs text-amber-300">faster-whisper 자동 설치 중...</p>}
                              {file.phase === 'retrying' && <p className="mt-1 text-xs text-cyan-300">자동 복구 후 재시도 중 ({file.retryCount ?? 1}회)</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`rounded-full px-3 py-1 text-sm font-medium ${file.status === 'done' ? 'bg-emerald-500/10 text-emerald-200' : file.status === 'processing' ? 'bg-indigo-500/10 text-indigo-200' : file.status === 'error' ? 'bg-rose-500/10 text-rose-200' : 'bg-white/5 text-slate-400'}`}>
                              {statusChip(file.status)}
                            </span>
                            <button onClick={() => removeFile(file.id)} disabled={file.status === 'processing'} className="rounded-full p-2 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-50">
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>{file.status === 'processing' ? '세부 진행률' : '처리 상태'}</span>
                            <span>{file.progress}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-white/10">
                            <div className={`h-full rounded-full transition-all duration-300 ${file.status === 'error' ? 'bg-rose-500' : file.status === 'done' ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${file.progress}%` }} />
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
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          <aside className="space-y-6">
            <div className="sticky top-6 space-y-5 rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
              <div>
                <h3 className="text-lg font-semibold text-white">런타임 상태</h3>
                <p className="mt-1 text-sm text-slate-400">로컬 엔진, Python 런타임, 출력 위치를 한눈에 확인합니다.</p>
              </div>

              <div className={`rounded-2xl border p-4 ${engineStatus?.ready ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100' : 'border-amber-500/20 bg-amber-500/10 text-amber-100'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">엔진 상태: {engineStatus?.ready ? '준비 완료' : '복구 필요'}</p>
                    <p className="mt-1 text-xs">faster-whisper: {engineStatus?.moduleInstalled ? '설치됨' : '미설치 또는 손상됨'}</p>
                    <p className="mt-1 text-xs">Python 런타임: {engineStatus?.pythonExists ? '확인됨' : '미설치 또는 초기화 필요'}</p>
                    <p className="mt-1 break-all text-xs opacity-80">{engineStatus?.runnerScript || '엔진 정보 확인 중...'}</p>
                  </div>
                  <button onClick={handleRepairEngine} disabled={isRepairingEngine} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-white/10 disabled:opacity-50">
                    {isRepairingEngine ? '실행 중...' : <span className="inline-flex items-center gap-2"><Wrench className="w-4 h-4" /> 자동 복구</span>}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">출력 폴더</label>
                <div className="flex gap-2">
                  <input value={outputDir} onChange={(event) => setOutputDir(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400" />
                  <button onClick={handleChooseOutputDir} className="rounded-2xl border border-white/10 bg-white/5 px-4 text-slate-100 hover:bg-white/10"><FolderOpen className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
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
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">출력 형식</label>
                <div className="flex gap-3">
                  {(['txt', 'srt'] as const).map((format) => (
                    <button key={format} onClick={() => toggleFormat(format)} className={`rounded-full border px-4 py-2 text-sm transition-colors ${outputFormats.includes(format) ? 'border-indigo-400/30 bg-indigo-500/15 text-white' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm leading-6 text-slate-300">
                <p className="mb-2 font-medium text-white">현재 상태</p>
                <p>{statusMessage}</p>
                {latestDetectedLanguage && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                    <span className="font-semibold uppercase">감지 언어 {latestDetectedLanguage.code}</span>
                    {latestDetectedLanguage.probability != null && <span className="text-slate-400">신뢰도 {(Number(latestDetectedLanguage.probability) * 100).toFixed(1)}%</span>}
                    {latestDetectedLanguage.fileName && <span className="text-slate-500">· {latestDetectedLanguage.fileName}</span>}
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <ScrollText className="w-4 h-4" /> 상세 로그
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={handleSaveLogs} disabled={isSavingLogs || logs.length === 0} className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white disabled:opacity-40">
                      <Save className="w-3.5 h-3.5" /> {isSavingLogs ? '저장 중...' : '로그 저장'}
                    </button>
                    <button onClick={() => setLogs([])} className="text-xs text-slate-400 hover:text-white">비우기</button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
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
                <div ref={logContainerRef} className="h-[320px] overflow-y-auto bg-slate-950/80 px-4 py-3 text-xs leading-6 text-slate-100">
                  {filteredLogs.length === 0 ? <p className="text-slate-500">로그가 여기에 표시됩니다.</p> : filteredLogs.map((entry) => (
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

              <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div className="text-sm font-semibold text-white">진행 타임라인</div>
                  <div className="text-xs text-slate-400">현재 단계 체류시간 {formatElapsedSeconds(phaseElapsedSeconds)}</div>
                </div>
                <div className="max-h-[240px] overflow-y-auto px-4 py-3 space-y-3">
                  {timelineItems.length === 0 ? (
                    <p className="text-sm text-slate-400">타임라인 항목이 아직 없습니다.</p>
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

              {!isDesktop && <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">이 화면은 Electron 데스크톱 앱에서 사용할 때 파일 선택/변환 기능이 활성화됩니다.</div>}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
