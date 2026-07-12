import { describe, expect, it } from 'vitest';
import { acquireClassificationLock, getActiveClassification } from '../../src/main/classification-lock';

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
});
