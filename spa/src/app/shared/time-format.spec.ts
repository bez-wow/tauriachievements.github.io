import { describe, it, expect } from 'vitest';
import { formatClock, formatDuration } from './time-format';

describe('formatDuration', () => {
  it('formats a fixed-width hours:minutes:seconds clock', () => {
    expect(formatDuration(1747)).toBe('00:29:07');
    expect(formatDuration(3725)).toBe('01:02:05');
    expect(formatDuration(-5)).toBe('00:00:00');
  });
});

describe('formatClock', () => {
  it('omits the hour when under an hour', () => {
    expect(formatClock(59)).toBe('0:59');
    expect(formatClock(1747)).toBe('29:07');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});
