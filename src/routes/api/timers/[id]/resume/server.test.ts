import {beforeEach, describe, expect, test, vi} from 'vitest';
import type {RequestHandler} from './$types';
import type {TimerState} from '$lib/types';
import {readJson} from '$lib/http';

let POST: RequestHandler;
let store: typeof import('../../../../../lib/server/timerStore');

beforeEach(async () => {
  vi.resetModules();
  ({POST} = await import('./+server'));
  store = await import('../../../../../lib/server/timerStore');
});

describe('POST /api/timers/[id]/resume', () => {
  test('resumes a paused timer', async () => {
    const t = store.createTimer({name: 'A', durationSec: 30});
    store.startTimer(t.id);
    store.pauseTimer(t.id);
    // @ts-expect-error minimal fake RequestEvent
    const res = await POST({params: {id: t.id}});
    expect(res.status).toBe(200);
    expect((await readJson<TimerState>(res)).status).toBe('running');
  });

  test('auto-creates an unknown id, but still 409s (idle, not paused)', async () => {
    // @ts-expect-error minimal fake RequestEvent
    const res = await POST({params: {id: 'nope'}});
    expect(res.status).toBe(409);
    expect(store.getOne('nope')).toBeDefined();
  });

  test('returns 409 if not paused', async () => {
    const t = store.createTimer({name: 'A', durationSec: 30});
    // @ts-expect-error minimal fake RequestEvent
    const res = await POST({params: {id: t.id}});
    expect(res.status).toBe(409);
  });
});
