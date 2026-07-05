import { describe, expect, it } from 'vitest';
import {
  BattlegroundRecord,
  computeBattlegroundStats,
  formatDuration,
  getBattlegroundDateBounds,
  normalizeBattlegrounds
} from './battleground-stats';

const sampleRecords: BattlegroundRecord[] = [
  {
    bgId: 1,
    bgName: 'Warsong Gulch',
    bgStartTime: '2026.06.29 19.10',
    bgDuration: 600000
  },
  {
    bgId: 2,
    bgName: 'Warsong Gulch',
    bgStartTime: '2026.06.30 20.05',
    bgDuration: 900000
  },
  {
    bgId: 3,
    bgName: 'Warsong Gulch',
    bgStartTime: '2026.06.30 20.44',
    bgDuration: 600000
  },
  {
    bgId: 4,
    bgName: 'Arathi Basin',
    bgStartTime: '2026.06.30 21.10',
    bgDurationFormatted: '00:20:00'
  },
  {
    bgId: 5,
    bgName: 'Twin Peaks',
    bgStartTime: '2026.07.02 18.00',
    bgDuration: 1200000
  }
];

describe('normalizeBattlegrounds', () => {
  it('normalizes compact battleground collector records', () => {
    const records = normalizeBattlegrounds([
      {
        name: 'Warsong Gulch',
        startTime: '2026.07.02 06.52',
        duration: '00:13:47'
      }
    ]);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      name: 'Warsong Gulch',
      date: '2026-07-02',
      startTime: '2026.07.02 06.52',
      startHour: 6,
      startMinuteOfDay: 412,
      durationMs: 827000
    });
  });

  it('normalizes dotted dates, start hours, and formatted durations', () => {
    const records = normalizeBattlegrounds(sampleRecords);

    expect(records.map((record) => record.date)).toEqual([
      '2026-06-29',
      '2026-06-30',
      '2026-06-30',
      '2026-06-30',
      '2026-07-02'
    ]);
    expect(records[1].startHour).toBe(20);
    expect(records[3].durationMs).toBe(1200000);
  });

  it('drops records without a name or usable date', () => {
    const records = normalizeBattlegrounds([
      { bgName: '', bgStartDate: '2026.06.30' },
      { bgName: 'Warsong Gulch' },
      { bgName: 'Arathi Basin', bgStartDate: '2026.06.30' }
    ]);

    expect(records).toHaveLength(1);
    expect(records[0].name).toBe('Arathi Basin');
  });
});

describe('computeBattlegroundStats', () => {
  it('counts starts only on the selected day', () => {
    const records = normalizeBattlegrounds(sampleRecords);
    const stats = computeBattlegroundStats(records, '2026-06-30');

    expect(stats.selectedDayCount).toBe(3);
    expect(stats.uniqueBattlegroundCount).toBe(2);
    expect(stats.hasSelectedDayData).toBe(true);
  });

  it('sorts battleground rows and includes hourly cells', () => {
    const records = normalizeBattlegrounds(sampleRecords);
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
    const records = normalizeBattlegrounds(sampleRecords);
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
    const records = normalizeBattlegrounds(sampleRecords);
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
    const records = normalizeBattlegrounds([
      ...sampleRecords,
      {
        bgName: "Blade's Edge Arena",
        bgStartTime: '2026.07.03 22.00',
        bgDuration: 156000
      }
    ]);
    const stats = computeBattlegroundStats(records, '2026-06-30');

    expect(stats.durationGroups.map((group) => group.label)).not.toContain('Other BGs');
    expect(stats.durationRows.map((row) => row.name)).not.toContain("Blade's Edge Arena");
  });

  it('recommends queue windows for Alterac Valley and Isle of Conquest from historical starts', () => {
    const records = normalizeBattlegrounds([
      ...sampleRecords,
      { bgName: 'Alterac Valley', bgStartTime: '2026.06.29 19.05' },
      { bgName: 'Alterac Valley', bgStartTime: '2026.06.30 20.10' },
      { bgName: 'Alterac Valley', bgStartTime: '2026.07.01 19.30' },
      { bgName: 'Alterac Valley', bgStartTime: '2026.07.02 22.00' },
      { bgName: 'Isle of Conquest', bgStartTime: '2026.06.29 14.10' },
      { bgName: 'Isle of Conquest', bgStartTime: '2026.06.30 15.20' }
    ]);
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
    const bounds = getBattlegroundDateBounds(normalizeBattlegrounds(sampleRecords));

    expect(bounds).toEqual({
      min: '2026-06-29',
      max: '2026-07-02'
    });
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
