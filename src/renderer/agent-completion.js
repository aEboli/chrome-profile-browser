(function exposeAgentCompletion(root, factory) {
  const completion = factory();
  if (root) root.browserAgentCompletion = completion;
  if (typeof module === 'object' && module.exports) module.exports = completion;
})(typeof window !== 'undefined' ? window : null, () => {
  const JEV_ACTION_HISTORY_LIMIT = 24;

  function appendActionHistory(history, actions) {
    const previous = Array.isArray(history?.actions) ? history.actions : [];
    const next = Array.isArray(actions) ? actions : [];
    const combined = previous.concat(next);
    const overflow = Math.max(0, combined.length - JEV_ACTION_HISTORY_LIMIT);
    return {
      actions: combined.slice(overflow),
      omittedCount: Math.max(0, Number(history?.omittedCount) || 0) + overflow,
    };
  }

  function normalizeJevCompletion(result) {
    const answers = result?.answers && typeof result.answers === 'object' ? result.answers : {};
    const rawCompleted = answers.completed ?? answers.is_complete ?? answers.done;
    let completed;
    if (typeof rawCompleted === 'boolean') completed = rawCompleted;
    else if (typeof rawCompleted === 'number' && (rawCompleted === 0 || rawCompleted === 1)) completed = rawCompleted === 1;
    else if (typeof rawCompleted === 'string') {
      const value = rawCompleted.trim().toLowerCase();
      if (['true', 'yes', 'completed', 'complete', '是', '已完成', '完成'].includes(value)) completed = true;
      if (['false', 'no', 'incomplete', '未完成', '否'].includes(value)) completed = false;
    }
    if (typeof completed !== 'boolean') throw new Error('JEV 没有返回有效的 completed 判断');

    const rawConfidence = answers.confidence;
    const confidenceText = typeof rawConfidence === 'string' ? rawConfidence.trim() : '';
    const confidenceValue = rawConfidence === null || rawConfidence === undefined
      ? NaN
      : typeof rawConfidence === 'number'
        ? rawConfidence
        : Number(confidenceText.replace(/%$/, ''));
    let confidence = null;
    if (Number.isFinite(confidenceValue) && confidenceValue >= 0) {
      const percent = confidenceText.endsWith('%') || confidenceValue > 1 ? confidenceValue : confidenceValue * 100;
      if (percent <= 100) confidence = Math.round(percent * 10) / 10;
    }
    const reasonValue = answers.reason ?? answers.explanation;
    return {
      completed,
      confidence,
      reason: typeof reasonValue === 'string' ? reasonValue.trim().slice(0, 1000) : '',
    };
  }

  function confidenceLabel(judgment) {
    return judgment.confidence === null ? '未返回' : `${judgment.confidence}%`;
  }

  return Object.freeze({ appendActionHistory, confidenceLabel, normalizeJevCompletion });
});
