interface ActiveClassification {
  projectId: string;
  runId: string;
  cancel: () => void;
  cancellationRequested: boolean;
  completion: Promise<void>;
  resolveCompletion: () => void;
}

let activeClassification: ActiveClassification | undefined;

export const acquireClassificationLock = (projectId: string, runId: string, cancel: () => void = () => undefined): (() => void) => {
  if (activeClassification) throw new Error('当前已有论文正在分类，请等待该任务完成后再开始新的分类。');
  let resolveCompletion = (): void => undefined;
  const completion = new Promise<void>((resolve) => {
    resolveCompletion = resolve;
  });
  activeClassification = { projectId, runId, cancel, cancellationRequested: false, completion, resolveCompletion };
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (activeClassification?.projectId === projectId && activeClassification.runId === runId) {
      activeClassification.resolveCompletion();
      activeClassification = undefined;
    }
  };
};

export const requestClassificationCancellation = (projectId: string): Promise<void> => {
  if (!activeClassification || activeClassification.projectId !== projectId) throw new Error('当前项目没有正在进行的分类任务。');
  if (!activeClassification.cancellationRequested) {
    activeClassification.cancellationRequested = true;
    activeClassification.cancel();
  }
  return activeClassification.completion;
};

export const getActiveClassification = (): { projectId: string; runId: string } | undefined => activeClassification
  ? { projectId: activeClassification.projectId, runId: activeClassification.runId }
  : undefined;
