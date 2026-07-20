import {beforeEach, describe, expect, test, vi} from 'vitest';
import type {RequestHandler} from '@sveltejs/kit';

let GET: RequestHandler;
let store: typeof import('../../../../lib/server/timerStore');

beforeEach(async () => {
  vi.resetModules();
  ({GET} = await import('./+server'));
  store = await import('../../../../lib/server/timerStore');
});

// minimal fake RequestEvent, only fields the handler uses
function fakeGetEvent(): Parameters<RequestHandler>[0] {
  const request = new Request('http://localhost/api/timers/stream');
  return {request} as Parameters<RequestHandler>[0];
}

describe('GET /api/timers/stream', () => {
  test('streams the current (empty) list immediately', async () => {
    const res = await GET(fakeGetEvent());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');

    const reader = res.body!.getReader();
    const {value} = await reader.read();
    const chunk = new TextDecoder().decode(value);
    expect(chunk).toContain('event: snapshot');
    expect(chunk).toContain('data: []');
    await reader.cancel();
  });

  test('streams the full list again whenever a timer is created', async () => {
    const res = await GET(fakeGetEvent());
    const reader = res.body!.getReader();
    await reader.read(); // initial empty list

    store.createTimer({name: 'A', durationSec: 30});
    const {value} = await reader.read();
    const chunk = new TextDecoder().decode(value);
    expect(chunk).toContain('"name":"A"');
    await reader.cancel();
  });
});
