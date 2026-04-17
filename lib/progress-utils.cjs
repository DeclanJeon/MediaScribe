function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeProgress(status, progress) {
  if (status === 'done' || status === 'error') {
    return 100;
  }
  if (status === 'processing') {
    return clamp(Number(progress) || 0, 0, 99);
  }
  return 0;
}

function buildProgressSnapshot(items) {
  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  const completed = list.filter((item) => item.status === 'done').length;
  const failed = list.filter((item) => item.status === 'error').length;
  const active = list.filter((item) => item.status === 'processing').length;
  const accumulated = list.reduce((sum, item) => sum + normalizeProgress(item.status, item.progress), 0);
  const percent = total === 0 ? 0 : Math.round(accumulated / total);

  return {
    total,
    completed,
    failed,
    active,
    percent,
  };
}

function createLogEntry(level, fileName, message, timestamp, meta) {
  return {
    id: `${timestamp || new Date().toLocaleTimeString()}-${fileName || 'global'}-${Math.random().toString(36).slice(2, 8)}`,
    level,
    fileName: fileName || '',
    message: String(message || ''),
    timestamp: timestamp || new Date().toLocaleTimeString(),
    meta: meta && typeof meta === 'object' ? meta : undefined,
  };
}

module.exports = {
  buildProgressSnapshot,
  createLogEntry,
};
