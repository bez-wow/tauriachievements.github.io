export interface NormalizedBattleground {
  name: string;
  date: string;
  startHour: number | undefined;
  startMinuteOfDay: number | undefined;
  durationMs: number | undefined;
}

export interface BattlegroundDateBounds {
  min: string;
  max: string;
}

export type BattlegroundEra = 'legion' | 'wod-prepatch';

/**
 * One era's battlegrounds as built by scripts/generate-battleground-snapshot.js: days in date
 * order, each holding flat [name index, start minute of day, duration in seconds] triples,
 * with -1 for an unknown start or duration.
 */
export interface BattlegroundSnapshot {
  version: number;
  era: BattlegroundEra;
  names: string[];
  days: Array<[date: string, values: number[]]>;
}

export interface BattlegroundHourlyTotal {
  hour: number;
  label: string;
  count: number;
  totalShare: number;
}

export interface BattlegroundHourlyCell {
  hour: number;
  label: string;
  count: number;
  intensity: number;
}

export interface BattlegroundDayRow {
  name: string;
  total: number;
  totalShare: number;
  averageDurationMs: number | undefined;
  averageDurationLabel: string;
  cells: BattlegroundHourlyCell[];
}

export interface BattlegroundDayGroup {
  label: string;
  totalStarts: number;
  rows: BattlegroundDayRow[];
}

export interface BattlegroundDurationRow {
  name: string;
  totalRuns: number;
  durationSampleCount: number;
  averageDurationMs: number | undefined;
  averageDurationLabel: string;
  shortestDurationLabel: string;
  longestDurationLabel: string;
}

export interface BattlegroundDurationGroup {
  label: string;
  totalRuns: number;
  rows: BattlegroundDurationRow[];
}

export interface BattlegroundQueueHour {
  hour: number;
  label: string;
  count: number;
  totalShare: number;
}

export interface BattlegroundQueueRecommendation {
  battlegroundName: string;
  totalStarts: number;
  bestWindowLabel: string;
  bestWindowCount: number;
  bestWindowShare: number;
  confidenceLabel: string;
  topHours: BattlegroundQueueHour[];
}

export interface BattlegroundHourlyChartPoint {
  hour: number;
  label: string;
  count: number;
  x: number;
  y: number;
}

export interface BattlegroundHourlyChart {
  viewBox: string;
  linePath: string;
  areaPath: string;
  maxCount: number;
  points: BattlegroundHourlyChartPoint[];
}

export interface BattlegroundStats {
  selectedDay: string;
  selectedDayLabel: string;
  selectedDayCount: number;
  uniqueBattlegroundCount: number;
  averageDurationMs: number | undefined;
  averageDurationLabel: string;
  hourlyTotals: BattlegroundHourlyTotal[];
  hourlyChart: BattlegroundHourlyChart;
  battlegroundRows: BattlegroundDayRow[];
  battlegroundGroups: BattlegroundDayGroup[];
  durationRows: BattlegroundDurationRow[];
  durationGroups: BattlegroundDurationGroup[];
  durationRangeLabel: string;
  durationRangeStartLabel: string | undefined;
  durationRangeEndLabel: string | undefined;
  hasDurationData: boolean;
  queueRecommendations: BattlegroundQueueRecommendation[];
  mostStartedBg: BattlegroundDayRow | undefined;
  busiestHour: BattlegroundHourlyTotal | undefined;
  hasSelectedDayData: boolean;
}

interface BattlegroundAccumulator {
  name: string;
  total: number;
  hourlyCounts: Map<number, number>;
  durationTotalMs: number;
  durationSampleCount: number;
  shortestDurationMs: number | undefined;
  longestDurationMs: number | undefined;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const HOURS = Array.from({ length: 24 }, (_value, hour) => hour);
const HOURLY_CHART_WIDTH = 240;
const HOURLY_CHART_HEIGHT = 64;
const HOURLY_CHART_PADDING = 4;
const QUEUE_RECOMMENDATION_TARGETS = ['Alterac Valley', 'Isle of Conquest'] as const;
const BATTLEGROUND_DURATION_GROUPS = [
  {
    label: '10 man BGs',
    names: [
      'Warsong Gulch',
      'Silvershard Mines',
      'The Battle for Gilneas',
      'Temple of Kotmogu',
      'Twin Peaks'
    ]
  },
  {
    label: '15 man BGs',
    names: [
      'Arathi Basin',
      'Deepwind Gorge',
      'Eye of the Storm',
      'Strand of the Ancients'
    ]
  },
  {
    label: '40 man BGs',
    names: [
      'Alterac Valley',
      'Isle of Conquest'
    ]
  }
] as const;
const BATTLEGROUND_DAY_GROUPS = [
  BATTLEGROUND_DURATION_GROUPS[0],
  BATTLEGROUND_DURATION_GROUPS[1],
  BATTLEGROUND_DURATION_GROUPS[2]
] as const;
const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC'
});


/** The records of an era snapshot, in its order (by date, then as collected). */
export function decodeBattlegroundSnapshot(snapshot: BattlegroundSnapshot | null | undefined): NormalizedBattleground[] {
  const records: NormalizedBattleground[] = [];

  for (const [date, values] of snapshot?.days ?? []) {
    for (let index = 0; index + 2 < values.length; index += 3) {
      const name = snapshot!.names[values[index]];
      if (name === undefined) {
        continue;
      }

      const startMinuteOfDay = values[index + 1] >= 0 ? values[index + 1] : undefined;
      const durationSeconds = values[index + 2];
      records.push({
        name,
        date,
        startHour: startMinuteOfDay === undefined ? undefined : Math.floor(startMinuteOfDay / 60),
        startMinuteOfDay,
        durationMs: durationSeconds >= 0 ? durationSeconds * 1000 : undefined
      });
    }
  }

  return records;
}

export function getBattlegroundDateBounds(records: ReadonlyArray<NormalizedBattleground>): BattlegroundDateBounds | undefined {
  if (!records.length) {
    return undefined;
  }

  let min = records[0].date;
  let max = records[0].date;

  for (const record of records) {
    if (record.date < min) {
      min = record.date;
    }

    if (record.date > max) {
      max = record.date;
    }
  }

  return { min, max };
}

export function getCompletedBattlegroundDateBounds(
  records: ReadonlyArray<NormalizedBattleground>
): BattlegroundDateBounds | undefined {
  const dates = new Set(records.map((record) => record.date));
  const completedDates = [...dates]
    .filter((date) => {
      const nextDate = addIsoDays(date, 1);
      return nextDate !== undefined && dates.has(nextDate);
    })
    .sort();

  if (completedDates.length === 0) {
    return undefined;
  }

  return {
    min: completedDates[0],
    max: completedDates[completedDates.length - 1]
  };
}


export function computeBattlegroundStats(
  records: ReadonlyArray<NormalizedBattleground>,
  selectedDay: string
): BattlegroundStats {
  const bounds = getBattlegroundDateBounds(records);
  const day = isIsoDate(selectedDay) ? selectedDay : '';
  const hourlyTotalMap = new Map(HOURS.map((hour) => [hour, 0]));
  const accumulators = new Map<string, BattlegroundAccumulator>();
  const durationAccumulators = new Map<string, BattlegroundAccumulator>();
  let selectedDayCount = 0;
  let durationTotalMs = 0;
  let durationSampleCount = 0;

  for (const record of records) {
    addRecordToAccumulator(durationAccumulators, record);

    if (record.date !== day) {
      continue;
    }

    selectedDayCount++;

    if (record.startHour !== undefined) {
      hourlyTotalMap.set(record.startHour, (hourlyTotalMap.get(record.startHour) ?? 0) + 1);
    }

    if (record.durationMs !== undefined) {
      durationTotalMs += record.durationMs;
      durationSampleCount++;
    }

    const accumulator = getOrCreateAccumulator(accumulators, record.name);
    accumulator.total++;

    if (record.startHour !== undefined) {
      accumulator.hourlyCounts.set(record.startHour, (accumulator.hourlyCounts.get(record.startHour) ?? 0) + 1);
    }

    addDurationToAccumulator(accumulator, record.durationMs);
  }

  const busiestRawHour = HOURS
    .map((hour) => ({
      hour,
      label: formatHourLabel(hour),
      count: hourlyTotalMap.get(hour) ?? 0
    }))
    .filter((hourTotal) => hourTotal.count > 0)
    .sort((left, right) => right.count - left.count || left.hour - right.hour)[0];
  const hourlyTotals = HOURS.map((hour) => ({
    hour,
    label: formatHourLabel(hour),
    count: hourlyTotalMap.get(hour) ?? 0,
    totalShare: busiestRawHour ? Math.round(((hourlyTotalMap.get(hour) ?? 0) / busiestRawHour.count) * 100) : 0
  }));
  const busiestHour = busiestRawHour
    ? hourlyTotals.find((hourTotal) => hourTotal.hour === busiestRawHour.hour)
    : undefined;

  const sortedAccumulators = [...accumulators.values()]
    .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name));
  const maxBattlegroundTotal = Math.max(0, ...sortedAccumulators.map((accumulator) => accumulator.total));
  const maxHourlyBattlegroundCount = Math.max(
    0,
    ...sortedAccumulators.flatMap((accumulator) => [...accumulator.hourlyCounts.values()])
  );

  const battlegroundRows = sortedAccumulators.map((accumulator) => {
    const averageDurationMs = averageDuration(accumulator.durationTotalMs, accumulator.durationSampleCount);

    return {
      name: accumulator.name,
      total: accumulator.total,
      totalShare: maxBattlegroundTotal ? Math.round((accumulator.total / maxBattlegroundTotal) * 100) : 0,
      averageDurationMs,
      averageDurationLabel: formatDuration(averageDurationMs),
      cells: HOURS.map((hour) => {
        const count = accumulator.hourlyCounts.get(hour) ?? 0;

        return {
          hour,
          label: formatHourLabel(hour),
          count,
          intensity: count > 0 && maxHourlyBattlegroundCount > 0
            ? 0.22 + (count / maxHourlyBattlegroundCount) * 0.78
            : 0
        };
      })
    };
  });

  const durationGroups = buildDurationGroups(durationAccumulators);
  const durationRows = durationGroups.flatMap((group) => group.rows);
  const averageDurationMs = averageDuration(durationTotalMs, durationSampleCount);
  const battlegroundGroups = buildBattlegroundDayGroups(battlegroundRows);

  return {
    selectedDay: day,
    selectedDayLabel: formatDateLabel(day),
    selectedDayCount,
    uniqueBattlegroundCount: accumulators.size,
    averageDurationMs,
    averageDurationLabel: formatDuration(averageDurationMs),
    hourlyTotals,
    hourlyChart: buildHourlyChart(hourlyTotals),
    battlegroundRows,
    battlegroundGroups,
    durationRows,
    durationGroups,
    durationRangeLabel: formatDateRangeLabel(bounds),
    durationRangeStartLabel: bounds ? formatDateLabel(bounds.min) : undefined,
    durationRangeEndLabel: bounds ? formatDateLabel(bounds.max) : undefined,
    hasDurationData: durationRows.length > 0,
    queueRecommendations: QUEUE_RECOMMENDATION_TARGETS.map((target) => buildQueueRecommendation(records, target)),
    mostStartedBg: battlegroundRows[0],
    busiestHour,
    hasSelectedDayData: selectedDayCount > 0
  };
}

export function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined || !Number.isFinite(durationMs)) {
    return 'Unknown';
  }

  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  }

  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

export function formatDateLabel(date: string): string {
  const parsedDate = parseIsoDateAsUtc(date);
  return parsedDate ? DATE_LABEL_FORMATTER.format(parsedDate) : date || 'No date';
}

function formatDateRangeLabel(bounds: BattlegroundDateBounds | undefined): string {
  if (!bounds) {
    return 'Data collected from all tracked data';
  }

  if (bounds.min === bounds.max) {
    return `Data collected from ${formatDateLabel(bounds.max)} to ${formatDateLabel(bounds.max)}`;
  }

  return `Data collected from ${formatDateLabel(bounds.min)} to ${formatDateLabel(bounds.max)}`;
}

function buildBattlegroundDayGroups(rows: ReadonlyArray<BattlegroundDayRow>): BattlegroundDayGroup[] {
  const rowsByName = new Map(rows.map((row) => [row.name, row]));
  return BATTLEGROUND_DAY_GROUPS
    .map((group) => buildBattlegroundDayGroup(group.label, group.names, rowsByName));
}

function buildBattlegroundDayGroup(
  label: string,
  names: readonly string[],
  rowsByName: ReadonlyMap<string, BattlegroundDayRow>
): BattlegroundDayGroup {
  const groupRows = names.map((name) => rowsByName.get(name) ?? buildEmptyBattlegroundDayRow(name));

  return {
    label,
    totalStarts: groupRows.reduce((total, row) => total + row.total, 0),
    rows: groupRows
  };
}

function buildEmptyBattlegroundDayRow(name: string): BattlegroundDayRow {
  return {
    name,
    total: 0,
    totalShare: 0,
    averageDurationMs: undefined,
    averageDurationLabel: formatDuration(undefined),
    cells: HOURS.map((hour) => ({
      hour,
      label: formatHourLabel(hour),
      count: 0,
      intensity: 0
    }))
  };
}

function buildDurationGroups(
  accumulators: ReadonlyMap<string, BattlegroundAccumulator>
): BattlegroundDurationGroup[] {
  return BATTLEGROUND_DURATION_GROUPS
    .map((group) => buildDurationGroup(group.label, group.names, accumulators))
    .filter((group): group is BattlegroundDurationGroup => group !== undefined);
}

function buildDurationGroup(
  label: string,
  names: readonly string[],
  accumulators: ReadonlyMap<string, BattlegroundAccumulator>
): BattlegroundDurationGroup | undefined {
  const rows = names
    .map((name) => accumulators.get(name))
    .filter((accumulator): accumulator is BattlegroundAccumulator => accumulator !== undefined)
    .map((accumulator) => buildDurationRow(accumulator));

  if (rows.length === 0) {
    return undefined;
  }

  return {
    label,
    totalRuns: rows.reduce((total, row) => total + row.totalRuns, 0),
    rows
  };
}

function buildDurationRow(accumulator: BattlegroundAccumulator): BattlegroundDurationRow {
  const averageDurationMs = averageDuration(accumulator.durationTotalMs, accumulator.durationSampleCount);

  return {
    name: accumulator.name,
    totalRuns: accumulator.total,
    durationSampleCount: accumulator.durationSampleCount,
    averageDurationMs,
    averageDurationLabel: formatDuration(averageDurationMs),
    shortestDurationLabel: formatDuration(accumulator.shortestDurationMs),
    longestDurationLabel: formatDuration(accumulator.longestDurationMs)
  };
}

function buildQueueRecommendation(
  records: ReadonlyArray<NormalizedBattleground>,
  battlegroundName: string
): BattlegroundQueueRecommendation {
  const counts = Array.from({ length: 24 }, () => 0);
  let totalStarts = 0;

  for (const record of records) {
    if (record.name !== battlegroundName || record.startHour === undefined) {
      continue;
    }

    counts[record.startHour]++;
    totalStarts++;
  }

  const maxHourCount = Math.max(0, ...counts);
  const topHours = counts
    .map((count, hour) => ({
      hour,
      label: formatHourLabel(hour),
      count,
      totalShare: maxHourCount ? Math.round((count / maxHourCount) * 100) : 0
    }))
    .filter((hour) => hour.count > 0)
    .sort((left, right) => right.count - left.count || left.hour - right.hour)
    .slice(0, 3);

  if (totalStarts === 0) {
    return {
      battlegroundName,
      totalStarts,
      bestWindowLabel: 'No data',
      bestWindowCount: 0,
      bestWindowShare: 0,
      confidenceLabel: 'No data',
      topHours
    };
  }

  let bestWindowStart = 0;
  let bestWindowCount = 0;

  for (const hour of HOURS) {
    const windowCount = counts[hour] + counts[(hour + 1) % 24];

    if (windowCount > bestWindowCount) {
      bestWindowStart = hour;
      bestWindowCount = windowCount;
    }
  }

  const bestWindowShare = Math.round((bestWindowCount / totalStarts) * 100);

  return {
    battlegroundName,
    totalStarts,
    bestWindowLabel: `${formatHourLabel(bestWindowStart)}-${formatHourLabel((bestWindowStart + 2) % 24)}`,
    bestWindowCount,
    bestWindowShare,
    confidenceLabel: getQueueConfidenceLabel(totalStarts, bestWindowShare),
    topHours
  };
}

function buildHourlyChart(hourlyTotals: ReadonlyArray<BattlegroundHourlyTotal>): BattlegroundHourlyChart {
  const maxCount = Math.max(0, ...hourlyTotals.map((hourTotal) => hourTotal.count));
  const graphWidth = HOURLY_CHART_WIDTH - HOURLY_CHART_PADDING * 2;
  const graphHeight = HOURLY_CHART_HEIGHT - HOURLY_CHART_PADDING * 2;
  const denominator = Math.max(1, hourlyTotals.length - 1);
  const baseline = HOURLY_CHART_HEIGHT - HOURLY_CHART_PADDING;
  const points = hourlyTotals.map((hourTotal, index) => {
    const share = maxCount > 0 ? hourTotal.count / maxCount : 0;

    return {
      hour: hourTotal.hour,
      label: hourTotal.label,
      count: hourTotal.count,
      x: roundChartCoordinate(HOURLY_CHART_PADDING + (index / denominator) * graphWidth),
      y: roundChartCoordinate(baseline - share * graphHeight)
    };
  });
  const linePath = buildSmoothPath(points);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const areaPath = firstPoint && lastPoint
    ? `${linePath} L ${lastPoint.x} ${baseline} L ${firstPoint.x} ${baseline} Z`
    : '';

  return {
    viewBox: `0 0 ${HOURLY_CHART_WIDTH} ${HOURLY_CHART_HEIGHT}`,
    linePath,
    areaPath,
    maxCount,
    points
  };
}

function buildSmoothPath(points: ReadonlyArray<BattlegroundHourlyChartPoint>): string {
  if (points.length === 0) {
    return '';
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  const minY = HOURLY_CHART_PADDING;
  const maxY = HOURLY_CHART_HEIGHT - HOURLY_CHART_PADDING;
  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index++) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[index + 2] ?? next;
    const controlOneX = roundChartCoordinate(current.x + (next.x - previous.x) / 6);
    const controlOneY = roundChartCoordinate(clamp(current.y + (next.y - previous.y) / 6, minY, maxY));
    const controlTwoX = roundChartCoordinate(next.x - (afterNext.x - current.x) / 6);
    const controlTwoY = roundChartCoordinate(clamp(next.y - (afterNext.y - current.y) / 6, minY, maxY));

    path += ` C ${controlOneX} ${controlOneY}, ${controlTwoX} ${controlTwoY}, ${next.x} ${next.y}`;
  }

  return path;
}

function getQueueConfidenceLabel(totalStarts: number, bestWindowShare: number): string {
  if (totalStarts < 8) {
    return 'Low data';
  }

  if (bestWindowShare >= 20) {
    return 'Strong signal';
  }

  if (bestWindowShare >= 12) {
    return 'Good signal';
  }

  return 'Spread out';
}












function getOrCreateAccumulator(
  accumulators: Map<string, BattlegroundAccumulator>,
  name: string
): BattlegroundAccumulator {
  const existing = accumulators.get(name);
  if (existing) {
    return existing;
  }

  const accumulator: BattlegroundAccumulator = {
    name,
    total: 0,
    hourlyCounts: new Map<number, number>(),
    durationTotalMs: 0,
    durationSampleCount: 0,
    shortestDurationMs: undefined,
    longestDurationMs: undefined
  };

  accumulators.set(name, accumulator);
  return accumulator;
}

function addRecordToAccumulator(
  accumulators: Map<string, BattlegroundAccumulator>,
  record: NormalizedBattleground
): void {
  const accumulator = getOrCreateAccumulator(accumulators, record.name);
  accumulator.total++;

  if (record.startHour !== undefined) {
    accumulator.hourlyCounts.set(record.startHour, (accumulator.hourlyCounts.get(record.startHour) ?? 0) + 1);
  }

  addDurationToAccumulator(accumulator, record.durationMs);
}

function addDurationToAccumulator(
  accumulator: BattlegroundAccumulator,
  durationMs: number | undefined
): void {
  if (durationMs === undefined) {
    return;
  }

  accumulator.durationTotalMs += durationMs;
  accumulator.durationSampleCount++;
  accumulator.shortestDurationMs = accumulator.shortestDurationMs === undefined
    ? durationMs
    : Math.min(accumulator.shortestDurationMs, durationMs);
  accumulator.longestDurationMs = accumulator.longestDurationMs === undefined
    ? durationMs
    : Math.max(accumulator.longestDurationMs, durationMs);
}

function averageDuration(totalMs: number, count: number): number | undefined {
  return count > 0 ? Math.round(totalMs / count) : undefined;
}

function formatHourLabel(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}

function isIsoDate(value: string): boolean {
  return ISO_DATE_PATTERN.test(value);
}

function parseIsoDateAsUtc(value: string): Date | undefined {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    return undefined;
  }

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function addIsoDays(value: string, days: number): string | undefined {
  const date = parseIsoDateAsUtc(value);
  if (!date) {
    return undefined;
  }

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function roundChartCoordinate(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
