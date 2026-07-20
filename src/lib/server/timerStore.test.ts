import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import type {TimerState, TimerStreamEvent} from '../types';

// The store holds module-scope state (Map + timeouts + subscribers), so each test
// gets a fresh module instance via resetModules + dynamic re-import, rather than
// adding a test-only reset export to the production module. The error classes must
// be re-imported from the same fresh module graph too, otherwise `instanceof`
// checks against a statically-imported (pre-reset) class identity would fail.
let store: typeof import('./timerStore');
let NotFoundError: typeof import('./errors').NotFoundError;
let ConflictError: typeof import('./errors').ConflictError;
let ValidationError: typeof import('./errors').ValidationError;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  store = await import('./timerStore');
  ({NotFoundError, ConflictError, ValidationError} = await import('./errors'));
});

afterEach(() => {
  vi.useRealTimers();
});

function createDefault(overrides: Partial<Parameters<typeof store.createTimer>[0]> = {}) {
  return store.createTimer({name: 'Test Timer', durationSec: 60, ...overrides});
}

describe('createTimer', () => {
  test('creates a timer with defaults applied', () => {
    const timer = createDefault();
    expect(timer.name).toBe('Test Timer');
    expect(timer.durationSec).toBe(60);
    expect(timer.redZoneSec).toBe(10);
    expect(timer.disappearSec).toBe(10);
    expect(timer.erodeFrom).toBe('left');
    expect(timer.mirror).toBe(false);
    expect(timer.status).toBe('idle');
    expect(timer.startEpochMs).toBeNull();
    expect(timer.pausedRemainingSec).toBeNull();
    expect(timer.id).toBe('test-timer');
  });

  test('id is a slug derived from the name, readable in a URL', () => {
    const timer = createDefault({name: 'Smoke Test!!'});
    expect(timer.id).toBe('smoke-test');
  });

  test('rejects creating a timer whose slug collides with an existing timer id', () => {
    createDefault({name: 'Smoke Test'});
    expect(() => createDefault({name: 'smoke test'})).toThrow(ConflictError);
  });

  test('rejects a name that slugifies to an empty id', () => {
    expect(() => createDefault({name: '!!!'})).toThrow(ValidationError);
  });

  test('respects explicit overrides', () => {
    const timer = createDefault({redZoneSec: 5, disappearSec: 3, erodeFrom: 'right', mirror: true});
    expect(timer.redZoneSec).toBe(5);
    expect(timer.disappearSec).toBe(3);
    expect(timer.erodeFrom).toBe('right');
    expect(timer.mirror).toBe(true);
  });

  test('blank name is auto-assigned Timer1', () => {
    const timer = createDefault({name: ''});
    expect(timer.name).toBe('Timer1');
  });

  test('whitespace-only name is treated as blank too', () => {
    const timer = createDefault({name: '   '});
    expect(timer.name).toBe('Timer1');
  });

  test('sequential blank-named timers get sequential numbers', () => {
    const a = createDefault({name: ''});
    const b = createDefault({name: ''});
    const c = createDefault({name: ''});
    expect([a.name, b.name, c.name]).toEqual(['Timer1', 'Timer2', 'Timer3']);
  });

  test('deleting a numbered timer backfills its number on the next blank create', () => {
    const a = createDefault({name: ''}); // Timer1
    createDefault({name: ''}); // Timer2
    store.deleteTimer(a.id);
    const c = createDefault({name: ''});
    expect(c.name).toBe('Timer1');
  });

  test('auto-naming skips numbers already taken by explicitly-named timers', () => {
    createDefault({name: 'Timer1'});
    const auto = createDefault({name: ''});
    expect(auto.name).toBe('Timer2');
  });

  test('rejects non-positive durationSec', () => {
    expect(() => createDefault({durationSec: 0})).toThrow(ValidationError);
  });

  test('rejects redZoneSec >= durationSec', () => {
    expect(() => createDefault({durationSec: 10, redZoneSec: 10})).toThrow(ValidationError);
  });

  test('rejects negative disappearSec', () => {
    expect(() => createDefault({disappearSec: -1})).toThrow(ValidationError);
  });

  test('rejects invalid erodeFrom', () => {
    // @ts-expect-error testing invalid input at runtime
    expect(() => createDefault({erodeFrom: 'up'})).toThrow(ValidationError);
  });
});

describe('getAll / getOne', () => {
  test('getAll returns all created timers', () => {
    createDefault({name: 'A'});
    createDefault({name: 'B'});
    expect(store.getAll()).toHaveLength(2);
  });

  test('getOne returns undefined for unknown id', () => {
    expect(store.getOne('nope')).toBeUndefined();
  });
});

describe('startTimer', () => {
  test('starts an idle timer: sets running, startEpochMs=now', () => {
    const t = createDefault();
    const now = Date.now();
    const started = store.startTimer(t.id);
    expect(started.status).toBe('running');
    expect(started.startEpochMs).toBe(now);
    expect(started.pausedRemainingSec).toBeNull();
  });

  test('starting an already-running timer throws ConflictError', () => {
    const t = createDefault();
    store.startTimer(t.id);
    expect(() => store.startTimer(t.id)).toThrow(ConflictError);
  });

  test('starting an ended timer restarts fresh from full duration', () => {
    const t = createDefault({durationSec: 5, redZoneSec: 1});
    store.startTimer(t.id);
    vi.advanceTimersByTime(5001);
    expect(store.getOne(t.id)?.status).toBe('ended');
    const restarted = store.startTimer(t.id);
    expect(restarted.status).toBe('running');
    expect(restarted.startEpochMs).toBe(Date.now());
  });

  test('starting unknown id throws NotFoundError', () => {
    expect(() => store.startTimer('nope')).toThrow(NotFoundError);
  });
});

describe('pauseTimer', () => {
  test('pauses a running timer, freezing remaining time', () => {
    const t = createDefault({durationSec: 60});
    store.startTimer(t.id);
    vi.advanceTimersByTime(20_000);
    const paused = store.pauseTimer(t.id);
    expect(paused.status).toBe('paused');
    expect(paused.pausedRemainingSec).toBe(40);
    expect(paused.startEpochMs).toBeNull();
  });

  test('pausing an idle timer throws ConflictError', () => {
    const t = createDefault();
    expect(() => store.pauseTimer(t.id)).toThrow(ConflictError);
  });

  test('pausing an already-paused timer throws ConflictError', () => {
    const t = createDefault();
    store.startTimer(t.id);
    store.pauseTimer(t.id);
    expect(() => store.pauseTimer(t.id)).toThrow(ConflictError);
  });
});

describe('resumeTimer', () => {
  test('resumes seamlessly from the frozen remaining value', () => {
    const t = createDefault({durationSec: 60});
    store.startTimer(t.id);
    vi.advanceTimersByTime(20_000); // remaining = 40
    store.pauseTimer(t.id);
    vi.advanceTimersByTime(10_000); // paused wall-clock passes, should not count
    const resumed = store.resumeTimer(t.id);
    expect(resumed.status).toBe('running');
    // remaining right after resume should still be ~40s, not 30s
    const remainingNow = resumed.durationSec - (Date.now() - resumed.startEpochMs!) / 1000;
    expect(remainingNow).toBeCloseTo(40, 5);
  });

  test('resuming an idle timer throws ConflictError', () => {
    const t = createDefault();
    expect(() => store.resumeTimer(t.id)).toThrow(ConflictError);
  });

  test('resuming a running timer throws ConflictError', () => {
    const t = createDefault();
    store.startTimer(t.id);
    expect(() => store.resumeTimer(t.id)).toThrow(ConflictError);
  });
});

describe('resetTimer', () => {
  test('resets a running timer back to idle', () => {
    const t = createDefault({durationSec: 60});
    store.startTimer(t.id);
    vi.advanceTimersByTime(20_000);
    const reset = store.resetTimer(t.id);
    expect(reset.status).toBe('idle');
    expect(reset.startEpochMs).toBeNull();
    expect(reset.pausedRemainingSec).toBeNull();
  });

  test('reset cancels a pending end-transition so it never fires late', () => {
    const t = createDefault({durationSec: 5, redZoneSec: 1});
    store.startTimer(t.id);
    vi.advanceTimersByTime(2000);
    store.resetTimer(t.id);
    vi.advanceTimersByTime(10_000);
    expect(store.getOne(t.id)?.status).toBe('idle');
  });

  test('resetting an idle timer is a no-op success (idempotent)', () => {
    const t = createDefault();
    expect(() => store.resetTimer(t.id)).not.toThrow();
  });
});

describe('deleteTimer', () => {
  test('removes the timer from the store', () => {
    const t = createDefault();
    store.deleteTimer(t.id);
    expect(store.getOne(t.id)).toBeUndefined();
  });

  test('deleting unknown id throws NotFoundError', () => {
    expect(() => store.deleteTimer('nope')).toThrow(NotFoundError);
  });

  test('deleting a running timer cancels its pending end-transition without throwing', () => {
    const t = createDefault({durationSec: 5, redZoneSec: 1});
    store.startTimer(t.id);
    vi.advanceTimersByTime(2000);
    expect(() => store.deleteTimer(t.id)).not.toThrow();
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
    expect(store.getOne(t.id)).toBeUndefined();
  });
});

describe('patchTimer', () => {
  test('updates settings while idle', () => {
    const t = createDefault();
    const patched = store.patchTimer(t.id, {name: 'Renamed', redZoneSec: 15});
    expect(patched.name).toBe('Renamed');
    expect(patched.redZoneSec).toBe(15);
  });

  test('renaming via patch does not change the (URL-facing) id', () => {
    const t = createDefault({name: 'Original Name'});
    const patched = store.patchTimer(t.id, {name: 'Totally Different Name'});
    expect(patched.id).toBe(t.id);
    expect(patched.id).toBe('original-name');
  });

  test('allows patch while running', () => {
    const t = createDefault();
    store.startTimer(t.id);
    expect(() => store.patchTimer(t.id, {name: 'Still Running'})).not.toThrow();
    expect(store.getOne(t.id)?.name).toBe('Still Running');
  });

  test('blank name patch while running auto-assigns Timer1', () => {
    const t = createDefault({name: 'Original'});
    store.startTimer(t.id);
    const patched = store.patchTimer(t.id, {name: ''});
    expect(patched.name).toBe('Timer1');
  });

  test('patching durationSec up while running reschedules the end-transition later', () => {
    const t = createDefault({durationSec: 10, redZoneSec: 2});
    store.startTimer(t.id);
    vi.advanceTimersByTime(5000); // remaining = 5
    store.patchTimer(t.id, {durationSec: 20}); // remaining should become 15
    vi.advanceTimersByTime(10_001); // old end-time (10s) long passed, should still be running
    expect(store.getOne(t.id)?.status).toBe('running');
    vi.advanceTimersByTime(5000); // total elapsed 20s -> should end now
    expect(store.getOne(t.id)?.status).toBe('ended');
  });

  test('patching durationSec down while running reschedules the end-transition earlier', () => {
    const t = createDefault({durationSec: 20, redZoneSec: 2});
    store.startTimer(t.id);
    vi.advanceTimersByTime(5000); // remaining = 15
    store.patchTimer(t.id, {durationSec: 10}); // remaining should become 5
    vi.advanceTimersByTime(5001);
    expect(store.getOne(t.id)?.status).toBe('ended');
  });

  test('allows patch while paused', () => {
    const t = createDefault();
    store.startTimer(t.id);
    store.pauseTimer(t.id);
    expect(() => store.patchTimer(t.id, {name: 'Paused Edit'})).not.toThrow();
  });

  test('validates merged result, not just the patch fields in isolation', () => {
    const t = createDefault({durationSec: 20, redZoneSec: 5});
    // patching durationSec down to 5 makes existing redZoneSec(5) invalid (must be < durationSec)
    expect(() => store.patchTimer(t.id, {durationSec: 5})).toThrow(ValidationError);
  });

  test('clamps pausedRemainingSec when durationSec shrinks while paused', () => {
    const t = createDefault({durationSec: 60});
    store.startTimer(t.id);
    vi.advanceTimersByTime(10_000); // remaining = 50
    store.pauseTimer(t.id); // pausedRemainingSec = 50
    const patched = store.patchTimer(t.id, {durationSec: 30, redZoneSec: 5});
    expect(patched.pausedRemainingSec).toBe(30);
  });

  test('patching unknown id throws NotFoundError', () => {
    expect(() => store.patchTimer('nope', {name: 'x'})).toThrow(NotFoundError);
  });
});

describe('adjustDuration', () => {
  test('adding 60s while idle increases durationSec and remaining', () => {
    const t = createDefault({durationSec: 60});
    const adjusted = store.adjustDuration(t.id, 60);
    expect(adjusted.durationSec).toBe(120);
  });

  test('adding 60s while running extends remaining without resetting elapsed', () => {
    const t = createDefault({durationSec: 60});
    store.startTimer(t.id);
    vi.advanceTimersByTime(10_000); // remaining = 50
    const adjusted = store.adjustDuration(t.id, 60);
    expect(adjusted.durationSec).toBe(120);
    const remaining = store.getOne(t.id)!.durationSec - 10; // elapsed still 10s
    expect(remaining).toBe(110);
  });

  test('adding 60s while running reschedules the end-transition later', () => {
    const t = createDefault({durationSec: 60, redZoneSec: 5});
    store.startTimer(t.id);
    vi.advanceTimersByTime(50_000); // remaining = 10
    store.adjustDuration(t.id, 60); // remaining becomes 70
    vi.advanceTimersByTime(10_001); // old end-time long passed
    expect(store.getOne(t.id)?.status).toBe('running');
    vi.advanceTimersByTime(60_000);
    expect(store.getOne(t.id)?.status).toBe('ended');
  });

  test('removing 60s while paused reduces the frozen pausedRemainingSec', () => {
    const t = createDefault({durationSec: 120});
    store.startTimer(t.id);
    vi.advanceTimersByTime(10_000); // remaining = 110
    store.pauseTimer(t.id);
    const adjusted = store.adjustDuration(t.id, -60);
    expect(adjusted.pausedRemainingSec).toBe(50);
  });

  test('removing 60s while running reschedules the end-transition earlier', () => {
    const t = createDefault({durationSec: 120, redZoneSec: 5});
    store.startTimer(t.id);
    vi.advanceTimersByTime(10_000); // remaining = 110
    store.adjustDuration(t.id, -60); // remaining becomes 50
    vi.advanceTimersByTime(50_001);
    expect(store.getOne(t.id)?.status).toBe('ended');
  });

  test('rejects removing 60s when remaining is under a minute', () => {
    const t = createDefault({durationSec: 60, redZoneSec: 5});
    store.startTimer(t.id);
    vi.advanceTimersByTime(30_000); // remaining = 30
    expect(() => store.adjustDuration(t.id, -60)).toThrow(ConflictError);
  });

  test('rejects removing 60s that would bring remaining to exactly 0', () => {
    const t = createDefault({durationSec: 60, redZoneSec: 5});
    expect(() => store.adjustDuration(t.id, -60)).toThrow(ConflictError);
  });

  test('adjusting unknown id throws NotFoundError', () => {
    expect(() => store.adjustDuration('nope', 60)).toThrow(NotFoundError);
  });
});

describe('scheduled ended-transition', () => {
  test('status flips to ended exactly when duration elapses', () => {
    const t = createDefault({durationSec: 5, redZoneSec: 1});
    store.startTimer(t.id);
    vi.advanceTimersByTime(4999);
    expect(store.getOne(t.id)?.status).toBe('running');
    vi.advanceTimersByTime(2);
    expect(store.getOne(t.id)?.status).toBe('ended');
  });

  test('ended state clears startEpochMs and zeroes pausedRemainingSec', () => {
    const t = createDefault({durationSec: 5, redZoneSec: 1});
    store.startTimer(t.id);
    vi.advanceTimersByTime(5001);
    const ended = store.getOne(t.id)!;
    expect(ended.startEpochMs).toBeNull();
    expect(ended.pausedRemainingSec).toBe(0);
  });

  test('pausing before natural end prevents the stale timeout from firing', () => {
    const t = createDefault({durationSec: 5, redZoneSec: 1});
    store.startTimer(t.id);
    vi.advanceTimersByTime(2000);
    store.pauseTimer(t.id);
    vi.advanceTimersByTime(10_000);
    expect(store.getOne(t.id)?.status).toBe('paused');
  });

  test('resume reschedules a correct new end-transition', () => {
    const t = createDefault({durationSec: 5, redZoneSec: 1});
    store.startTimer(t.id);
    vi.advanceTimersByTime(2000); // remaining = 3
    store.pauseTimer(t.id);
    store.resumeTimer(t.id);
    vi.advanceTimersByTime(2999);
    expect(store.getOne(t.id)?.status).toBe('running');
    vi.advanceTimersByTime(2);
    expect(store.getOne(t.id)?.status).toBe('ended');
  });
});

describe('subscriptions', () => {
  test('subscribeTimer receives a snapshot event on state change', () => {
    const t = createDefault();
    const events: TimerStreamEvent[] = [];
    const unsubscribe = store.subscribeTimer(t.id, (evt) => events.push(evt));
    store.startTimer(t.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({type: 'snapshot', timer: store.getOne(t.id)});
    unsubscribe();
  });

  test('subscribeTimer stops receiving events after unsubscribe', () => {
    const t = createDefault();
    const events: TimerStreamEvent[] = [];
    const unsubscribe = store.subscribeTimer(t.id, (evt) => events.push(evt));
    unsubscribe();
    store.startTimer(t.id);
    expect(events).toHaveLength(0);
  });

  test('subscribeTimer receives a deleted event on delete', () => {
    const t = createDefault();
    const events: TimerStreamEvent[] = [];
    store.subscribeTimer(t.id, (evt) => events.push(evt));
    store.deleteTimer(t.id);
    expect(events).toEqual([{type: 'deleted'}]);
  });

  test('subscribeTimer receives the server-driven ended transition', () => {
    const t = createDefault({durationSec: 5, redZoneSec: 1});
    const events: TimerStreamEvent[] = [];
    store.subscribeTimer(t.id, (evt) => events.push(evt));
    store.startTimer(t.id);
    vi.advanceTimersByTime(5001);
    const last = events[events.length - 1];
    expect(last.type).toBe('snapshot');
    expect((last as {type: 'snapshot'; timer: TimerState}).timer.status).toBe('ended');
  });

  test('subscribeAll receives the full list on any change', () => {
    const lists: TimerState[][] = [];
    const unsubscribe = store.subscribeAll((list) => lists.push(list));
    createDefault({name: 'A'});
    expect(lists).toHaveLength(1);
    expect(lists[0]).toHaveLength(1);
    unsubscribe();
  });
});
