import {beforeEach, describe, expect, test, vi} from 'vitest';
import type {RequestHandler} from './$types';
import type {TimerState} from '$lib/types';
import {readJson} from '$lib/http';

let PATCH: RequestHandler;
let DELETE: RequestHandler;
let store: typeof import('../../../../lib/server/timerStore');

beforeEach(async () => {
  vi.resetModules();
  ({PATCH, DELETE} = await import('./+server'));
  store = await import('../../../../lib/server/timerStore');
});

function patchRequest(body: unknown) {
  return new Request('http://localhost/api/timers/x', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: {'content-type': 'application/json'},
  });
}

describe('PATCH /api/timers/[id]', () => {
  test('updates an idle timer', async () => {
    const t = store.createTimer({name: 'A', durationSec: 30});
    // @ts-expect-error minimal fake RequestEvent
    const res = await PATCH({params: {id: t.id}, request: patchRequest({name: 'B'})});
    expect(res.status).toBe(200);
    expect((await readJson<TimerState>(res)).name).toBe('B');
  });

  test('returns 404 for unknown id', async () => {
    // @ts-expect-error minimal fake RequestEvent
    const res = await PATCH({params: {id: 'nope'}, request: patchRequest({name: 'B'})});
    expect(res.status).toBe(404);
  });

  test('updates a running timer (settings editable while running)', async () => {
    const t = store.createTimer({name: 'A', durationSec: 30});
    store.startTimer(t.id);
    // @ts-expect-error minimal fake RequestEvent
    const res = await PATCH({params: {id: t.id}, request: patchRequest({name: 'B'})});
    expect(res.status).toBe(200);
    expect((await readJson<TimerState>(res)).name).toBe('B');
  });
});

describe('DELETE /api/timers/[id]', () => {
  test('deletes an existing timer, returns 204', async () => {
    const t = store.createTimer({name: 'A', durationSec: 30});
    // @ts-expect-error minimal fake RequestEvent
    const res = await DELETE({params: {id: t.id}});
    expect(res.status).toBe(204);
    expect(store.getOne(t.id)).toBeUndefined();
  });

  test('returns 404 for unknown id', async () => {
    // @ts-expect-error minimal fake RequestEvent
    const res = await DELETE({params: {id: 'nope'}});
    expect(res.status).toBe(404);
  });
});
