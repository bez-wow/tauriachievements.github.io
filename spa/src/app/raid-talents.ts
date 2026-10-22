import {
  RaidBoss,
  RaidCharacter,
  RaidKillDetails,
  RaidMember,
  RaidSpec,
  RaidTalent,
  RaidTalentTable,
  RoleFilter,
  SpecCharacterScore,
  characterKey,
  specMetric,
  topAverage
} from './raid-logs';

/*
 * /raid-logs/talents: which talents raiders pick, from the talents every member of a kill played
 * with (RaidMember.talents). Each character counts once per boss, with the talents of their best
 * kill there, so a guild that farms a boss every week doesn't outweigh everyone else.
 */

/** The best tenth of a spec's ranking on a boss: the players the "top" figures describe. */
export const TOP_SHARE = 0.1;

/** A talent picked this many points more on a boss than on the others is marked as picked for it. */
export const NOTABLE_DIFFERENCE = 0.1;

/** Fewer picks than this on a boss (or on the others) say too little to mark anything. */
export const NOTABLE_MIN_PICKS = 10;

/** The level each talent tier opens at, top to bottom. Death Knights and Demon Hunters start higher. */
export function talentLevels(classId: number): number[] {
  if (classId === 6) {
    return [56, 57, 58, 60, 75, 90, 100];
  }
  if (classId === 12) {
    return [99, 100, 102, 104, 106, 108, 110];
  }
  return [15, 30, 45, 60, 75, 90, 100];
}

// --- Samples ----------------------------------------------------------------------------

/** One character's talents on one boss, as one spec: from their best kill of it. */
export interface TalentSample {
  boss: RaidBoss;
  spec: RaidSpec;
  character: RaidCharacter;
  /** characterKey: the same character across boss files. */
  key: string;
  member: RaidMember;
  kill: RaidKillDetails;
  /** The column picked on each tier, as RaidMember.talents has it. */
  talents: string;
  /** DPS, or HPS for a healer: what the boss rankings rank the spec on. */
  value: number;
  /** The value over the best of the spec on this boss: 0 to 1. */
  relative: number;
  /** Place in the spec's ranking on this boss, from 1: the boss page's ranking filtered to the spec. */
  rank: number;
  /** In the best TOP_SHARE of that ranking; the best player always is. */
  isTop: boolean;
}

/**
 * One sample per character, boss and spec: the character's best kill of the boss as the spec, by
 * the spec's metric (the earlier kill on a tie). Members without a spec or talents are left out.
 */
export function talentSamples(kills: readonly RaidKillDetails[]): TalentSample[] {
  type Best = Omit<TalentSample, 'relative' | 'rank' | 'isTop'>;
  const best = new Map<string, Best>();

  for (const kill of kills) {
    for (const member of kill.members) {
      const spec = member.spec;
      if (!spec || !member.talents) {
        continue;
      }

      const value = member[specMetric(spec)];
      const key = characterKey(member.character);
      const slot = `${kill.boss.index}|${spec.id}|${key}`;
      const known = best.get(slot);
      if (!known || value > known.value || (value === known.value && kill.killedAt < known.kill.killedAt)) {
        best.set(slot, { boss: kill.boss, spec, character: member.character, key, member, kill, talents: member.talents, value });
      }
    }
  }

  const rankings = new Map<string, Best[]>();
  for (const entry of best.values()) {
    const group = `${entry.boss.index}|${entry.spec.id}`;
    const ranking = rankings.get(group);
    if (ranking) {
      ranking.push(entry);
    } else {
      rankings.set(group, [entry]);
    }
  }

  const samples: TalentSample[] = [];
  for (const ranking of rankings.values()) {
    ranking.sort((a, b) => b.value - a.value || a.kill.killedAt - b.kill.killedAt);
    const top = ranking[0].value;
    const topCount = topPlayerCount(ranking.length);
    ranking.forEach((entry, index) => samples.push({
      ...entry,
      relative: top > 0 ? entry.value / top : 0,
      rank: index + 1,
      isTop: index < topCount
    }));
  }
  return samples;
}

/** How many of a ranking's players are its top players: a tenth, rounded up. */
export function topPlayerCount(ranked: number): number {
  return ranked > 0 ? Math.max(1, Math.ceil(ranked * TOP_SHARE)) : 0;
}

// --- Picks per tier ---------------------------------------------------------------------

export interface TalentChoice {
  /** The column on the tier, from 0 at the left. */
  column: number;
  /** Undefined when the talent table doesn't name it. */
  talent?: RaidTalent;
  count: number;
  /** Of all picks: 0 to 1. */
  share: number;
  topCount: number;
  /** Of the top players' picks: 0 to 1. */
  topShare: number;
}

export interface TalentTier {
  /** From 0 at the top. */
  tier: number;
  level: number;
  choices: TalentChoice[];
  /** Picks that left the tier empty. */
  none: number;
  /** The most picked choice, the leftmost on a tie; undefined while nobody picked any. */
  leader?: TalentChoice;
}

export interface TalentPicks {
  /** One per character per boss. */
  picks: number;
  topPicks: number;
  characters: number;
  tiers: TalentTier[];
}

type TalentTiers = ReadonlyArray<ReadonlyArray<RaidTalent | undefined>>;

/** The tiers of a spec's talent table; without one, seven unnamed tiers of three. */
export function specTiers(table: RaidTalentTable, spec: Pick<RaidSpec, 'id'>): TalentTiers {
  return table.get(spec.id) ?? Array.from({ length: 7 }, () => [undefined, undefined, undefined]);
}

/** How often each talent was picked, by everyone and by the top players. Samples of one spec. */
export function talentPicks(samples: readonly TalentSample[], tiers: TalentTiers, levels: readonly number[]): TalentPicks {
  const counts = tiers.map(choices => ({
    all: new Array<number>(Math.max(3, choices.length)).fill(0),
    top: new Array<number>(Math.max(3, choices.length)).fill(0),
    none: 0
  }));
  let topPicks = 0;

  for (const sample of samples) {
    if (sample.isTop) {
      topPicks++;
    }
    for (let tier = 0; tier < counts.length; tier++) {
      const column = Number(sample.talents[tier]);
      const tally = counts[tier];
      if (!Number.isInteger(column) || column >= tally.all.length) {
        tally.none++;
        continue;
      }
      tally.all[column]++;
      if (sample.isTop) {
        tally.top[column]++;
      }
    }
  }

  const picks = samples.length;
  return {
    picks,
    topPicks,
    characters: new Set(samples.map(sample => sample.key)).size,
    tiers: counts.map((tally, tier): TalentTier => {
      const choices = tally.all.map((count, column): TalentChoice => ({
        column,
        talent: tiers[tier][column],
        count,
        share: picks ? count / picks : 0,
        topCount: tally.top[column],
        topShare: topPicks ? tally.top[column] / topPicks : 0
      }));
      const leader = choices.reduce<TalentChoice | undefined>((best, choice) =>
        choice.count > (best?.count ?? 0) ? choice : best, undefined);
      return { tier, level: levels[tier] ?? 0, choices, none: tally.none, leader };
    })
  };
}

/** How often players pick each tier's most picked talent, averaged over the tiers: 0 to 1. */
export function talentAgreement(picks: TalentPicks): number {
  const shares = picks.tiers.flatMap(tier => tier.leader ? [tier.leader.share] : []);
  return shares.length ? shares.reduce((sum, share) => sum + share, 0) / shares.length : 0;
}

/**
 * How a talentAgreement reads: most specs land between half and 85%. Judged on the whole percent
 * shown beside it, so "80%" never reads as Mixed.
 */
export function agreementLabel(agreement: number): string {
  const percent = Math.round(agreement * 100);
  return percent >= 80 ? 'Settled' : percent >= 65 ? 'Mixed' : 'Wide open';
}

export interface TalentEdge {
  tier: TalentTier;
  choice: TalentChoice;
  /** The top players' share minus everyone's. */
  difference: number;
}

/**
 * The talent the top players pick furthest above everyone else (`more`), or below. Nothing when
 * there are fewer than five top picks, or no talent differs by five points.
 */
export function topPlayerEdge(picks: TalentPicks, direction: 'more' | 'less'): TalentEdge | undefined {
  if (picks.topPicks < 5) {
    return undefined;
  }

  const sign = direction === 'more' ? 1 : -1;
  let edge: TalentEdge | undefined;
  for (const tier of picks.tiers) {
    for (const choice of tier.choices) {
      const difference = choice.topShare - choice.share;
      if (sign * difference >= .05 && (!edge || sign * difference > sign * edge.difference)) {
        edge = { tier, choice, difference };
      }
    }
  }
  return edge;
}

/** The tier whose most picked talent has the smallest share: where players agree least. */
export function mostContestedTier(picks: TalentPicks): TalentTier | undefined {
  return picks.tiers.reduce<TalentTier | undefined>((found, tier) =>
    tier.leader && (!found || tier.leader.share < found.leader!.share) ? tier : found, undefined);
}

/** The tier whose most picked talent has the largest share: where players agree most. */
export function mostSettledTier(picks: TalentPicks): TalentTier | undefined {
  return picks.tiers.reduce<TalentTier | undefined>((found, tier) =>
    tier.leader && (!found || tier.leader.share > found.leader!.share) ? tier : found, undefined);
}

// --- Builds -----------------------------------------------------------------------------

export interface TalentBuild {
  /** The column on each tier, as RaidMember.talents has it. */
  talents: string;
  count: number;
  share: number;
  topCount: number;
  topShare: number;
  characters: number;
  /** The pick closest to the best on its boss: the build's best showing. */
  best: TalentSample;
}

export interface BuildSummary {
  picks: number;
  /** Every build seen, most picked first. */
  builds: TalentBuild[];
}

/** Every full build played, most picked first, then most picked by the top players. Samples of one spec. */
export function talentBuilds(samples: readonly TalentSample[]): BuildSummary {
  const builds = new Map<string, { count: number; topCount: number; characters: Set<string>; best: TalentSample }>();
  let topPicks = 0;

  for (const sample of samples) {
    if (sample.isTop) {
      topPicks++;
    }

    const build = builds.get(sample.talents);
    if (!build) {
      builds.set(sample.talents, { count: 1, topCount: sample.isTop ? 1 : 0, characters: new Set([sample.key]), best: sample });
      continue;
    }

    build.count++;
    build.topCount += sample.isTop ? 1 : 0;
    build.characters.add(sample.key);
    if (sample.relative > build.best.relative || (sample.relative === build.best.relative && sample.value > build.best.value)) {
      build.best = sample;
    }
  }

  return {
    picks: samples.length,
    builds: [...builds.entries()]
      .map(([talents, build]): TalentBuild => ({
        talents,
        count: build.count,
        share: samples.length ? build.count / samples.length : 0,
        topCount: build.topCount,
        topShare: topPicks ? build.topCount / topPicks : 0,
        characters: build.characters.size,
        best: build.best
      }))
      .sort((a, b) => b.count - a.count || b.topCount - a.topCount || a.talents.localeCompare(b.talents))
  };
}

/** The talent picked on each tier of a build; undefined for an empty tier or one the table lacks. */
export function buildTalents(talents: string, tiers: TalentTiers): Array<RaidTalent | undefined> {
  return tiers.map((choices, tier) => choices[Number(talents[tier])]);
}

// --- Boss by boss -----------------------------------------------------------------------

export interface BossTalentShares {
  boss: RaidBoss;
  picks: number;
  /** By tier, then column: the share of this boss's picks. */
  shares: number[][];
  /** The same over the spec's other bosses together. */
  elsewhere: number[][];
  elsewherePicks: number;
}

/** Each boss's talent shares, beside the other bosses'. Samples of one spec. */
export function bossTalentShares(samples: readonly TalentSample[], bosses: readonly RaidBoss[], tiers: TalentTiers): BossTalentShares[] {
  const empty = () => tiers.map(choices => new Array<number>(Math.max(3, choices.length)).fill(0));
  const counts = bosses.map(() => ({ picks: 0, columns: empty() }));
  const totals = { picks: 0, columns: empty() };

  for (const sample of samples) {
    const tally = counts[bosses.indexOf(sample.boss)];
    if (!tally) {
      continue;
    }
    tally.picks++;
    totals.picks++;
    for (let tier = 0; tier < tiers.length; tier++) {
      const column = Number(sample.talents[tier]);
      if (Number.isInteger(column) && column < tally.columns[tier].length) {
        tally.columns[tier][column]++;
        totals.columns[tier][column]++;
      }
    }
  }

  return bosses.map((boss, index) => {
    const { picks, columns } = counts[index];
    const elsewherePicks = totals.picks - picks;
    return {
      boss,
      picks,
      shares: columns.map(row => row.map(count => picks ? count / picks : 0)),
      elsewhere: columns.map((row, tier) => row.map((count, column) =>
        elsewherePicks ? (totals.columns[tier][column] - count) / elsewherePicks : 0)),
      elsewherePicks
    };
  });
}

export interface NotablePick {
  tier: number;
  column: number;
  share: number;
  elsewhere: number;
  difference: number;
}

/**
 * The talents picked on a boss NOTABLE_DIFFERENCE or more above the other bosses, the biggest
 * difference first. Nothing when either side has fewer than NOTABLE_MIN_PICKS picks.
 */
export function notablePicks(shares: BossTalentShares): NotablePick[] {
  if (shares.picks < NOTABLE_MIN_PICKS || shares.elsewherePicks < NOTABLE_MIN_PICKS) {
    return [];
  }

  return shares.shares
    .flatMap((row, tier) => row.map((share, column): NotablePick => {
      const elsewhere = shares.elsewhere[tier][column];
      return { tier, column, share, elsewhere, difference: share - elsewhere };
    }))
    .filter(pick => pick.difference >= NOTABLE_DIFFERENCE - 1e-9)
    .sort((a, b) => b.difference - a.difference || a.tier - b.tier);
}

// --- Changing talents between bosses ----------------------------------------------------

export interface TalentSwaps {
  /** The characters the counts are out of. */
  characters: number;
  /** Those who changed at least one tier. */
  changed: number;
  /** By tier: those who changed it. */
  tiers: number[];
}

/**
 * How often players change talents between bosses. Samples of one spec.
 *
 * Without a boss: of the characters with picks on two or more bosses, those who picked more than
 * one talent on a tier. With one: of the characters with picks on it and on another boss, those
 * whose pick there isn't their usual one, the pick they made most often on the other bosses.
 */
export function talentSwaps(samples: readonly TalentSample[], tierCount: number, boss?: RaidBoss): TalentSwaps {
  const byCharacter = new Map<string, TalentSample[]>();
  for (const sample of samples) {
    const own = byCharacter.get(sample.key);
    if (own) {
      own.push(sample);
    } else {
      byCharacter.set(sample.key, [sample]);
    }
  }

  const result: TalentSwaps = { characters: 0, changed: 0, tiers: new Array<number>(tierCount).fill(0) };
  for (const own of byCharacter.values()) {
    const here = boss ? own.find(sample => sample.boss === boss) : undefined;
    const others = boss ? own.filter(sample => sample !== here) : own;
    if (boss ? !here || !others.length : others.length < 2) {
      continue;
    }

    result.characters++;
    let changedAny = false;
    for (let tier = 0; tier < tierCount; tier++) {
      const changed = here
        ? !usualPicks(others, tier).has(here.talents[tier])
        : new Set(others.map(sample => sample.talents[tier])).size > 1;
      if (changed) {
        result.tiers[tier]++;
        changedAny = true;
      }
    }
    if (changedAny) {
      result.changed++;
    }
  }
  return result;
}

/** The pick (or picks, on a tie) made most often on a tier. */
function usualPicks(samples: readonly TalentSample[], tier: number): Set<string> {
  const counts = new Map<string, number>();
  for (const sample of samples) {
    counts.set(sample.talents[tier], (counts.get(sample.talents[tier]) ?? 0) + 1);
  }
  const most = Math.max(...counts.values());
  return new Set([...counts].filter(([, count]) => count === most).map(([pick]) => pick));
}

// --- Every spec at a glance -------------------------------------------------------------

export interface SpecTalentSummary {
  spec: RaidSpec;
  picks: TalentPicks;
  agreement: number;
  /** The most picked build; undefined without picks. */
  topBuild?: TalentBuild;
  buildCount: number;
}

/** Each spec's picks, in the order given; a spec nobody played has none. */
export function specTalentSummaries(samples: readonly TalentSample[], specs: readonly RaidSpec[], table: RaidTalentTable): SpecTalentSummary[] {
  const bySpec = new Map<RaidSpec, TalentSample[]>();
  for (const sample of samples) {
    const own = bySpec.get(sample.spec);
    if (own) {
      own.push(sample);
    } else {
      bySpec.set(sample.spec, [sample]);
    }
  }

  return specs.map(spec => {
    const own = bySpec.get(spec) ?? [];
    const picks = talentPicks(own, specTiers(table, spec), talentLevels(spec.classId));
    const builds = talentBuilds(own).builds;
    return { spec, picks, agreement: talentAgreement(picks), topBuild: builds[0], buildCount: builds.length };
  });
}

export function specsMatching(specs: readonly RaidSpec[], classId: number | undefined, role: RoleFilter): RaidSpec[] {
  return specs.filter(spec => (classId === undefined || spec.classId === classId) && (role === 'all' || spec.role === role));
}

export function sortByPerformance<T extends { spec: RaidSpec }>(
  items: readonly T[],
  scores: ReadonlyMap<RaidSpec, readonly SpecCharacterScore[]>
): T[] {
  const performance = new Map([...scores].map(([spec, entries]) => [spec, topAverage(entries.map(entry => entry.score))]));
  return [...items].sort((a, b) => (performance.get(b.spec) ?? 0) - (performance.get(a.spec) ?? 0));
}

// --- Formatting -------------------------------------------------------------------------

/** `57%`; `<1%` for a share above 0 that would round to it. */
export function formatShare(share: number): string {
  if (!(share > 0)) {
    return '0%';
  }
  const percent = Math.round(share * 100);
  return percent < 1 ? '<1%' : `${percent}%`;
}

/** `+23`, `−8`: a difference between two shares, in percentage points. */
export function formatPoints(difference: number): string {
  const points = Math.round(difference * 100);
  return points > 0 ? `+${points}` : points < 0 ? `−${-points}` : '0';
}
