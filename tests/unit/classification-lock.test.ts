import { describe, expect, it } from 'vitest';
import { acquireClassificationLock, getActiveClassification, requestClassificationCancellation } from '../../src/main/classification-lock';

describe('global classification lock', () => {
  it('allows only one classification run at a time and releases idempotently', () => {
    const release = acquireClassificationLock('project-1', 'run-1');
    expect(getActiveClassification()).toEqual({ projectId: 'project-1', runId: 'run-1' });
    expect(() => acquireClassificationLock('project-2', 'run-2')).toThrow('当前已有论文正在分类');
    release();
    release();
    const releaseSecond = acquireClassificationLock('project-2', 'run-2');
    expect(getActiveClassification()).toEqual({ projectId: 'project-2', runId: 'run-2' });
    releaseSecond();
    expect(getActiveClassification()).toBeUndefined();
  });

  it('forwards a cancellation request only to the active project', async () => {
    let cancelled = false;
    const release = acquireClassificationLock('project-cancel', 'run-cancel', () => {
      cancelled = true;
    });

    expect(() => requestClassificationCancellation('another-project')).toThrow('没有正在进行的分类任务');
    const completion = requestClassificationCancellation('project-cancel');
    expect(requestClassificationCancellation('project-cancel')).toBe(completion);
    expect(cancelled).toBe(true);
    release();
    await expect(completion).resolves.toBeUndefined();
  });
});
