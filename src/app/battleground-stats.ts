export interface BattlegroundRecord {
  name?: string;
  startTime?: string;
  startTimeUnix?: number;
  startDate?: string;
  duration?: number | string;
  durationFormatted?: string;
  bgId?: number;
  bgName?: string;
  bgStartTime?: string;
  bgStartTimeUnix?: number;
  bgStartDate?: string;
  bgDuration?: number | string;
  bgDurationFormatted?: string;
}

export interface NormalizedBattleground {
  id: number | undefined;
  name: string;
  date: string;
  startTime: string;
  startTimestamp: number | undefined;
  startHour: number | undefined;
  startMinuteOfDay: number | undefined;
  durationMs: number | undefined;
}

export interface BattlegroundDateBounds {
  min: string;
  max: string;
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
const DATA_DATE_PATTERN = /^(\d{4})[.-](\d{1,2})[.-](\d{1,2})$/;
const START_TIME_DATE_PATTERN = /^(\d{4})[.-](\d{1,2})[.-](\d{1,2})\s+/;
const START_TIME_HOUR_PATTERN = /^\d{4}[.-]\d{1,2}[.-]\d{1,2}\s+(\d{1,2})[.:](\d{2})/;
const FORMATTED_DURATION_PATTERN = /^(\d{1,2}):(\d{2}):(\d{2})$/;
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

export function normalizeBattlegrounds(records: ReadonlyArray<BattlegroundRecord> | null | undefined): NormalizedBattleground[] {
  if (!records?.length) {
    return [];
  }

  return records
    .map((record) => normalizeBattleground(record))
    .filter((record): record is NormalizedBattleground => record !== undefined)
    .sort((left, right) => compareBattlegrounds(left, right));
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

export function computeBattlegroundStats(
  records: ReadonlyArray<NormalizedBattleground>,
  selectedDay: string
): BattlegroundStats {
  const bounds = getBattlegroundDateBounds(records);
  const day = isIsoDate(selectedDay) ? selectedDay : bounds?.max ?? '';
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
  const groupedNames = new Set<string>(BATTLEGROUND_DAY_GROUPS.flatMap((group) => [...group.names]));
  const groups = BATTLEGROUND_DAY_GROUPS
    .map((group) => buildBattlegroundDayGroup(group.label, group.names, rowsByName));
  const otherRows = rows.filter((row) => !groupedNames.has(row.name));

  if (otherRows.length > 0) {
    groups.push({
      label: 'Other BGs',
      totalStarts: otherRows.reduce((total, row) => total + row.total, 0),
      rows: otherRows
    });
  }

  return groups;
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

function normalizeBattleground(record: BattlegroundRecord): NormalizedBattleground | undefined {
  const name = firstStringValue(record.name, record.bgName);
  const startTime = firstStringValue(record.startTime, record.bgStartTime);
  const startTimestamp = firstFiniteNumber(record.startTimeUnix, record.bgStartTimeUnix);
  const startMinuteOfDay = normalizeStartMinuteOfDay(startTime, startTimestamp);
  const date = normalizeDate(firstStringValue(record.startDate, record.bgStartDate))
    ?? normalizeStartTimeDate(startTime)
    ?? normalizeUnixDate(startTimestamp);

  if (!name || !date) {
    return undefined;
  }

  return {
    id: typeof record.bgId === 'number' && Number.isFinite(record.bgId) ? record.bgId : undefined,
    name,
    date,
    startTime: startTime ?? '',
    startTimestamp,
    startHour: startMinuteOfDay === undefined ? undefined : Math.floor(startMinuteOfDay / 60),
    startMinuteOfDay,
    durationMs: normalizeDurationMs(record)
  };
}

function firstStringValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmedValue = value?.trim();
    if (trimmedValue) {
      return trimmedValue;
    }
  }

  return undefined;
}

function firstFiniteNumber(...values: Array<number | undefined>): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function normalizeDate(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return undefined;
  }

  const isoMatch = ISO_DATE_PATTERN.exec(trimmedValue);
  if (isoMatch) {
    return trimmedValue;
  }

  const dataMatch = DATA_DATE_PATTERN.exec(trimmedValue);
  if (!dataMatch) {
    return undefined;
  }

  const [, year, month, day] = dataMatch;
  return buildIsoDate(year, month, day);
}

function normalizeStartTimeDate(value: string | undefined): string | undefined {
  const match = START_TIME_DATE_PATTERN.exec(value?.trim() ?? '');
  if (!match) {
    return undefined;
  }

  const [, year, month, day] = match;
  return buildIsoDate(year, month, day);
}

function normalizeStartMinuteOfDay(value: string | undefined, startTimestamp: number | undefined): number | undefined {
  const match = START_TIME_HOUR_PATTERN.exec(value?.trim() ?? '');
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
      ? hour * 60 + minute
      : undefined;
  }

  if (startTimestamp === undefined) {
    return undefined;
  }

  const date = new Date(startTimestamp * 1000);
  return Number.isNaN(date.getTime())
    ? undefined
    : date.getHours() * 60 + date.getMinutes();
}

function normalizeUnixDate(value: number | undefined): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString().slice(0, 10);
}

function buildIsoDate(year: string, month: string, day: string): string | undefined {
  const numericMonth = Number(month);
  const numericDay = Number(day);

  if (numericMonth < 1 || numericMonth > 12 || numericDay < 1 || numericDay > 31) {
    return undefined;
  }

  return `${year}-${numericMonth.toString().padStart(2, '0')}-${numericDay.toString().padStart(2, '0')}`;
}

function normalizeDurationMs(record: BattlegroundRecord): number | undefined {
  return normalizeDurationValue(record.duration)
    ?? normalizeDurationValue(record.durationFormatted)
    ?? normalizeDurationValue(record.bgDuration)
    ?? normalizeDurationValue(record.bgDurationFormatted);
}

function normalizeDurationValue(value: number | string | undefined): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
  }

  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return undefined;
  }

  const match = FORMATTED_DURATION_PATTERN.exec(trimmedValue);
  if (match) {
    const [, hours, minutes, seconds] = match;
    return (
      Number(hours) * 3600
      + Number(minutes) * 60
      + Number(seconds)
    ) * 1000;
  }

  const duration = Number(trimmedValue);
  return Number.isFinite(duration) && duration >= 0 ? Math.round(duration) : undefined;
}

function compareBattlegrounds(left: NormalizedBattleground, right: NormalizedBattleground): number {
  const dateResult = left.date.localeCompare(right.date);
  if (dateResult !== 0) {
    return dateResult;
  }

  if (left.startTimestamp !== undefined || right.startTimestamp !== undefined) {
    return (left.startTimestamp ?? 0) - (right.startTimestamp ?? 0);
  }

  return (left.id ?? 0) - (right.id ?? 0);
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

function roundChartCoordinate(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
