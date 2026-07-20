export type ErodeFrom = 'left' | 'right';
export type TimerStatus = 'idle' | 'running' | 'paused' | 'ended';

export interface TimerState {
  id: string;
  name: string;
  durationSec: number;
  redZoneSec: number;
  disappearSec: number;
  erodeFrom: ErodeFrom;
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
  mirror?: boolean;
}

export type PatchTimerInput = Partial<
  Pick<TimerState, 'name' | 'durationSec' | 'redZoneSec' | 'disappearSec' | 'erodeFrom' | 'mirror'>
>;

export type TimerStreamEvent = {type: 'snapshot'; timer: TimerState} | {type: 'deleted'};
