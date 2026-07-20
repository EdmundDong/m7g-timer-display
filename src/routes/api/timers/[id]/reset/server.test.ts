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

describe('POST /api/timers/[id]/reset', () => {
  test('resets a running timer back to idle', async () => {
    const t = store.createTimer({name: 'A', durationSec: 30});
    store.startTimer(t.id);
    // @ts-expect-error minimal fake RequestEvent
    const res = await POST({params: {id: t.id}});
    expect(res.status).toBe(200);
    expect((await readJson<TimerState>(res)).status).toBe('idle');
  });

  test('returns 404 for unknown id', async () => {
    // @ts-expect-error minimal fake RequestEvent
    const res = await POST({params: {id: 'nope'}});
    expect(res.status).toBe(404);
  });
});
