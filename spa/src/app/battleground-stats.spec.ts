import { describe, expect, it } from 'vitest';
import {
  NormalizedBattleground,
  computeBattlegroundStats,
  decodeBattlegroundSnapshot,
  formatDuration,
  getBattlegroundDateBounds,
  getCompletedBattlegroundDateBounds
} from './battleground-stats';

/** A battleground started at "YYYY.MM.DD HH.MM", as the collector writes it. */
function battleground(name: string, startTime: string, durationMs?: number): NormalizedBattleground {
  const [, year, month, day, hour, minute] = /^(\d{4})\.(\d{2})\.(\d{2}) (\d{2})\.(\d{2})$/.exec(startTime)!;
  return {
    name,
    date: `${year}-${month}-${day}`,
    startHour: Number(hour),
    startMinuteOfDay: Number(hour) * 60 + Number(minute),
    durationMs
  };
}

const sampleRecords: NormalizedBattleground[] = [
  battleground('Warsong Gulch', '2026.06.29 19.10', 600000),
  battleground('Warsong Gulch', '2026.06.30 20.05', 900000),
  battleground('Warsong Gulch', '2026.06.30 20.44', 600000),
  battleground('Arathi Basin', '2026.06.30 21.10', 1200000),
  battleground('Twin Peaks', '2026.07.02 18.00', 1200000)
];

describe('decodeBattlegroundSnapshot', () => {
  it('reads each day\'s name, start minute and duration triples in order', () => {
    const records = decodeBattlegroundSnapshot({
      version: 1,
      era: 'legion',
      names: ['Warsong Gulch', 'Arathi Basin'],
      days: [
        ['2026-07-02', [0, 412, 827]],
        ['2026-07-03', [1, 1270, -1, 0, -1, 600]]
      ]
    });

    expect(records).toEqual([
      { name: 'Warsong Gulch', date: '2026-07-02', startHour: 6, startMinuteOfDay: 412, durationMs: 827000 },
      { name: 'Arathi Basin', date: '2026-07-03', startHour: 21, startMinuteOfDay: 1270, durationMs: undefined },
      { name: 'Warsong Gulch', date: '2026-07-03', startHour: undefined, startMinuteOfDay: undefined, durationMs: 600000 }
    ]);
  });

  it('returns no records for a missing snapshot', () => {
    expect(decodeBattlegroundSnapshot(null)).toEqual([]);
  });
});

describe('computeBattlegroundStats', () => {
  it('counts starts only on the selected day', () => {
    const records = sampleRecords;
    const stats = computeBattlegroundStats(records, '2026-06-30');

    expect(stats.selectedDayCount).toBe(3);
    expect(stats.uniqueBattlegroundCount).toBe(2);
    expect(stats.hasSelectedDayData).toBe(true);
  });

  it('sorts battleground rows and includes hourly cells', () => {
    const records = sampleRecords;
    const stats = computeBattlegroundStats(records, '2026-06-30');

    expect(stats.mostStartedBg?.name).toBe('Warsong Gulch');
    expect(stats.battlegroundRows.map((row) => ({ name: row.name, total: row.total }))).toEqual([
      { name: 'Warsong Gulch', total: 2 },
      { name: 'Arathi Basin', total: 1 }
    ]);
    expect(stats.battlegroundGroups.map((group) => ({
      label: group.label,
      totalStarts: group.totalStarts,
      rows: group.rows.map((row) => ({ name: row.name, total: row.total }))
    }))).toEqual([
      {
        label: '10 man BGs',
        totalStarts: 2,
        rows: [
          { name: 'Warsong Gulch', total: 2 },
          { name: 'Silvershard Mines', total: 0 },
          { name: 'The Battle for Gilneas', total: 0 },
          { name: 'Temple of Kotmogu', total: 0 },
          { name: 'Twin Peaks', total: 0 }
        ]
      },
      {
        label: '15 man BGs',
        totalStarts: 1,
        rows: [
          { name: 'Arathi Basin', total: 1 },
          { name: 'Deepwind Gorge', total: 0 },
          { name: 'Eye of the Storm', total: 0 },
          { name: 'Strand of the Ancients', total: 0 }
        ]
      },
      {
        label: '40 man BGs',
        totalStarts: 0,
        rows: [
          { name: 'Alterac Valley', total: 0 },
          { name: 'Isle of Conquest', total: 0 }
        ]
      }
    ]);
    expect(stats.battlegroundRows[0].cells).toHaveLength(24);
    expect(stats.battlegroundRows[0].cells[20].count).toBe(2);
    expect(stats.hourlyTotals[20].count).toBe(2);
    expect(stats.busiestHour?.label).toBe('20:00');
    expect(stats.hourlyChart.maxCount).toBe(2);
    expect(stats.hourlyChart.linePath).toContain('C');
  });

  it('computes average, shortest, and longest duration per battleground across all tracked data', () => {
    const records = sampleRecords;
    const stats = computeBattlegroundStats(records, '2026-06-30');
    const warsong = stats.durationRows.find((row) => row.name === 'Warsong Gulch');

    expect(warsong?.totalRuns).toBe(3);
    expect(warsong?.durationSampleCount).toBe(3);
    expect(warsong?.averageDurationMs).toBe(700000);
    expect(warsong?.averageDurationLabel).toBe('11m 40s');
    expect(warsong?.shortestDurationLabel).toBe('10m 00s');
    expect(warsong?.longestDurationLabel).toBe('15m 00s');
  });

  it('groups duration rows by battleground size', () => {
    const records = sampleRecords;
    const stats = computeBattlegroundStats(records, '2026-06-30');

    expect(stats.durationGroups.map((group) => group.label)).toEqual([
      '10 man BGs',
      '15 man BGs'
    ]);
    expect(stats.durationGroups[0].totalRuns).toBe(4);
    expect(stats.durationGroups[0].rows.map((row) => row.name)).toEqual([
      'Warsong Gulch',
      'Twin Peaks'
    ]);
    expect(stats.durationGroups[1].rows.map((row) => row.name)).toEqual([
      'Arathi Basin'
    ]);
  });

  it('does not display ungrouped arena rows in the duration table', () => {
    const records = [
      ...sampleRecords,
      battleground("Blade's Edge Arena", '2026.07.03 22.00', 156000)
    ];
    const stats = computeBattlegroundStats(records, '2026-06-30');

    expect(stats.durationGroups.map((group) => group.label)).not.toContain('Other BGs');
    expect(stats.durationRows.map((row) => row.name)).not.toContain("Blade's Edge Arena");
  });

  it('does not display arena rows in an Other BGs daily group', () => {
    const records = [
      ...sampleRecords,
      battleground('Black Rook Hold Arena', '2026.06.30 22.00'),
      battleground("Ashamane's Fall", '2026.06.30 22.10')
    ];
    const stats = computeBattlegroundStats(records, '2026-06-30');

    expect(stats.battlegroundGroups.map((group) => group.label)).not.toContain('Other BGs');
    expect(stats.battlegroundGroups.flatMap((group) => group.rows.map((row) => row.name))).not.toContain(
      'Black Rook Hold Arena'
    );
  });

  it('recommends queue windows for Alterac Valley and Isle of Conquest from historical starts', () => {
    const records = [
      ...sampleRecords,
      battleground('Alterac Valley', '2026.06.29 19.05'),
      battleground('Alterac Valley', '2026.06.30 20.10'),
      battleground('Alterac Valley', '2026.07.01 19.30'),
      battleground('Alterac Valley', '2026.07.02 22.00'),
      battleground('Isle of Conquest', '2026.06.29 14.10'),
      battleground('Isle of Conquest', '2026.06.30 15.20')
    ];
    const stats = computeBattlegroundStats(records, '2026-06-30');
    const alterac = stats.queueRecommendations.find((recommendation) =>
      recommendation.battlegroundName === 'Alterac Valley'
    );
    const isle = stats.queueRecommendations.find((recommendation) =>
      recommendation.battlegroundName === 'Isle of Conquest'
    );

    expect(alterac?.bestWindowLabel).toBe('19:00-21:00');
    expect(alterac?.bestWindowCount).toBe(3);
    expect(isle?.bestWindowLabel).toBe('14:00-16:00');
    expect(isle?.bestWindowCount).toBe(2);
  });
});

describe('getBattlegroundDateBounds', () => {
  it('returns the first and last available dates', () => {
    const bounds = getBattlegroundDateBounds(sampleRecords);

    expect(bounds).toEqual({
      min: '2026-06-29',
      max: '2026-07-02'
    });
  });
});

describe('getCompletedBattlegroundDateBounds', () => {
  it('only allows days that have data on the following calendar day', () => {
    const bounds = getCompletedBattlegroundDateBounds([
      battleground('Warsong Gulch', '2026.07.03 10.00'),
      battleground('Warsong Gulch', '2026.07.04 10.00'),
      battleground('Warsong Gulch', '2026.07.05 10.00')
    ]);

    expect(bounds).toEqual({
      min: '2026-07-03',
      max: '2026-07-04'
    });
  });

  it('returns no selectable date when there is no next-day data', () => {
    const bounds = getCompletedBattlegroundDateBounds([
      battleground('Warsong Gulch', '2026.07.05 10.00')
    ]);

    expect(bounds).toBeUndefined();
  });
});

describe('formatDuration', () => {
  it('formats durations under and over an hour', () => {
    expect(formatDuration(61000)).toBe('1m 01s');
    expect(formatDuration(3661000)).toBe('1h 01m 01s');
  });

  it('labels missing durations as unknown', () => {
    expect(formatDuration(undefined)).toBe('Unknown');
  });
});
