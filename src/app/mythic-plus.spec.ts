import { describe, it, expect } from 'vitest';
import {
  formatClock,
  formatDuration,
  formatTimerDelta,
  keystoneUpgrades,
  pageCount,
  rankRuns,
  runIncludesPlayer,
  scoreQuality,
  sortRoster,
  upgradeCutoffs
} from './mythic-plus';

describe('keystoneUpgrades', () => {
  it('awards +3, +2 and +1 at the 60% / 80% / 100% cutoffs', () => {
    expect(keystoneUpgrades(1080, 1800)).toBe(3);
    expect(keystoneUpgrades(1081, 1800)).toBe(2);
    expect(keystoneUpgrades(1440, 1800)).toBe(2);
    expect(keystoneUpgrades(1441, 1800)).toBe(1);
    expect(keystoneUpgrades(1800, 1800)).toBe(1);
  });

  it('treats over-time and invalid runs as depleted', () => {
    expect(keystoneUpgrades(1801, 1800)).toBe(0);
    expect(keystoneUpgrades(0, 1800)).toBe(0);
    expect(keystoneUpgrades(1200, 0)).toBe(0);
  });
});

describe('upgradeCutoffs', () => {
  it('converts the cutoffs to seconds for a timer', () => {
    expect(upgradeCutoffs(2100)).toEqual([
      { upgrades: 3, percent: 60, seconds: 1260 },
      { upgrades: 2, percent: 80, seconds: 1680 },
      { upgrades: 1, percent: 100, seconds: 2100 }
    ]);
  });
});

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

describe('formatTimerDelta', () => {
  it('signs the distance from the timer', () => {
    expect(formatTimerDelta(1747, 2100)).toBe('-5:53');
    expect(formatTimerDelta(2230, 2100)).toBe('+2:10');
    expect(formatTimerDelta(2100, 2100)).toBe('0:00');
  });
});

describe('rankRuns', () => {
  it('orders by score, breaking ties with the faster clear', () => {
    const runs = [
      { id: 'a', score: 150, clearTimeSeconds: 1500 },
      { id: 'b', score: 180, clearTimeSeconds: 1900 },
      { id: 'c', score: 150, clearTimeSeconds: 1400 }
    ];

    expect(rankRuns(runs).map(run => run.id)).toEqual(['b', 'c', 'a']);
    expect(runs.map(run => run.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('scoreQuality', () => {
  it('maps the score relative to the best run onto item-quality tiers', () => {
    expect(scoreQuality(200, 200)).toBe('artifact');
    expect(scoreQuality(196, 200)).toBe('legendary');
    expect(scoreQuality(180, 200)).toBe('legendary');
    expect(scoreQuality(172, 200)).toBe('epic');
    expect(scoreQuality(160, 200)).toBe('rare');
    expect(scoreQuality(100, 200)).toBe('uncommon');
    expect(scoreQuality(100, 0)).toBe('uncommon');
  });
});

describe('runIncludesPlayer', () => {
  const run = { roster: [{ name: 'Björñ' }, { name: 'Llýnch' }, { name: 'Exa' }] };

  it('matches partial names ignoring case and accents', () => {
    expect(runIncludesPlayer(run, 'bjorn')).toBe(true);
    expect(runIncludesPlayer(run, 'LLYN')).toBe(true);
    expect(runIncludesPlayer(run, '  exa ')).toBe(true);
  });

  it('matches everything for an empty query and nothing for a stranger', () => {
    expect(runIncludesPlayer(run, '')).toBe(true);
    expect(runIncludesPlayer(run, 'Pretz')).toBe(false);
  });
});

describe('sortRoster', () => {
  it('puts the tank and healer first and keeps DPS order', () => {
    const roster = [
      { name: 'A', role: 'dps' as const },
      { name: 'H', role: 'healer' as const },
      { name: 'B', role: 'dps' as const },
      { name: 'T', role: 'tank' as const }
    ];

    expect(sortRoster(roster).map(member => member.name)).toEqual(['T', 'H', 'A', 'B']);
  });
});

describe('pageCount', () => {
  it('always has at least one page', () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(40, 20)).toBe(2);
    expect(pageCount(41, 20)).toBe(3);
  });
});
