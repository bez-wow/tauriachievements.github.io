import { describe, it, expect } from 'vitest';
import { countdownTo } from './countdown';

const target = Date.UTC(2026, 8, 16, 7, 0, 0);
const seconds = (value: number) => value * 1000;

describe('countdownTo', () => {
  it('splits the time left into zero-padded days, hours, minutes and seconds', () => {
    const now = target - seconds(1 * 86400 + 2 * 3600 + 3 * 60 + 4);

    expect(countdownTo(target, now)).toEqual({ days: '01', hours: '02', minutes: '03', seconds: '04', isReleased: false });
  });

  it('keeps counting whole days past 99', () => {
    expect(countdownTo(target, target - seconds(120 * 86400)).days).toBe('120');
  });

  it('is not released until the target itself, even with under a second left', () => {
    expect(countdownTo(target, target - 999)).toEqual({ days: '00', hours: '00', minutes: '00', seconds: '00', isReleased: false });
  });

  it('reports released at and after the target', () => {
    const released = { days: '00', hours: '00', minutes: '00', seconds: '00', isReleased: true };

    expect(countdownTo(target, target)).toEqual(released);
    expect(countdownTo(target, target + seconds(3600))).toEqual(released);
  });
});
