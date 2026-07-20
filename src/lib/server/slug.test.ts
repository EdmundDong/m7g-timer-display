import {describe, expect, test} from 'vitest';
import {slugify} from './slug';

describe('slugify', () => {
  test('lowercases and hyphenates spaces', () => {
    expect(slugify('Smoke Test')).toBe('smoke-test');
  });

  test('collapses runs of non-alphanumeric characters into one hyphen', () => {
    expect(slugify('Smoke   Test!!')).toBe('smoke-test');
  });

  test('strips leading and trailing hyphens', () => {
    expect(slugify('  Timer 1  ')).toBe('timer-1');
  });

  test('keeps digits attached to letters without a hyphen', () => {
    expect(slugify('Timer1')).toBe('timer1');
  });

  test('an all-symbol name slugifies to an empty string', () => {
    expect(slugify('!!!')).toBe('');
  });
});
