import { AffixWeekSpan, countTicks, dungeonTimers, isTimed, localDay, weekIndexAt } from './mythic-plus-activity';
import {
  MythicPlusAffix,
  MythicPlusDungeon,
  MythicPlusIndex,
  MythicPlusMember,
  MythicPlusRun,
  PlayerScore,
  characterKey,
  hasScanChanges,
  isBetterRun,
  samePlace
} from './mythic-plus';
import { realmSlug } from '../../game/wow';

type Character = Pick<MythicPlusMember, 'name' | 'realm'>;

export function characterParam(character: Character): string {
  return `${character.name}-${character.realm}`;
}

export function parseCharacterParam(value: string | null | undefined): Character | undefined {
  const split = value?.lastIndexOf('-') ?? -1;
  if (!value || split <= 0 || split === value.length - 1) {
    return undefined;
  }

  return { name: value.slice(0, split), realm: value.slice(split + 1) };
}

export function findCharacters<T extends Character>(candidates: readonly T[], realm: string, name: string): T[] {
  const wantedRealm = realmSlug(realm);
  const onRealm = candidates.filter(candidate => realmSlug(candidate.realm) === wantedRealm);
  const exact = onRealm.filter(candidate => candidate.name === name);
  if (exact.length) {
    return exact;
  }

  const folded = foldCase(name);
  return onRealm.filter(candidate => foldCase(candidate.name) === folded);
}

export interface ScopeRank {
  rank: number;
  total: number;
  position?: number;
}

export function scopeRank(
  ranking: readonly PlayerScore[],
  key: string,
  inScope: (player: PlayerScore) => boolean = () => true
): ScopeRank | undefined {
  let total = 0;
  let place = 0;
  let previous: PlayerScore | undefined;
  let found: { rank: number; position: number } | undefined;
  for (const player of ranking) {
    if (!inScope(player)) {
      continue;
    }

    total++;
    if (!previous || !samePlace(player, previous)) {
      place = total;
    }
    previous = player;
    if (player.key === key) {
      found = { rank: place, position: total };
    }
  }

  return found === undefined ? undefined : { ...found, total };
}

export function formatTopPercent({ rank, total }: ScopeRank): string {
  if (!(total > 0)) {
    return '';
  }

  const tenths = Math.max(1, Math.ceil((rank * 1000) / total));
  return tenths < 100 ? `top ${(tenths / 10).toFixed(1)}%` : `top ${Math.ceil(tenths / 10)}%`;
}

export function pageOfRank(rank: number, pageSize: number): number {
  return Math.max(1, Math.ceil(rank / pageSize));
}

export interface ScoreDay {
  day: string;
  score: number;
  gained: number;
  runs: number;
}

export function scoreOverTime(
  runs: readonly Pick<MythicPlusRun, 'dungeon' | 'score' | 'completedAt'>[],
  from: number,
  to: number
): ScoreDay[] {
  if (!(from <= to)) {
    return [];
  }

  const replay = runs
    .map(run => ({ run, at: Date.parse(run.completedAt) }))
    .sort((a, b) => a.at - b.at);
  const best = new Map<string, number>();
  const days: ScoreDay[] = [];
  const end = localDay(new Date(to));
  const cursor = new Date(from);
  cursor.setHours(12, 0, 0, 0);
  let next = 0;
  let score = 0;

  for (;;) {
    const day = localDay(cursor);
    let finished = 0;
    while (next < replay.length && localDay(new Date(replay[next].at)) <= day) {
      const { run } = replay[next++];
      best.set(run.dungeon, Math.max(best.get(run.dungeon) ?? 0, run.score));
      finished++;
    }

    let total = 0;
    for (const value of best.values()) {
      total += value;
    }
    const rounded = Math.round(total * 10) / 10;
    days.push({ day, score: rounded, gained: Math.round((rounded - score) * 10) / 10, runs: finished });
    score = rounded;

    if (day >= end) {
      break;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

export interface Teammate {
  key: string;
  member: MythicPlusMember;
  runs: number;
  bestRun: MythicPlusRun;
}

export function frequentTeammates(runs: readonly MythicPlusRun[], key: string, limit: number): Teammate[] {
  const teammates = new Map<string, Teammate>();
  for (const run of runs) {
    if (!run.roster.some(member => characterKey(member) === key)) {
      continue;
    }

    for (const member of run.roster) {
      const teammateKey = characterKey(member);
      if (teammateKey === key) {
        continue;
      }

      const teammate = teammates.get(teammateKey);
      if (!teammate) {
        teammates.set(teammateKey, { key: teammateKey, member, runs: 1, bestRun: run });
      } else {
        teammate.runs++;
        if (isBetterRun(run, teammate.bestRun)) {
          teammate.bestRun = run;
          teammate.member = member;
        }
      }
    }
  }

  return [...teammates.values()]
    .sort((a, b) =>
      b.runs - a.runs
      || b.bestRun.score - a.bestRun.score
      || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, Math.max(0, limit));
}

export interface SpecPlayed {
  class: number;
  spec: string;
  runs: number;
}

export function specsPlayed(runs: readonly MythicPlusRun[], key: string, first?: string): SpecPlayed[] {
  const specs = new Map<string, SpecPlayed>();
  for (const run of runs) {
    const member = run.roster.find(entry => characterKey(entry) === key);
    if (!member) {
      continue;
    }

    const played = specs.get(member.spec);
    if (played) {
      played.runs++;
    } else {
      specs.set(member.spec, { class: member.class, spec: member.spec, runs: 1 });
    }
  }

  return [...specs.values()].sort((a, b) =>
    Number(b.spec === first) - Number(a.spec === first)
    || b.runs - a.runs
    || (a.spec < b.spec ? -1 : a.spec > b.spec ? 1 : 0));
}

function foldCase(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase();
}

export interface ProfileScanChange {
  score?: number;
  rank?: number;
  isNew: boolean;
}

export function profileScanChange(index: MythicPlusIndex | undefined, key: string | undefined): ProfileScanChange | undefined {
  if (!hasScanChanges(index) || !key) {
    return undefined;
  }

  const position = index.players.findIndex(entry => characterKey({ name: entry[0], realm: entry[1] }) === key);
  const standing = position >= 0 ? index.standings[position] : undefined;
  if (!standing) {
    return undefined;
  }

  return standing[2] === undefined || standing[3] === undefined
    ? { isNew: true }
    : { score: standing[2], rank: standing[3], isNew: false };
}

export function rankChangeLabel(change: number): string {
  return change > 0
    ? `Climbed ${change} ${change === 1 ? 'rank' : 'ranks'} since the last scan`
    : change < 0
      ? `Fell ${Math.abs(change)} ${change === -1 ? 'rank' : 'ranks'} since the last scan`
      : 'Rank unchanged since the last scan';
}

export function scoreChangeLabel(change: number): string {
  return change > 0
    ? `+${change.toFixed(1)} score since the last scan`
    : change < 0
      ? `−${Math.abs(change).toFixed(1)} score since the last scan`
      : '0.0 score since the last scan';
}

const percentOf = (part: number, whole: number) => whole > 0 ? (part / whole) * 100 : 0;
const formatScore = (score: number) => score.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export interface ProfileStat {
  label: string;
  value: string;
}

export function runSummary(
  runs: readonly Pick<MythicPlusRun, 'dungeon' | 'clearTimeSeconds' | 'keyLevel'>[],
  dungeons: readonly Pick<MythicPlusDungeon, 'id' | 'timerSeconds'>[]
): ProfileStat[] {
  const timers = dungeonTimers(dungeons);
  const timed = runs.filter(run => isTimed(run, timers));
  const highest = Math.max(0, ...timed.map(run => run.keyLevel));
  return [
    { label: 'Runs', value: runs.length.toLocaleString('en-GB') },
    { label: 'In time', value: `${Math.round(percentOf(timed.length, runs.length))}%` },
    { label: 'Highest timed key', value: highest ? `+${highest}` : '-' }
  ];
}

export function runTimeSpan(runs: readonly Pick<MythicPlusRun, 'completedAt'>[]): { first: number; last: number } {
  let first = Infinity;
  let last = -Infinity;
  for (const run of runs) {
    const at = Date.parse(run.completedAt);
    first = Math.min(first, at);
    last = Math.max(last, at);
  }
  return { first, last };
}

export interface ChartPoint {
  day: ScoreDay;
  label: string;
  longLabel: string;
  ariaLabel: string;
  showLabel: boolean;
  bottom: number;
  flip: boolean;
  middle: boolean;
}

export interface WeekBand {
  start: number;
  span: number;
  affixes: MythicPlusAffix[];
  shade: boolean;
}

export interface ScoreChart {
  points: ChartPoint[];
  bands: WeekBand[];
  viewBox: string;
  line: string;
  area: string;
  gridlines: Array<{ value: string; position: number }>;
}

export function scoreChart(
  days: readonly ScoreDay[],
  weeks: readonly AffixWeekSpan[],
  affixesById: ReadonlyMap<number, MythicPlusAffix>,
  maxLabels: number
): ScoreChart | undefined {
  if (!days.length) {
    return undefined;
  }

  const ticks = countTicks(Math.max(0, ...days.map(day => day.score)));
  const top = ticks[ticks.length - 1];
  const count = days.length;
  const labelEvery = Math.max(1, Math.ceil(count / maxLabels));
  const bands: WeekBand[] = [];
  let previousWeek: number | undefined;

  const points = days.map<ChartPoint>((day, position) => {
    const date = new Date(`${day.day}T12:00:00`);
    const week = weekIndexAt(weeks, date.getTime());
    if (position > 0 && week === previousWeek) {
      bands[bands.length - 1].span++;
    } else {
      bands.push({
        start: position + 1,
        span: 1,
        affixes: (weeks[week]?.affixes ?? [])
          .map(id => affixesById.get(id))
          .filter((affix): affix is MythicPlusAffix => affix !== undefined),
        shade: bands.length % 2 === 1
      });
    }
    previousWeek = week;

    const longLabel = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const played = day.runs ? `, ${day.runs} ${day.runs === 1 ? 'run' : 'runs'}, +${formatScore(day.gained)}` : '';
    return {
      day,
      label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      longLabel,
      ariaLabel: `${longLabel}: ${formatScore(day.score)} points${played}`,
      showLabel: position % labelEvery === 0,
      bottom: percentOf(day.score, top),
      flip: position >= count / 2,
      middle: position >= count / 3 && position < (count * 2) / 3
    };
  });

  const line = points.map((point, position) => `${position + 0.5},${(100 - point.bottom).toFixed(2)}`).join(' ');
  return {
    points,
    bands,
    viewBox: `0 0 ${count} 100`,
    line,
    area: `0.5,100 ${line} ${count - 0.5},100`,
    gridlines: ticks.map(value => ({ value: value.toLocaleString('en-GB'), position: percentOf(value, top) }))
  };
}
