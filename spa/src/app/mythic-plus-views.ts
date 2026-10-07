import { getArmoryUrl } from '../utils/armory';
import { getClassIconPath } from '../utils/classIconHelper';
import { getRaceIconPath } from '../utils/raceIconHelper';
import { getClassColor } from './class-colors';
import {
  CLASS_NAMES,
  MythicPlusAffix,
  MythicPlusDungeon,
  MythicPlusMember,
  MythicPlusRun,
  RunQuality,
  formatClock,
  formatDuration,
  formatTimerDelta,
  keystoneUpgrades,
  scoreQuality,
  sortRoster,
  upgradeCutoffs
} from './mythic-plus';
import { specIconFor } from './mythic-plus-stats';

/**
 * Below this width the leaderboard lists runs and players as cards instead of wide tables, and
 * the stats page stacks its affix weeks. Wider than the site's phone breakpoint (640 px): the
 * 1040 px runs table doesn't fit a phone held sideways or a small tablet either. Keep it in step
 * with the `$cards-breakpoint` media queries in the M+ stylesheets.
 */
export const MYTHIC_PLUS_CARDS_QUERY = '(max-width: 900px)';

export interface MemberView extends MythicPlusMember {
  color: string;
  className: string;
  armoryUrl: string;
  classIcon: string;
  raceIcon: string;
  specIcon?: string;
}

export interface CutoffView {
  upgrades: number;
  time: string;
}

export interface RunView {
  id: string;
  dungeon: MythicPlusDungeon;
  keyLevel: number;
  upgrades: number;
  clearTime: string;
  clearClock: string;
  timerClock: string;
  timerDelta: string;
  timerPercent: number;
  cutoffs: CutoffView[];
  score: number;
  quality: RunQuality;
  completedAt: string;
  affixes: MythicPlusAffix[];
  tank?: MemberView;
  healer?: MemberView;
  dps: MemberView[];
  roster: MemberView[];
}

export interface RunRow extends RunView {
  rank: number;
}

/** A character's best run in one dungeon, as a cell of the players table. */
export interface BestRunCell {
  dungeon: MythicPlusDungeon;
  keyLevel: number;
  timed: boolean;
  upgrades: number;
  clearTime: string;
  score: number;
}

export interface PlayerRow {
  key: string;
  rank: number;
  member: MemberView;
  score: number;
  quality: RunQuality;
  /** One per dungeon in scope, in tile order; undefined where the character has no run. */
  bests: Array<BestRunCell | undefined>;
}

export function toMemberView(member: MythicPlusMember): MemberView {
  return {
    ...member,
    color: getClassColor(member.class) ?? '#e0e0e0',
    className: CLASS_NAMES[member.class] ?? 'Unknown',
    armoryUrl: getArmoryUrl(member.name, member.realm),
    classIcon: getClassIconPath(member.class),
    raceIcon: getRaceIconPath(member.race, member.gender),
    specIcon: specIconFor(member.class, member.spec)
  };
}

export function toRunView(
  run: MythicPlusRun,
  dungeon: MythicPlusDungeon,
  affixes: ReadonlyMap<number, MythicPlusAffix>,
  bestScore: number
): RunView {
  const upgrades = keystoneUpgrades(run.clearTimeSeconds, dungeon.timerSeconds);
  const roster = sortRoster(run.roster).map(toMemberView);

  return {
    id: run.id,
    dungeon,
    keyLevel: run.keyLevel,
    upgrades,
    clearTime: formatDuration(run.clearTimeSeconds),
    clearClock: formatClock(run.clearTimeSeconds),
    timerClock: formatClock(dungeon.timerSeconds),
    timerDelta: formatTimerDelta(run.clearTimeSeconds, dungeon.timerSeconds),
    timerPercent: Math.min(100, (run.clearTimeSeconds / dungeon.timerSeconds) * 100),
    cutoffs: upgradeCutoffs(dungeon.timerSeconds)
      .map(cutoff => ({ upgrades: cutoff.upgrades, time: formatClock(cutoff.seconds) })),
    score: run.score,
    quality: scoreQuality(run.score, bestScore),
    completedAt: run.completedAt,
    affixes: run.affixes
      .map(id => affixes.get(id))
      .filter((affix): affix is MythicPlusAffix => affix !== undefined)
      .sort((a, b) => a.level - b.level),
    tank: roster.find(member => member.role === 'tank'),
    healer: roster.find(member => member.role === 'healer'),
    dps: roster.filter(member => member.role === 'dps'),
    roster
  };
}
