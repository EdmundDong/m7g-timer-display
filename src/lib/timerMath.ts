import type {TimerState} from './types';

export function computeRemainingSec(timer: TimerState, nowMs: number): number {
  switch (timer.status) {
    case 'running': {
      const elapsed = (nowMs - (timer.startEpochMs ?? nowMs)) / 1000;
      return Math.max(0, timer.durationSec - elapsed);
    }
    case 'paused':
      return timer.pausedRemainingSec ?? timer.durationSec;
    case 'idle':
      return timer.durationSec;
    case 'ended':
      return 0;
  }
}

export function computeVisiblePct(remainingSec: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.min(100, Math.max(0, (remainingSec / durationSec) * 100));
}

export function isDisappeared(remainingSec: number, disappearSec: number): boolean {
  return remainingSec <= disappearSec;
}

export interface ColorSegment {
  color: 'green' | 'yellow' | 'red';
  startPct: number;
  widthPct: number;
}

export function computeColorSegments(durationSec: number, redZoneSec: number): ColorSegment[] {
  const redStartPct = ((durationSec - redZoneSec) / durationSec) * 100;
  return [
    {color: 'green', startPct: 0, widthPct: 50},
    {color: 'yellow', startPct: 50, widthPct: redStartPct - 50},
    {color: 'red', startPct: redStartPct, widthPct: 100 - redStartPct},
  ];
}

export function formatMMSS(remainingSec: number): string {
  const s = Math.max(0, Math.ceil(remainingSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
