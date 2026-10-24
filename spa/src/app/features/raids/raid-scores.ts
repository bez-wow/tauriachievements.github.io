import { getClassColor } from '../../game/class-colors';
import { compareSpecLists } from '../../shared/spec-charts/spec-popularity';
import { CLASS_NAMES, raceFaction, realmSlug, Role } from '../../game/wow';
import { LEGION_SPECS, LegionSpec } from '../../game/wow-specs';
import { RaidBoss, RaidSpec, RaidCharacter, RaidMember, RaidKillDetails } from './raid-logs.types';
import { characterKey, logKey } from './raid-logs';

export type RaidMetric = 'dps' | 'hps';

export interface RankingFilter {
  classId?: number;
  specId?: number;
  realm?: string;
  role?: Role;
}

export interface RankedPerformance {
  rank: number;
  member: RaidMember;
  kill: RaidKillDetails;
  value: number;
}

export function countsFor(metric: RaidMetric, spec: RaidSpec | undefined): boolean {
  if (!spec) {
    return false;
  }

  return metric === 'hps' ? spec.role === 'healer' : spec.role !== 'healer';
}

export function rankedSpecs(specs: ReadonlyMap<number, RaidSpec>, classId: number | undefined, metric: RaidMetric): RaidSpec[] {
  return [...specs.values()].filter(spec => spec.classId === classId && countsFor(metric, spec));
}

export function rankCharacters(
  kills: readonly RaidKillDetails[],
  metric: RaidMetric,
  filter: RankingFilter = {}
): RankedPerformance[] {
  const best = new Map<RaidCharacter, Omit<RankedPerformance, 'rank'>>();

  for (const kill of kills) {
    for (const member of kill.members) {
      if (member.character.former || !countsFor(metric, member.spec) || !matchesFilter(member, filter)) {
        continue;
      }

      const value = member[metric];
      const known = best.get(member.character);
      if (!known || value > known.value || (value === known.value && kill.killedAt < known.kill.killedAt)) {
        best.set(member.character, { member, kill, value });
      }
    }
  }

  return [...best.values()]
    .sort((a, b) => b.value - a.value || a.kill.killedAt - b.kill.killedAt)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function matchesFilter(member: RaidMember, filter: RankingFilter): boolean {
  return (filter.classId === undefined || member.character.classId === filter.classId)
    && (filter.specId === undefined || member.spec?.id === filter.specId)
    && (filter.role === undefined || member.spec?.role === filter.role)
    && (filter.realm === undefined || realmSlug(member.character.realm) === filter.realm);
}

export interface BossStanding {
  rank?: number;
  ranked: number;
  relative: number;
}

export function bossStanding(
  kills: readonly RaidKillDetails[],
  metric: RaidMetric,
  key: string,
  filter: RankingFilter = {}
): BossStanding {
  const ranking = rankCharacters(kills, metric, filter);
  const own = ranking.find(entry => characterKey(entry.member.character) === key);
  const top = bossBest(kills, metric, filter);
  return { rank: own?.rank, ranked: ranking.length, relative: own && top > 0 ? own.value / top : 0 };
}

export function bossBest(kills: readonly RaidKillDetails[], metric: RaidMetric, filter: RankingFilter = {}): number {
  let best = 0;
  for (const kill of kills) {
    for (const member of kill.members) {
      if (countsFor(metric, member.spec) && matchesFilter(member, filter)) {
        best = Math.max(best, member[metric]);
      }
    }
  }
  return best;
}

export const MAX_SCORE = 6969;

interface Appearance {
  member: RaidMember;
  kill: RaidKillDetails;
}

const characterKeys = new WeakMap<RaidCharacter, string>();

function cachedCharacterKey(character: RaidCharacter): string {
  let key = characterKeys.get(character);
  if (key === undefined) {
    key = characterKey(character);
    characterKeys.set(character, key);
  }
  return key;
}

export interface BossPerformance {
  boss: RaidBoss;
  best?: Appearance;
  value: number;
  relative: number;
}

export interface CharacterScore {
  character: RaidCharacter;
  spec?: RaidSpec;
  faction: number;
  itemLevel: number;
  bosses: BossPerformance[];
  killed: number;
  performance: number;
  score: number;
}

export interface RankedScore extends CharacterScore {
  rank: number;
}

export function scoreCharacters(
  bosses: readonly RaidBoss[],
  bossKills: ReadonlyArray<readonly RaidKillDetails[]>,
  metric: RaidMetric,
  specId?: number
): CharacterScore[] {
  interface Tally {
    latest: Appearance;
    specs: Map<RaidSpec, { count: number; at: number }>;
    bests: Array<Appearance | undefined>;
  }

  const tallies = new Map<string, Tally>();
  const tops = bosses.map(() => 0);

  bosses.forEach((boss, bossIndex) => {
    for (const kill of bossKills[bossIndex] ?? []) {
      for (const member of kill.members) {
        if (!member.spec || !countsFor(metric, member.spec)) {
          continue;
        }

        const value = member[metric];
        tops[bossIndex] = Math.max(tops[bossIndex], value);
        if (member.character.former || (specId !== undefined && member.spec.id !== specId)) {
          continue;
        }

        const key = cachedCharacterKey(member.character);
        let tally = tallies.get(key);
        if (!tally) {
          tally = { latest: { member, kill }, specs: new Map(), bests: bosses.map(() => undefined) };
          tallies.set(key, tally);
        }

        if (kill.killedAt > tally.latest.kill.killedAt) {
          tally.latest = { member, kill };
        }

        const spec = tally.specs.get(member.spec) ?? { count: 0, at: 0 };
        tally.specs.set(member.spec, { count: spec.count + 1, at: Math.max(spec.at, kill.killedAt) });

        const best = tally.bests[bossIndex];
        if (!best || value > best.member[metric] || (value === best.member[metric] && kill.killedAt < best.kill.killedAt)) {
          tally.bests[bossIndex] = { member, kill };
        }
      }
    }
  });

  const scoredBosses = tops.filter(top => top > 0).length;
  if (!scoredBosses) {
    return [];
  }

  const scores = [...tallies.values()].map((tally): CharacterScore => {
    const performances = bosses.map((boss, bossIndex): BossPerformance => {
      const best = tally.bests[bossIndex];
      const value = best ? best.member[metric] : 0;
      return { boss, best, value, relative: tops[bossIndex] > 0 ? value / tops[bossIndex] : 0 };
    });
    const performance = performances.reduce((sum, entry) => sum + entry.relative, 0) / scoredBosses;
    const { member, kill } = tally.latest;
    const spec = [...tally.specs.entries()].sort((a, b) => b[1].count - a[1].count || b[1].at - a[1].at)[0]?.[0];

    return {
      character: member.character,
      spec,
      faction: raceFaction(member.character.race) ?? kill.faction,
      itemLevel: member.itemLevel,
      bosses: performances,
      killed: performances.filter(entry => entry.best).length,
      performance,
      score: toScore(performance)
    };
  });

  return scores.sort((a, b) =>
    b.performance - a.performance || b.killed - a.killed || a.character.name.localeCompare(b.character.name));
}

function toScore(performance: number): number {
  return Math.floor(MAX_SCORE * performance + 1e-9);
}

export function specMetric(spec: RaidSpec): RaidMetric {
  return spec.role === 'healer' ? 'hps' : 'dps';
}

export interface SpecCharacterScore {
  character: RaidCharacter;
  score: number;
}

export function scoresBySpec(
  bosses: readonly RaidBoss[],
  bossKills: ReadonlyArray<readonly RaidKillDetails[]>
): Map<RaidSpec, SpecCharacterScore[]> {
  const tops: Record<RaidMetric, number[]> = { dps: bosses.map(() => 0), hps: bosses.map(() => 0) };
  const bests = new Map<RaidSpec, Map<string, { character: RaidCharacter; values: number[] }>>();

  bosses.forEach((boss, bossIndex) => {
    for (const kill of bossKills[bossIndex] ?? []) {
      for (const member of kill.members) {
        if (!member.spec) {
          continue;
        }

        const metric = specMetric(member.spec);
        const value = member[metric];
        tops[metric][bossIndex] = Math.max(tops[metric][bossIndex], value);
        if (member.character.former) {
          continue;
        }

        let characters = bests.get(member.spec);
        if (!characters) {
          characters = new Map();
          bests.set(member.spec, characters);
        }

        const key = cachedCharacterKey(member.character);
        let entry = characters.get(key);
        if (!entry) {
          entry = { character: member.character, values: bosses.map(() => 0) };
          characters.set(key, entry);
        }
        entry.values[bossIndex] = Math.max(entry.values[bossIndex], value);
      }
    }
  });

  const scoredBosses = { dps: tops.dps.filter(top => top > 0).length, hps: tops.hps.filter(top => top > 0).length };
  const scores = new Map<RaidSpec, SpecCharacterScore[]>();
  for (const [spec, characters] of bests) {
    const metric = specMetric(spec);
    const top = tops[metric];
    if (!scoredBosses[metric]) {
      continue;
    }

    scores.set(spec, [...characters.values()]
      .map(({ character, values }) => ({
        character,
        score: toScore(values.reduce((sum, value, bossIndex) => sum + (top[bossIndex] > 0 ? value / top[bossIndex] : 0), 0) / scoredBosses[metric])
      }))
      .sort((a, b) => b.score - a.score || a.character.name.localeCompare(b.character.name)));
  }

  return scores;
}

export function scoresBySpecForKills(
  bosses: readonly RaidBoss[],
  kills: readonly RaidKillDetails[]
): Map<RaidSpec, SpecCharacterScore[]> {
  return scoresBySpec(bosses, bosses.map(boss => kills.filter(kill => kill.boss.slug === boss.slug)));
}

export const SPEC_TOP_SCORES = 10;

export function topAverage(scores: readonly number[], count: number = SPEC_TOP_SCORES): number {
  const top = [...scores].sort((a, b) => b - a).slice(0, count);
  return top.length ? Math.round(top.reduce((sum, score) => sum + score, 0) / top.length) : 0;
}

export interface SpecPerformance extends LegionSpec {
  count: number;
  score: number;
  best?: SpecCharacterScore;
}

export interface ClassPerformance {
  classId: number;
  className: string;
  color: string;
  count: number;
  score: number;
  specs: SpecPerformance[];
}

export interface SpecPerformanceSummary {
  characterCount: number;
  classes: ClassPerformance[];
}

export function specPerformance(
  scores: ReadonlyMap<RaidSpec, readonly SpecCharacterScore[]>,
  role?: Role
): SpecPerformanceSummary {
  const bySpec = new Map([...scores].map(([spec, entries]) => [`${spec.classId}|${spec.name}`, entries]));
  const groups = new Map<number, { group: ClassPerformance; characters: Map<string, number> }>();
  const characters = new Set<string>();

  for (const definition of LEGION_SPECS) {
    if (role && definition.role !== role) {
      continue;
    }

    let entry = groups.get(definition.classId);
    if (!entry) {
      entry = {
        group: {
          classId: definition.classId,
          className: CLASS_NAMES[definition.classId] ?? 'Unknown',
          color: getClassColor(definition.classId) ?? '#9a9a9a',
          count: 0,
          score: 0,
          specs: []
        },
        characters: new Map()
      };
      groups.set(definition.classId, entry);
    }

    const specScores = bySpec.get(`${definition.classId}|${definition.spec}`) ?? [];
    entry.group.specs.push({
      ...definition,
      count: specScores.length,
      score: topAverage(specScores.map(score => score.score)),
      best: specScores[0]
    });

    for (const { character, score } of specScores) {
      const key = cachedCharacterKey(character);
      characters.add(key);
      entry.characters.set(key, Math.max(entry.characters.get(key) ?? 0, score));
    }
  }

  const classes = [...groups.values()].map(({ group, characters: classCharacters }) => {
    group.count = classCharacters.size;
    group.score = topAverage([...classCharacters.values()]);
    group.specs.sort((a, b) => b.score - a.score);
    return group;
  });
  classes.sort((a, b) => compareSpecLists(a.specs, b.specs, spec => spec.score) || a.classId - b.classId);

  return { characterCount: characters.size, classes };
}

export function scoreTicks(maxScore: number): number[] {
  const step = [100, 200, 250, 500, 1000, 2000].find(candidate => maxScore / candidate <= 5) ?? 2000;
  const top = Math.max(step, Math.ceil(maxScore / step) * step);
  return Array.from({ length: top / step + 1 }, (_, index) => index * step);
}

export function formatScoreTick(score: number): string {
  return score >= 1000 ? `${score / 1000}k` : String(score);
}

export interface ScoreFilter {
  classId?: number;
  realm?: string;
}

export function rankScores(scores: readonly CharacterScore[], filter: ScoreFilter = {}): RankedScore[] {
  return scores
    .filter(entry => (filter.classId === undefined || entry.character.classId === filter.classId)
      && (filter.realm === undefined || realmSlug(entry.character.realm) === filter.realm))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function killsBefore(
  bossKills: ReadonlyArray<readonly RaidKillDetails[]>,
  newLogs: ReadonlySet<string>
): RaidKillDetails[][] {
  return bossKills.map(kills => kills.filter(kill => !newLogs.has(logKey(kill))));
}

export interface ScoreChange {
  rank: number;
  score: number;
  isNew: boolean;
}

export function scoreChanges(current: readonly RankedScore[], previous: readonly RankedScore[]): Map<string, ScoreChange> {
  const before = new Map(previous.map(entry => [cachedCharacterKey(entry.character), entry]));
  const changes = new Map<string, ScoreChange>();

  for (const entry of current) {
    const key = cachedCharacterKey(entry.character);
    const earlier = before.get(key);
    if (!earlier) {
      changes.set(key, { rank: 0, score: 0, isNew: true });
    } else if (earlier.rank !== entry.rank || earlier.score !== entry.score) {
      changes.set(key, { rank: earlier.rank - entry.rank, score: entry.score - earlier.score, isNew: false });
    }
  }

  return changes;
}

export function performanceQuality(relative: number): number {
  if (relative >= 1) {
    return 6;
  }
  if (relative >= .95) {
    return 5;
  }
  if (relative >= .75) {
    return 4;
  }
  if (relative >= .5) {
    return 3;
  }
  return relative >= .25 ? 2 : 0;
}
