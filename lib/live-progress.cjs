function describePhase(payload = {}) {
  if (payload.status === 'done') {
    return '텍스트 추출 완료';
  }
  if (payload.status === 'error') {
    return '오류 발생';
  }
  if (payload.phase === 'installing_runtime') {
    return 'Python 런타임 자동 설치 중';
  }
  if (payload.phase === 'installing_dependency') {
    return '의존성 자동 복구 중';
  }
  if (payload.phase === 'retrying') {
    return `자동 복구 후 재시도 ${payload.retryCount || 1}회차`;
  }
  return '실시간 변환 진행 중';
}

function summarizeLiveLogs(logs = [], limit = 20) {
  return logs.slice(-limit).map((entry) => String(entry.message || ''));
}

function filterLogsByLevel(logs = [], level = 'all') {
  if (level === 'all') {
    return [...logs];
  }
  return logs.filter((entry) => entry.level === level);
}

function buildTimelineItems(logs = []) {
  return logs.slice(-20).map((entry) => ({
    id: entry.id || `${entry.timestamp}-${entry.message}`,
    timestamp: entry.timestamp || '',
    label: entry.fileName ? `${entry.fileName}` : 'SYSTEM',
    level: entry.level || 'info',
    description: entry.message || '',
  }));
}

function formatElapsedSeconds(totalSeconds = 0) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(safe / 60);
  const seconds = String(safe % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function findDetectedLanguage(logs = [], fileName) {
  const relevantLogs = fileName
    ? logs.filter((entry) => entry.fileName === fileName)
    : logs;

  for (let index = relevantLogs.length - 1; index >= 0; index -= 1) {
    const entry = relevantLogs[index] || {};
    if (entry.meta?.eventType === 'detected_language' && entry.meta?.detectedLanguage) {
      return {
        code: String(entry.meta.detectedLanguage),
        probability: typeof entry.meta.languageProbability === 'number' ? entry.meta.languageProbability : null,
        fileName: entry.fileName || null,
      };
    }
    const message = String(entry.message || '');
    const match = message.match(/detected language\s*[:=]?\s*([a-z]{2}(?:-[A-Z]{2})?)(?:[^\d]+(\d*\.?\d+))?/i)
      || message.match(/언어\s*[:=]\s*([a-z]{2}(?:-[A-Z]{2})?)(?:[^\d]+(\d*\.?\d+))?/i)
      || message.match(/language(?:\s*[:=]|\s)is\s*([a-z]{2}(?:-[A-Z]{2})?)(?:[^\d]+(\d*\.?\d+))?/i);
    if (match) {
      return {
        code: match[1],
        probability: match[2] ? Number(match[2]) : null,
        fileName: entry.fileName || null,
      };
    }
  }

  return null;
}

module.exports = {
  describePhase,
  summarizeLiveLogs,
  filterLogsByLevel,
  buildTimelineItems,
  formatElapsedSeconds,
  findDetectedLanguage,
};
