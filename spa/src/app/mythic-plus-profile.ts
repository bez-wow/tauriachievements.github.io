import { localDay } from './mythic-plus-activity';
import { MythicPlusMember, MythicPlusRun, PlayerScore, characterKey, isBetterRun } from './mythic-plus';

/*
 * The pure parts of /mythic-plus/character/:realm/:name, a character's season on one page:
 * finding the character the URL names, their ranks, their score day by day and who they play with.
 */

type Character = Pick<MythicPlusMember, 'name' | 'realm'>;

/** The realm as it appears in profile URLs: `evermoon`, `tauri`, `wod`. */
export function realmSlug(realm: string): string {
  return realm.toLowerCase();
}

/** Router commands for a character's profile page. */
export function characterProfileLink(character: Character): string[] {
  return ['/mythic-plus', 'character', realmSlug(character.realm), character.name];
}

/** `Progtrix-Evermoon`, the way the game writes a character from another realm. */
export function characterParam(character: Character): string {
  return `${character.name}-${character.realm}`;
}

/** Reads `characterParam`. Character names can't contain a hyphen, so the last one splits it. */
export function parseCharacterParam(value: string | null | undefined): Character | undefined {
  const split = value?.lastIndexOf('-') ?? -1;
  if (!value || split <= 0 || split === value.length - 1) {
    return undefined;
  }

  return { name: value.slice(0, split), realm: value.slice(split + 1) };
}

/**
 * The characters a profile URL names. The realm is matched without regard to case. The name is
 * matched exactly first, then without regard to case, so a typed `/evermoon/progtrix` still
 * finds Progtrix; that second match can return more than one character.
 */
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
}

/**
 * A character's place among the players `inScope` keeps, in the order of `ranking`
 * (rankPlayers). Ranks count from 1, as on the players view, so ties get distinct ranks there
 * and here alike. Undefined when the character isn't in scope.
 */
export function scopeRank(
  ranking: readonly PlayerScore[],
  key: string,
  inScope: (player: PlayerScore) => boolean = () => true
): ScopeRank | undefined {
  let total = 0;
  let rank: number | undefined;
  for (const player of ranking) {
    if (!inScope(player)) {
      continue;
    }

    total++;
    if (player.key === key) {
      rank = total;
    }
  }

  return rank === undefined ? undefined : { rank, total };
}

/**
 * `top 2.3%`: the share of the players at or above this rank, rounded up so it never flatters,
 * to a tenth of a percent below 10% and to whole percents above.
 */
export function formatTopPercent({ rank, total }: ScopeRank): string {
  if (!(total > 0)) {
    return '';
  }

  // In tenths of a percent, rounded up; integer maths keeps 23 of 1000 at exactly 2.3%.
  const tenths = Math.max(1, Math.ceil((rank * 1000) / total));
  return tenths < 100 ? `top ${(tenths / 10).toFixed(1)}%` : `top ${Math.ceil(tenths / 10)}%`;
}

/** The leaderboard page (1-based) that shows a rank, at a page size. */
export function pageOfRank(rank: number, pageSize: number): number {
  return Math.max(1, Math.ceil(rank / pageSize));
}

export interface ScoreDay {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  /** Player score at the end of the day. */
  score: number;
  /** Score added that day. */
  gained: number;
  /** Runs finished that day. */
  runs: number;
}

/**
 * The character's player score at the end of each local day from `from` to `to` (epoch ms),
 * both included. Replays their runs in the order they finished, keeping the best score per
 * dungeon as rankPlayers does, so the last day ends on their current score. Runs before `from`
 * count on the first day.
 */
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
    // Scores carry one decimal; rounding keeps float noise out, as in rankPlayers.
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
  /** As they appear in the best run played together. */
  member: MythicPlusMember;
  /** Runs played together. */
  runs: number;
  /** The highest-scoring run played together; a faster clear breaks ties. */
  bestRun: MythicPlusRun;
}

/**
 * The characters someone has played with most, from their runs: most shared runs first, then
 * the better best run together, then by name. At most `limit`.
 */
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

/** The specs a character played and in how many runs: `first` (their top run's spec) first, then the most played. */
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
