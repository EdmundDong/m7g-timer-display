export type ErodeFrom = 'left' | 'right';
export type Position = 'top' | 'bottom' | 'left' | 'right';
export type TimerStatus = 'idle' | 'running' | 'paused' | 'ended';

export interface TimerState {
  id: string;
  name: string;
  durationSec: number;
  redZoneSec: number;
  disappearSec: number;
  erodeFrom: ErodeFrom;
  position: Position;
  mirror: boolean;
  status: TimerStatus;
  startEpochMs: number | null;
  pausedRemainingSec: number | null;
}

export interface CreateTimerInput {
  name: string;
  durationSec: number;
  redZoneSec?: number;
  disappearSec?: number;
  erodeFrom?: ErodeFrom;
  position?: Position;
  mirror?: boolean;
}

export type PatchTimerInput = Partial<
  Pick<
    TimerState,
    'name' | 'durationSec' | 'redZoneSec' | 'disappearSec' | 'erodeFrom' | 'position' | 'mirror'
  >
>;

export type TimerStreamEvent = {type: 'snapshot'; timer: TimerState} | {type: 'deleted'};
