import {describe, expect, test} from 'vitest';
import type {TimerState} from './types';
import {
  computeRemainingSec,
  computeVisiblePct,
  isDisappeared,
  computeColorSegments,
  formatMMSS,
} from './timerMath';

function makeTimer(overrides: Partial<TimerState> = {}): TimerState {
  return {
    id: 't1',
    name: 'Test',
    durationSec: 60,
    redZoneSec: 10,
    disappearSec: 10,
    erodeFrom: 'left',
    position: 'top',
    mirror: false,
    status: 'idle',
    startEpochMs: null,
    pausedRemainingSec: null,
    ...overrides,
  };
}

describe('computeRemainingSec', () => {
  test('idle status returns full duration', () => {
    const timer = makeTimer({status: 'idle'});
    expect(computeRemainingSec(timer, Date.now())).toBe(60);
  });

  test('running status returns duration minus elapsed', () => {
    const now = 100_000;
    const timer = makeTimer({status: 'running', startEpochMs: now - 20_000});
    expect(computeRemainingSec(timer, now)).toBe(40);
  });

  test('running status clamps at 0 when elapsed exceeds duration', () => {
    const now = 100_000;
    const timer = makeTimer({status: 'running', startEpochMs: now - 90_000});
    expect(computeRemainingSec(timer, now)).toBe(0);
  });

  test('paused status returns the frozen pausedRemainingSec', () => {
    const timer = makeTimer({status: 'paused', pausedRemainingSec: 23});
    expect(computeRemainingSec(timer, Date.now())).toBe(23);
  });

  test('ended status returns 0', () => {
    const timer = makeTimer({status: 'ended'});
    expect(computeRemainingSec(timer, Date.now())).toBe(0);
  });
});

describe('computeVisiblePct', () => {
  test('full remaining time is 100%', () => {
    expect(computeVisiblePct(60, 60)).toBe(100);
  });

  test('zero remaining time is 0%', () => {
    expect(computeVisiblePct(0, 60)).toBe(0);
  });

  test('mid-timer is proportional', () => {
    expect(computeVisiblePct(30, 60)).toBe(50);
  });

  test('durationSec of 0 does not divide by zero', () => {
    expect(computeVisiblePct(0, 0)).toBe(0);
  });
});

describe('isDisappeared', () => {
  test('remaining above disappearSec is not disappeared', () => {
    expect(isDisappeared(11, 10)).toBe(false);
  });

  test('remaining exactly at disappearSec counts as disappeared', () => {
    expect(isDisappeared(10, 10)).toBe(true);
  });

  test('remaining below disappearSec is disappeared', () => {
    expect(isDisappeared(5, 10)).toBe(true);
  });
});

describe('computeColorSegments', () => {
  test('green always spans 0-50%', () => {
    const [green] = computeColorSegments(60, 10);
    expect(green).toEqual({color: 'green', startPct: 0, widthPct: 50});
  });

  test('yellow and red split at duration-redZoneSec, 60s/10s example', () => {
    const [, yellow, red] = computeColorSegments(60, 10);
    // redZone starts at (60-10)/60 = 83.33%
    expect(yellow.color).toBe('yellow');
    expect(yellow.startPct).toBe(50);
    expect(yellow.widthPct).toBeCloseTo(33.333, 2);
    expect(red.color).toBe('red');
    expect(red.startPct).toBeCloseTo(83.333, 2);
    expect(red.widthPct).toBeCloseTo(16.667, 2);
  });

  test('degenerate case: redZoneSec larger than half the duration', () => {
    // duration=20, redZoneSec=15 -> redStart = (20-15)/20*100 = 25%, before green even ends at 50
    const [green, yellow, red] = computeColorSegments(20, 15);
    expect(green).toEqual({color: 'green', startPct: 0, widthPct: 50});
    expect(yellow.startPct).toBe(50);
    expect(yellow.widthPct).toBe(-25);
    expect(red.startPct).toBe(25);
    expect(red.widthPct).toBe(75);
  });
});

describe('formatMMSS', () => {
  test('formats seconds under a minute', () => {
    expect(formatMMSS(5)).toBe('0:05');
  });

  test('formats exact minutes', () => {
    expect(formatMMSS(60)).toBe('1:00');
  });

  test('rounds fractional seconds up', () => {
    expect(formatMMSS(59.2)).toBe('1:00');
  });

  test('never goes negative', () => {
    expect(formatMMSS(-5)).toBe('0:00');
  });
});
