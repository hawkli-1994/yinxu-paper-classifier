const messageFromError = (error: unknown): string => error instanceof Error ? error.message : '';

const stripIpcPrefix = (value: string): string =>
  value
    .replace(/^Error invoking remote method 'review:save':\s*/u, '')
    .replace(/^Error:\s*/u, '')
    .trim();

/** Converts implementation errors returned by the main process into actionable review guidance. */
export const getReviewSaveErrorMessage = (error: unknown): string => {
  const raw = messageFromError(error);

  if (raw.includes('MISSING_KEY_METADATA') || raw.includes('作者、题名、出处和摘要是分类所需的关键元数据。')) {
    return '暂无法保存复核结果：作者、题名、出处和摘要尚未完整填写。请在“论文分类字段”中逐项补全后再次保存。';
  }

  if (raw.includes('UNVERIFIABLE_EVIDENCE') || raw.includes('证据无法在提取文本中核对。')) {
    return '暂无法保存复核结果：主分类证据无法与提取文本核对。请检查证据页码，并确认引文与原文完全一致。';
  }

  if (raw.includes('MISSING_EVIDENCE') || raw.includes('至少两条证据')) {
    return '暂无法保存复核结果：请至少保留两条可核对的主分类证据。';
  }

  const detail = stripIpcPrefix(raw);
  return detail ? `保存复核结果失败：${detail}` : '保存复核结果失败，请稍后重试。';
};
