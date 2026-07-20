import type {CreateTimerInput, PatchTimerInput, TimerState, TimerStreamEvent} from '../types';
import {computeRemainingSec} from '../timerMath';
import {ConflictError, NotFoundError, ValidationError} from './errors';
import {validateTimerFields} from './validation';
import {slugify} from './slug';

const timers = new Map<string, TimerState>();
const endTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const perTimerSubscribers = new Map<string, Set<(evt: TimerStreamEvent) => void>>();
const globalSubscribers = new Set<(list: TimerState[]) => void>();

export function getAll(): TimerState[] {
  return Array.from(timers.values());
}

export function getOne(id: string): TimerState | undefined {
  return timers.get(id);
}

function require(id: string): TimerState {
  const t = timers.get(id);
  if (!t) throw new NotFoundError(`no timer with id ${id}`);
  return t;
}

/** Lowest "TimerN" whose slug isn't already in use as another timer's id, so deleted numbers get reused. */
function nextAutoName(excludeId?: string): string {
  let n = 1;
  while (true) {
    const candidateId = slugify(`Timer${n}`);
    const collision = timers.has(candidateId) && candidateId !== excludeId;
    if (!collision) return `Timer${n}`;
    n++;
  }
}

function resolveName(name: string | undefined, excludeId?: string): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : nextAutoName(excludeId);
}

export function createTimer(input: CreateTimerInput): TimerState {
  const merged = {
    name: resolveName(input.name),
    durationSec: input.durationSec,
    redZoneSec: input.redZoneSec ?? 10,
    disappearSec: input.disappearSec ?? 10,
    erodeFrom: input.erodeFrom ?? 'left',
    mirror: input.mirror ?? false,
  } as const;
  validateTimerFields(merged);

  const id = slugify(merged.name);
  if (!id) {
    throw new ValidationError('name must contain at least one letter or number');
  }
  if (timers.has(id)) {
    throw new ConflictError(`timer id "${id}" is already in use`);
  }

  const timer: TimerState = {
    id,
    ...merged,
    status: 'idle',
    startEpochMs: null,
    pausedRemainingSec: null,
  };
  timers.set(timer.id, timer);
  notifyGlobal();
  return timer;
}

export function patchTimer(id: string, patch: PatchTimerInput): TimerState {
  const t = require(id);
  const merged = {
    name: patch.name !== undefined ? resolveName(patch.name, id) : t.name,
    durationSec: patch.durationSec ?? t.durationSec,
    redZoneSec: patch.redZoneSec ?? t.redZoneSec,
    disappearSec: patch.disappearSec ?? t.disappearSec,
    erodeFrom: patch.erodeFrom ?? t.erodeFrom,
    mirror: patch.mirror ?? t.mirror,
  };
  validateTimerFields(merged);

  Object.assign(t, merged);
  if (t.status === 'paused' && t.pausedRemainingSec !== null) {
    t.pausedRemainingSec = Math.min(t.pausedRemainingSec, t.durationSec);
  }
  if (t.status === 'running') {
    scheduleEndTransition(id);
  }
  notifyTimer(id);
  return t;
}

export function adjustDuration(id: string, deltaSec: number): TimerState {
  const t = require(id);
  const newRemaining = computeRemainingSec(t, Date.now()) + deltaSec;
  if (newRemaining <= 0) {
    throw new ConflictError('cannot reduce timer to 0 or below');
  }
  const newDurationSec = t.durationSec + deltaSec;
  validateTimerFields({...t, durationSec: newDurationSec});

  t.durationSec = newDurationSec;
  if (t.status === 'paused' && t.pausedRemainingSec !== null) {
    t.pausedRemainingSec = newRemaining;
  }
  if (t.status === 'running') {
    scheduleEndTransition(id);
  }
  notifyTimer(id);
  return t;
}

export function deleteTimer(id: string): void {
  require(id);
  clearEndTransition(id);
  timers.delete(id);
  notifyDeleted(id);
}

export function startTimer(id: string): TimerState {
  const t = require(id);
  if (t.status === 'running') {
    throw new ConflictError('timer is already running');
  }
  t.status = 'running';
  t.startEpochMs = Date.now();
  t.pausedRemainingSec = null;
  scheduleEndTransition(id);
  notifyTimer(id);
  return t;
}

export function pauseTimer(id: string): TimerState {
  const t = require(id);
  if (t.status !== 'running') {
    throw new ConflictError('timer is not running');
  }
  t.pausedRemainingSec = computeRemainingSec(t, Date.now());
  t.startEpochMs = null;
  t.status = 'paused';
  clearEndTransition(id);
  notifyTimer(id);
  return t;
}

export function resumeTimer(id: string): TimerState {
  const t = require(id);
  if (t.status !== 'paused') {
    throw new ConflictError('timer is not paused');
  }
  const remaining = t.pausedRemainingSec ?? t.durationSec;
  t.startEpochMs = Date.now() - (t.durationSec - remaining) * 1000;
  t.pausedRemainingSec = null;
  t.status = 'running';
  scheduleEndTransition(id);
  notifyTimer(id);
  return t;
}

export function resetTimer(id: string): TimerState {
  const t = require(id);
  clearEndTransition(id);
  t.status = 'idle';
  t.startEpochMs = null;
  t.pausedRemainingSec = null;
  notifyTimer(id);
  return t;
}

export function subscribeTimer(id: string, cb: (evt: TimerStreamEvent) => void): () => void {
  let subs = perTimerSubscribers.get(id);
  if (!subs) {
    subs = new Set();
    perTimerSubscribers.set(id, subs);
  }
  subs.add(cb);
  return () => subs.delete(cb);
}

export function subscribeAll(cb: (list: TimerState[]) => void): () => void {
  globalSubscribers.add(cb);
  return () => globalSubscribers.delete(cb);
}

function scheduleEndTransition(id: string) {
  clearEndTransition(id);
  const t = timers.get(id);
  if (!t || t.status !== 'running' || t.startEpochMs === null) return;
  const remainingMs = Math.max(0, t.durationSec * 1000 - (Date.now() - t.startEpochMs));
  const handle = setTimeout(() => {
    const cur = timers.get(id);
    endTimeouts.delete(id);
    if (!cur || cur.status !== 'running') return;
    cur.status = 'ended';
    cur.startEpochMs = null;
    cur.pausedRemainingSec = 0;
    notifyTimer(id);
  }, remainingMs);
  endTimeouts.set(id, handle);
}

function clearEndTransition(id: string) {
  const h = endTimeouts.get(id);
  if (h) {
    clearTimeout(h);
    endTimeouts.delete(id);
  }
}

function notifyTimer(id: string) {
  const t = timers.get(id);
  const subs = perTimerSubscribers.get(id);
  if (subs && t) {
    for (const cb of subs) cb({type: 'snapshot', timer: t});
  }
  notifyGlobal();
}

function notifyDeleted(id: string) {
  const subs = perTimerSubscribers.get(id);
  if (subs) {
    for (const cb of subs) cb({type: 'deleted'});
    perTimerSubscribers.delete(id);
  }
  notifyGlobal();
}

function notifyGlobal() {
  const list = getAll();
  for (const cb of globalSubscribers) cb(list);
}
