const { createLogEntry } = require('./progress-utils.cjs');

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatProbability(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }
  return Number(value.toFixed(2));
}

function describeOutputs(outputs = {}) {
  const available = Object.entries(outputs)
    .filter(([, filePath]) => Boolean(filePath))
    .map(([name]) => String(name).toUpperCase());
  return available.length ? `${available.join(', ')} 저장` : '출력 저장';
}

function parseTaggedOutputLine(line, file, progress) {
  const trimmed = String(line || '').trim();
  if (!trimmed) {
    return { handled: false };
  }

  if (trimmed.startsWith('TRANSCRIPT_LINE|')) {
    const transcript = safeJsonParse(trimmed.slice('TRANSCRIPT_LINE|'.length));
    if (!transcript) {
      return { handled: false };
    }
    return {
      handled: true,
      status: {
        kind: 'status',
        filePath: file.path,
        fileName: file.name,
        status: 'processing',
        progress,
        partialText: transcript.text,
        transcriptSegment: transcript,
      },
    };
  }

  if (!trimmed.startsWith('APP_EVENT|')) {
    return { handled: false };
  }

  const event = safeJsonParse(trimmed.slice('APP_EVENT|'.length));
  if (!event || typeof event !== 'object') {
    return { handled: false };
  }

  const fileName = String(event.file_name || file?.name || '');
  const baseMeta = {
    eventType: String(event.type || 'unknown'),
    rawEvent: event,
  };

  if (event.type === 'file_processing') {
    return {
      handled: true,
      log: createLogEntry('info', fileName, '처리 시작', undefined, baseMeta),
      status: {
        kind: 'status',
        filePath: file.path,
        fileName,
        status: 'processing',
        progress,
      },
    };
  }

  if (event.type === 'detected_language') {
    const probability = formatProbability(Number(event.language_probability));
    const language = String(event.detected_language || 'unknown');
    return {
      handled: true,
      log: createLogEntry(
        'info',
        fileName,
        probability === null ? `감지 언어: ${language}` : `감지 언어: ${language} (확률 ${probability})`,
        undefined,
        {
          ...baseMeta,
          detectedLanguage: language,
          languageProbability: probability,
        },
      ),
    };
  }

  if (event.type === 'vad_retry') {
    return {
      handled: true,
      log: createLogEntry(
        'warn',
        fileName,
        'VAD 음성 감지 결과가 비어 있어 VAD 없이 한 번 더 시도했습니다.',
        undefined,
        baseMeta,
      ),
    };
  }

  if (event.type === 'file_done') {
    const outputs = event.outputs && typeof event.outputs === 'object' ? event.outputs : {};
    return {
      handled: true,
      log: createLogEntry('success', fileName, `처리 완료 · ${describeOutputs(outputs)}`, undefined, {
        ...baseMeta,
        outputs,
      }),
      status: {
        kind: 'status',
        filePath: file.path,
        fileName,
        status: 'done',
        progress: 100,
        outputFiles: outputs,
      },
    };
  }

  if (event.type === 'file_failed') {
    const error = String(event.error || '알 수 없는 오류');
    return {
      handled: true,
      log: createLogEntry('error', fileName, `처리 실패 · ${error}`, undefined, {
        ...baseMeta,
        error,
      }),
      status: {
        kind: 'status',
        filePath: file.path,
        fileName,
        status: 'error',
        progress: 100,
        error,
      },
    };
  }

  if (event.type === 'summary') {
    return {
      handled: true,
      log: createLogEntry('info', '', `작업 종료: 완료 ${Number(event.completed) || 0}, 실패 ${Number(event.failed) || 0}` , undefined, {
        ...baseMeta,
        completed: Number(event.completed) || 0,
        failed: Number(event.failed) || 0,
        outputDir: event.output_dir || '',
      }),
    };
  }

  return { handled: false };
}

module.exports = {
  parseTaggedOutputLine,
};
