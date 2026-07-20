import {beforeEach, describe, expect, test, vi} from 'vitest';
import type {RequestHandler} from '@sveltejs/kit';
import type {TimerState} from '$lib/types';
import {readJson, type ErrorBody} from '$lib/http';

let GET: RequestHandler;
let POST: RequestHandler;

beforeEach(async () => {
  vi.resetModules();
  ({GET, POST} = await import('./+server'));
});

function postRequest(body: unknown) {
  return new Request('http://localhost/api/timers', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {'content-type': 'application/json'},
  });
}

describe('GET /api/timers', () => {
  test('returns an empty list when no timers exist', async () => {
    // @ts-expect-error minimal fake RequestEvent, only fields the handler uses
    const res = await GET({});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test('returns created timers', async () => {
    // @ts-expect-error minimal fake RequestEvent
    await POST({request: postRequest({name: 'A', durationSec: 30})});
    // @ts-expect-error minimal fake RequestEvent
    const res = await GET({});
    const list = await readJson<TimerState[]>(res);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('A');
  });
});

describe('POST /api/timers', () => {
  test('creates a timer and returns 201 with the record', async () => {
    // @ts-expect-error minimal fake RequestEvent
    const res = await POST({request: postRequest({name: 'A', durationSec: 30})});
    expect(res.status).toBe(201);
    const body = await readJson<TimerState>(res);
    expect(body.name).toBe('A');
    expect(body.durationSec).toBe(30);
    expect(body.status).toBe('idle');
  });

  test('returns 400 on invalid input', async () => {
    // @ts-expect-error minimal fake RequestEvent
    const res = await POST({request: postRequest({name: 'A', durationSec: 0})});
    expect(res.status).toBe(400);
    const body = await readJson<ErrorBody>(res);
    expect(body.error).toBeTruthy();
  });

  test('blank name is auto-assigned rather than rejected', async () => {
    // @ts-expect-error minimal fake RequestEvent
    const res = await POST({request: postRequest({name: '', durationSec: 30})});
    expect(res.status).toBe(201);
    expect((await readJson<TimerState>(res)).name).toBe('Timer1');
  });

  test('returns 409 when the id derived from the name is already in use', async () => {
    // @ts-expect-error minimal fake RequestEvent
    await POST({request: postRequest({name: 'Smoke Test', durationSec: 30})});
    // @ts-expect-error minimal fake RequestEvent
    const res = await POST({request: postRequest({name: 'smoke test', durationSec: 30})});
    expect(res.status).toBe(409);
  });
});
