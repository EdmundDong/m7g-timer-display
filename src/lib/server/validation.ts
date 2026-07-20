import type {TimerState} from '../types';
import {ValidationError} from './errors';

/** Validates a fully-merged timer record (existing values overlaid with any patch). */
export function validateTimerFields(
  fields: Pick<
    TimerState,
    'name' | 'durationSec' | 'redZoneSec' | 'disappearSec' | 'erodeFrom' | 'mirror'
  >,
): void {
  if (!fields.name || !fields.name.trim()) {
    throw new ValidationError('name is required');
  }
  if (fields.name.length > 100) {
    throw new ValidationError('name must be 100 characters or fewer');
  }
  if (!Number.isFinite(fields.durationSec) || fields.durationSec <= 0) {
    throw new ValidationError('durationSec must be a positive number');
  }
  if (!Number.isFinite(fields.redZoneSec) || fields.redZoneSec < 0) {
    throw new ValidationError('redZoneSec must be >= 0');
  }
  if (fields.redZoneSec >= fields.durationSec) {
    throw new ValidationError('redZoneSec must be less than durationSec');
  }
  if (!Number.isFinite(fields.disappearSec) || fields.disappearSec < 0) {
    throw new ValidationError('disappearSec must be >= 0');
  }
  if (fields.erodeFrom !== 'left' && fields.erodeFrom !== 'right') {
    throw new ValidationError('erodeFrom must be "left" or "right"');
  }
  if (typeof fields.mirror !== 'boolean') {
    throw new ValidationError('mirror must be a boolean');
  }
}
