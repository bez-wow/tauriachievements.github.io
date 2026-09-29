import { CLASS_OPTIONS } from './ladder-options';
import { RankedLadderPlayer } from './ladder.service';

export type ComparisonOutcome = 'a' | 'b' | 'tie';

export interface ComparisonMetricRow {
  kind: 'metric';
  label: string;
  aValue: number;
  bValue: number;
  better: 'higher' | 'lower';
  difference: number;
  outcome: ComparisonOutcome;
}

export interface ComparisonInfoRow {
  kind: 'info';
  label: string;
  aText: string;
  bText: string;
  aColor?: string;
  bColor?: string;
  same: boolean;
}

export type ComparisonRow = ComparisonMetricRow | ComparisonInfoRow;

export interface ComparisonResult {
  rows: ComparisonRow[];
  aWins: number;
  bWins: number;
  verdict: ComparisonOutcome;
}

const CLASS_NAME_BY_ID = new Map<number, string>(CLASS_OPTIONS.map((option) => [option.id, option.name]));
const CLASS_COLOR_BY_ID = new Map<number, string>([
  [1, '#C69B6D'],
  [2, '#F48CBA'],
  [3, '#AAD372'],
  [4, '#FFF468'],
  [5, '#FFFFFF'],
  [6, '#C41E3A'],
  [7, '#0070DD'],
  [8, '#3FC7EB'],
  [9, '#8788EE'],
  [10, '#00FF98'],
  [11, '#FF7C0A'],
  [12, '#A330C9'],
  [13, '#33937F']
]);

export function getClassName(classId: number): string {
  return CLASS_NAME_BY_ID.get(classId) ?? `Class ${classId}`;
}

export function getClassColor(classId: number): string | undefined {
  return CLASS_COLOR_BY_ID.get(classId);
}

export function buildPlayerComparison(a: RankedLadderPlayer, b: RankedLadderPlayer): ComparisonResult {
  const rows: ComparisonRow[] = [
    metricRow('Achievement Points', a.achievementPoints, b.achievementPoints, 'higher'),
    metricRow('Achievement Rank', a.achievementRank, b.achievementRank, 'lower'),
    metricRow('Honorable Kills', a.honorableKills, b.honorableKills, 'higher'),
    metricRow('Honorable Kill Rank', a.honorableKillRank, b.honorableKillRank, 'lower'),
    metricRow('Appearances', a.appearanceCount, b.appearanceCount, 'higher'),
    infoRow(
      'Class',
      getClassName(a.class),
      getClassName(b.class),
      getClassColor(a.class),
      getClassColor(b.class)
    ),
    infoRow('Realm', a.realm, b.realm),
    infoRow('Guild', a.guild || '—', b.guild || '—'),
    infoRow('Faction', a.faction, b.faction)
  ];

  let aWins = 0;
  let bWins = 0;
  for (const row of rows) {
    if (row.kind !== 'metric') {
      continue;
    }

    if (row.outcome === 'a') {
      aWins++;
    } else if (row.outcome === 'b') {
      bWins++;
    }
  }

  return {
    rows,
    aWins,
    bWins,
    verdict: aWins > bWins ? 'a' : bWins > aWins ? 'b' : 'tie'
  };
}

function metricRow(
  label: string,
  aValue: number,
  bValue: number,
  better: 'higher' | 'lower'
): ComparisonMetricRow {
  return {
    kind: 'metric',
    label,
    aValue,
    bValue,
    better,
    difference: Math.abs(aValue - bValue),
    outcome: resolveOutcome(aValue, bValue, better)
  };
}

function infoRow(
  label: string,
  aText: string,
  bText: string,
  aColor?: string,
  bColor?: string
): ComparisonInfoRow {
  return {
    kind: 'info',
    label,
    aText,
    bText,
    aColor,
    bColor,
    same: aText === bText
  };
}

function resolveOutcome(aValue: number, bValue: number, better: 'higher' | 'lower'): ComparisonOutcome {
  if (aValue === bValue) {
    return 'tie';
  }

  if (better === 'higher') {
    return aValue > bValue ? 'a' : 'b';
  }

  return aValue < bValue ? 'a' : 'b';
}
