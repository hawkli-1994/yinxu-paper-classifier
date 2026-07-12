let activeClassification: { projectId: string; runId: string } | undefined;

export const acquireClassificationLock = (projectId: string, runId: string): (() => void) => {
  if (activeClassification) throw new Error('当前已有论文正在分类，请等待该任务完成后再开始新的分类。');
  activeClassification = { projectId, runId };
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (activeClassification?.projectId === projectId && activeClassification.runId === runId) activeClassification = undefined;
  };
};

export const getActiveClassification = (): { projectId: string; runId: string } | undefined => activeClassification ? { ...activeClassification } : undefined;
