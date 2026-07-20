import {beforeEach, describe, expect, test, vi} from 'vitest';
import type {RequestHandler} from './$types';

let GET: RequestHandler;
let store: typeof import('../../../../../lib/server/timerStore');

beforeEach(async () => {
  vi.resetModules();
  ({GET} = await import('./+server'));
  store = await import('../../../../../lib/server/timerStore');
});

// minimal fake RequestEvent, only fields the handler uses
function fakeGetEvent(id: string): Parameters<RequestHandler>[0] {
  const request = new Request(`http://localhost/api/timers/${id}/stream`);
  return {params: {id}, request} as Parameters<RequestHandler>[0];
}

describe('GET /api/timers/[id]/stream', () => {
  test('returns 404 for unknown id, no stream opened', async () => {
    const res = await GET(fakeGetEvent('nope'));
    expect(res.status).toBe(404);
  });

  test('streams an initial snapshot event for an existing timer', async () => {
    const t = store.createTimer({name: 'A', durationSec: 30});
    const res = await GET(fakeGetEvent(t.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');

    const reader = res.body!.getReader();
    const {value} = await reader.read();
    const chunk = new TextDecoder().decode(value);
    expect(chunk).toContain('event: snapshot');
    expect(chunk).toContain(t.id);
    await reader.cancel();
  });

  test('streams a snapshot event when the timer changes', async () => {
    const t = store.createTimer({name: 'A', durationSec: 30});
    const res = await GET(fakeGetEvent(t.id));
    const reader = res.body!.getReader();
    await reader.read(); // initial snapshot

    store.startTimer(t.id);
    const {value} = await reader.read();
    const chunk = new TextDecoder().decode(value);
    expect(chunk).toContain('event: snapshot');
    expect(chunk).toContain('"status":"running"');
    await reader.cancel();
  });

  test('streams a deleted event and closes when the timer is deleted', async () => {
    const t = store.createTimer({name: 'A', durationSec: 30});
    const res = await GET(fakeGetEvent(t.id));
    const reader = res.body!.getReader();
    await reader.read(); // initial snapshot

    store.deleteTimer(t.id);
    const {value, done} = await reader.read();
    const chunk = new TextDecoder().decode(value);
    expect(chunk).toContain('event: deleted');
    expect(done).toBe(false);
    const next = await reader.read();
    expect(next.done).toBe(true);
  });
});
