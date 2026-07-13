import { describe, expect, it } from 'vitest';
import type { RunEvent } from '../../src/shared/contracts';
import { mergeRunEvent } from '../../src/renderer/store';

const event = (phase: RunEvent['phase'], detail: string, progress: number): RunEvent => ({
  projectId: 'project-1',
  runId: 'run-1',
  phase,
  detail,
  progress
});

describe('classification run event display', () => {
  it('keeps one live row per phase instead of appending repeated Agent events', () => {
    let events = mergeRunEvent([], event('started', 'kimi/kimi-for-coding', 10));
    events = mergeRunEvent(events, event('agent', 'reading', 42));
    events = mergeRunEvent(events, event('agent', 'processing', 58));
    events = mergeRunEvent(events, event('agent', 'writing', 82));

    expect(events).toEqual([
      event('started', 'kimi/kimi-for-coding', 10),
      event('agent', 'writing', 82)
    ]);
  });

  it('starts a clean milestone list when a new run begins', () => {
    const previous = [event('started', 'old-model', 10), event('validated', 'done', 100)];
    const nextRun = { ...event('started', 'new-model', 10), runId: 'run-2' };

    expect(mergeRunEvent(previous, nextRun)).toEqual([nextRun]);
  });
});
