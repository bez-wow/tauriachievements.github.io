import { Role } from '../../game/wow';
import { formatClock } from '../../shared/time-format';

export interface MythicPlusSeason {
  id: string;
  name: string;
  raid: string;
  startDate: string;
}

export interface MythicPlusDungeon {
  id: string;
  challengeId: number;
  shortName: string;
  name: string;
  timerSeconds: number;
  icon: string;
  runCount: number;
  bestScore: number;
}

export interface MythicPlusAffix {
  id: number;
  name: string;
  level: number;
  icon: string;
  description: string;
}

export interface MythicPlusMember {
  name: string;
  realm: string;
  guild?: string;
  class: number;
  race: number;
  gender: number;
  spec: string;
  role: Role;
}

export interface MythicPlusRun {
  id: string;
  dungeon: string;
  keyLevel: number;
  clearTimeSeconds: number;
  score: number;
  completedAt: string;
  affixes: number[];
  roster: MythicPlusMember[];
}

export const MYTHIC_PLUS_DATA_DIR = 'mythic-plus-data';

export interface MythicPlusSpecEntry {
  class: number;
  name: string;
  role: Role;
}

export type MythicPlusPlayerEntry = [name: string, realm: string, guild: string, classId: number, race: number, gender: number];

export type MythicPlusStandingEntry = [score: number, rank: number, scoreChange?: number, rankChange?: number];

export type MythicPlusRunEntry = [
  keyLevel: number,
  clearTimeMs: number,
  completedAtUnix: number,
  score: number,
  affixIds: number[],
  roster: Array<[player: number, spec: number]>
];

export interface MythicPlusIndex {
  version: number;
  generatedAt?: string;
  previousGeneratedAt?: string;
  tables?: string;
  season: MythicPlusSeason;
  dungeons: MythicPlusDungeon[];
  affixes: MythicPlusAffix[];
  specs: MythicPlusSpecEntry[];
  players: MythicPlusPlayerEntry[];
  standings?: MythicPlusStandingEntry[];
}

export function hasScanChanges(
  index: MythicPlusIndex | undefined
): index is MythicPlusIndex & { previousGeneratedAt: string; standings: MythicPlusStandingEntry[] } {
  return !!index?.previousGeneratedAt && index.standings?.length === index.players.length;
}

export function exportedAt(index: Pick<MythicPlusIndex, 'generatedAt'> | undefined): Date | undefined {
  if (!index?.generatedAt) {
    return undefined;
  }
  const date = new Date(index.generatedAt);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export interface MythicPlusDungeonFile {
  version: number;
  dungeon: string;
  tables?: string;
  runs: MythicPlusRunEntry[];
}

export function sharesTables(
  index: Pick<MythicPlusIndex, 'tables'>,
  file: Pick<MythicPlusDungeonFile, 'tables'>
): boolean {
  return index.tables === file.tables;
}

export const NEWER_DATA_MESSAGE = 'The Mythic+ leaderboard is being updated. Try again in a minute.';

export function createRunDecoder(
  index: Pick<MythicPlusIndex, 'players' | 'specs'>
): (file: MythicPlusDungeonFile) => MythicPlusRun[] {
  const members = new Map<number, MythicPlusMember>();
  const specCount = Math.max(1, index.specs.length);

  const member = (playerIndex: number, specIndex: number): MythicPlusMember | undefined => {
    const key = playerIndex * specCount + specIndex;
    let decoded = members.get(key);
    if (!decoded) {
      const player = index.players[playerIndex];
      const spec = index.specs[specIndex];
      if (!player || !spec) {
        return undefined;
      }

      const [name, realm, guild, classId, race, gender] = player;
      decoded = { name, realm, guild: guild || undefined, class: classId, race, gender, spec: spec.name, role: spec.role };
      members.set(key, decoded);
    }

    return decoded;
  };

  return file => file.runs.map(([keyLevel, clearTimeMs, completedAt, score, affixes, roster], position) => ({
    id: `${file.dungeon}-${position + 1}`,
    dungeon: file.dungeon,
    keyLevel,
    clearTimeSeconds: clearTimeMs / 1000,
    score,
    completedAt: new Date(completedAt * 1000).toISOString(),
    affixes,
    roster: roster
      .map(([playerIndex, specIndex]) => member(playerIndex, specIndex))
      .filter((decoded): decoded is MythicPlusMember => decoded !== undefined)
  }));
}

export interface UpgradeCutoff {
  upgrades: number;
  percent: number;
}

export const UPGRADE_CUTOFFS: ReadonlyArray<UpgradeCutoff> = [
  { upgrades: 3, percent: 60 },
  { upgrades: 2, percent: 80 },
  { upgrades: 1, percent: 100 }
];

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  tank: 'Tank',
  healer: 'Healer',
  dps: 'DPS'
};

const ROLE_ORDER: Readonly<Record<Role, number>> = { tank: 0, healer: 1, dps: 2 };

export function keystoneUpgrades(clearTimeSeconds: number, timerSeconds: number): number {
  if (!(clearTimeSeconds > 0) || !(timerSeconds > 0)) {
    return 0;
  }

  return UPGRADE_CUTOFFS.find(cutoff => clearTimeSeconds * 100 <= timerSeconds * cutoff.percent)?.upgrades ?? 0;
}

export function upgradeCutoffs(timerSeconds: number): Array<UpgradeCutoff & { seconds: number }> {
  return UPGRADE_CUTOFFS.map(cutoff => ({
    ...cutoff,
    seconds: Math.floor((timerSeconds * cutoff.percent) / 100)
  }));
}

export function formatTimerDelta(clearTimeSeconds: number, timerSeconds: number): string {
  const delta = Math.round(clearTimeSeconds - timerSeconds);
  if (!Number.isFinite(delta) || delta === 0) {
    return '0:00';
  }

  return `${delta < 0 ? '-' : '+'}${formatClock(Math.abs(delta))}`;
}

export interface AffixWeek {
  affixes: number[];
  since: number;
}

export function currentAffixWeek(runs: readonly Pick<MythicPlusRun, 'affixes' | 'completedAt'>[]): AffixWeek | undefined {
  let newest: { affixes: number[]; at: number } | undefined;
  for (const run of runs) {
    const at = Date.parse(run.completedAt);
    if (run.affixes.length === 3 && (!newest || at > newest.at)) {
      newest = { affixes: run.affixes, at };
    }
  }

  if (!newest) {
    return undefined;
  }

  const week = newest.affixes;
  let lastOtherWeek = 0;
  for (const run of runs) {
    const at = Date.parse(run.completedAt);
    if (at > lastOtherWeek && run.affixes.some((id, slot) => id !== week[slot])) {
      lastOtherWeek = at;
    }
  }

  return { affixes: [...week], since: lastOtherWeek + 1 };
}

export function upgradeStars(upgrades: number): string {
  return '★'.repeat(Math.max(0, Math.min(3, upgrades)));
}

export function rankRuns<T extends Pick<MythicPlusRun, 'id' | 'score' | 'clearTimeSeconds'>>(runs: readonly T[]): T[] {
  return [...runs].sort((a, b) =>
    b.score - a.score
    || a.clearTimeSeconds - b.clearTimeSeconds
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function scoreTiers(scores: readonly number[]): number[] | undefined {
  const sorted = scores.filter(score => score > 0).sort((a, b) => b - a);
  const n = sorted.length;
  if (n < 20) {
    return undefined;
  }

  const top = (share: number) => sorted[Math.max(1, Math.ceil(n * share)) - 1];
  return [sorted[n - 1], top(0.6), top(0.25), top(0.1), top(0.01), top(0.001)];
}

const TIER_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [255, 255, 255], [31, 255, 0], [0, 112, 222], [163, 54, 237], [255, 128, 0], [255, 209, 0]
];

export function scoreColor(score: number, tiers: readonly number[] | undefined): string {
  if (!tiers || !(score > 0)) {
    return '#9e9e9e';
  }

  const last = tiers.length - 1;
  if (score >= tiers[last]) {
    return `rgb(${TIER_COLORS[last].join(', ')})`;
  }

  if (score < tiers[0]) {
    return '#9e9e9e';
  }

  for (let i = 0; i < last; i++) {
    if (score < tiers[i + 1]) {
      const t = (score - tiers[i]) / Math.max(tiers[i + 1] - tiers[i], 0.001);
      const [a, b] = [TIER_COLORS[i], TIER_COLORS[i + 1]];
      return `rgb(${a.map((value, k) => Math.round(value + (b[k] - value) * t)).join(', ')})`;
    }
  }

  return `rgb(${TIER_COLORS[last].join(', ')})`;
}

export interface ScoreColors {
  tiers: number[] | undefined;
  dungeons: number;
}

export function seasonScoreColors(index: MythicPlusIndex | undefined): ScoreColors {
  return {
    tiers: scoreTiers((index?.standings ?? []).map(([score]) => score)),
    dungeons: index?.dungeons.length ?? 0
  };
}

export function runScoreColor(score: number, colors: ScoreColors): string {
  return scoreColor(score * Math.max(1, colors.dungeons), colors.tiers);
}

export function runIncludesPlayer(run: { roster: ReadonlyArray<Pick<MythicPlusMember, 'name'>> }, query: string): boolean {
  const needle = foldName(query.trim());
  return !needle || run.roster.some(member => foldedMemberName(member).includes(needle));
}

export function characterKey(member: Pick<MythicPlusMember, 'name' | 'realm'>): string {
  return `${member.name}|${member.realm}`;
}

export function runIncludesCharacter(
  run: { roster: ReadonlyArray<Pick<MythicPlusMember, 'name' | 'realm'>> },
  key: string
): boolean {
  return run.roster.some(member => characterKey(member) === key);
}

export function memberNameMatches(member: Pick<MythicPlusMember, 'name'>, query: string): boolean {
  const needle = foldName(query.trim());
  return !needle || foldedMemberName(member).includes(needle);
}

export interface PlayerScore {
  key: string;
  member: MythicPlusMember;
  primarySpec: string;
  score: number;
  totalTime: number;
  bestRuns: ReadonlyMap<string, MythicPlusRun>;
}

export function rankPlayers(
  runs: readonly MythicPlusRun[],
  include?: (member: MythicPlusMember) => boolean
): PlayerScore[] {
  const players = new Map<string, {
    member: MythicPlusMember;
    topRun: MythicPlusRun;
    bestRuns: Map<string, MythicPlusRun>;
    specRuns: Map<string, number>;
  }>();

  for (const run of runs) {
    for (const member of run.roster) {
      if (include && !include(member)) {
        continue;
      }

      const key = characterKey(member);
      let player = players.get(key);
      if (!player) {
        player = { member, topRun: run, bestRuns: new Map(), specRuns: new Map() };
        players.set(key, player);
      } else if (isBetterRun(run, player.topRun)) {
        player.member = member;
        player.topRun = run;
      }
      player.specRuns.set(member.spec, (player.specRuns.get(member.spec) ?? 0) + 1);

      const best = player.bestRuns.get(run.dungeon);
      if (!best || isBetterRun(run, best)) {
        player.bestRuns.set(run.dungeon, run);
      }
    }
  }

  return [...players].map(([key, player]) => {
    let total = 0;
    let time = 0;
    for (const run of player.bestRuns.values()) {
      total += run.score;
      time += run.clearTimeSeconds;
    }

    let primarySpec = player.member.spec;
    let primarySpecRuns = player.specRuns.get(primarySpec) ?? 0;
    for (const [spec, count] of player.specRuns) {
      if (count > primarySpecRuns) {
        primarySpec = spec;
        primarySpecRuns = count;
      }
    }

    return {
      key, member: player.member, primarySpec, score: Math.round(total * 10) / 10,
      totalTime: Math.round(time * 1000) / 1000, bestRuns: player.bestRuns
    };
  }).sort((a, b) => b.score - a.score || a.totalTime - b.totalTime || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export function samePlace(a: Pick<PlayerScore, 'score' | 'totalTime'>, b: Pick<PlayerScore, 'score' | 'totalTime'>): boolean {
  return a.score === b.score && a.totalTime === b.totalTime;
}

export function playerRanks(ranking: readonly Pick<PlayerScore, 'score' | 'totalTime'>[]): number[] {
  const ranks: number[] = [];
  ranking.forEach((player, index) => {
    ranks.push(index > 0 && samePlace(player, ranking[index - 1]) ? ranks[index - 1] : index + 1);
  });
  return ranks;
}

export function isBetterRun(
  candidate: Pick<MythicPlusRun, 'score' | 'clearTimeSeconds'>,
  current: Pick<MythicPlusRun, 'score' | 'clearTimeSeconds'>
): boolean {
  return candidate.score > current.score
    || (candidate.score === current.score && candidate.clearTimeSeconds < current.clearTimeSeconds);
}

export function sortRoster<T extends Pick<MythicPlusMember, 'role'>>(roster: readonly T[]): T[] {
  return [...roster].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

const foldedNames = new WeakMap<object, string>();

function foldedMemberName(member: Pick<MythicPlusMember, 'name'>): string {
  let folded = foldedNames.get(member);
  if (folded === undefined) {
    folded = foldName(member.name);
    foldedNames.set(member, folded);
  }

  return folded;
}

function foldName(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}
