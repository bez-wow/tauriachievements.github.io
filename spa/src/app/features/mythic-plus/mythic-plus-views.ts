import { Params } from '@angular/router';
import { getArmoryUrl } from '../../game/armory';
import { getClassIconPath } from '../../game/classIconHelper';
import { getRaceIconPath } from '../../game/raceIconHelper';
import { getClassColor } from '../../game/class-colors';
import {
  MythicPlusAffix,
  MythicPlusDungeon,
  MythicPlusMember,
  MythicPlusRun,
  formatTimerDelta,
  keystoneUpgrades,
  runScoreColor,
  ScoreColors,
  sortRoster,
  upgradeCutoffs
} from './mythic-plus';
import { guildLadderLink, guildOf } from './mythic-plus-guild';
import { CLASS_NAMES } from '../../game/wow';
import { specIconFor } from '../../game/wow-specs';
import { formatClock, formatDuration } from '../../shared/time-format';
import { mythicPlusProfileLink } from '../../core/page-links';

export const MYTHIC_PLUS_CARDS_QUERY = '(max-width: 900px)';

export const MYTHIC_PLUS_PAGE_SIZE = 50;
export const MYTHIC_PLUS_CARDS_PAGE_SIZE = 25;

export interface MemberView extends MythicPlusMember {
  color: string;
  className: string;
  armoryUrl: string;
  profileLink: string[];
  guildLink?: string[];
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
  color: string;
  completedAt: string;
  affixes: MythicPlusAffix[];
  tanks: MemberView[];
  healers: MemberView[];
  dps: MemberView[];
  roster: MemberView[];
}

export interface RunRow extends RunView {
  rank: number;
}

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
  color: string;
  change?: { score: number; rank: number };
  newSinceLastScan?: boolean;
  overall?: { rank: number; queryParams: Params };
  bests: Array<BestRunCell | undefined>;
}

export function toMemberView(member: MythicPlusMember): MemberView {
  const guild = guildOf(member);
  return {
    ...member,
    color: getClassColor(member.class) ?? '#e0e0e0',
    className: CLASS_NAMES[member.class] ?? 'Unknown',
    armoryUrl: getArmoryUrl(member.name, member.realm),
    profileLink: mythicPlusProfileLink(member),
    guildLink: guild && guildLadderLink(guild),
    classIcon: getClassIconPath(member.class),
    raceIcon: getRaceIconPath(member.race, member.gender),
    specIcon: specIconFor(member.class, member.spec)
  };
}

export function bestRunCells(
  bestRuns: ReadonlyMap<string, MythicPlusRun>,
  dungeons: readonly MythicPlusDungeon[]
): Array<BestRunCell | undefined> {
  return dungeons.map(dungeon => {
    const run = bestRuns.get(dungeon.id);
    const upgrades = run ? keystoneUpgrades(run.clearTimeSeconds, dungeon.timerSeconds) : 0;
    return run && {
      dungeon,
      keyLevel: run.keyLevel,
      timed: upgrades > 0,
      upgrades,
      clearTime: formatDuration(run.clearTimeSeconds),
      score: run.score
    };
  });
}

export function toRunView(
  run: MythicPlusRun,
  dungeon: MythicPlusDungeon,
  affixes: ReadonlyMap<number, MythicPlusAffix>,
  colors: ScoreColors
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
    color: runScoreColor(run.score, colors),
    completedAt: run.completedAt,
    affixes: run.affixes
      .map(id => affixes.get(id))
      .filter((affix): affix is MythicPlusAffix => affix !== undefined)
      .sort((a, b) => a.level - b.level),
    tanks: roster.filter(member => member.role === 'tank'),
    healers: roster.filter(member => member.role === 'healer'),
    dps: roster.filter(member => member.role === 'dps'),
    roster
  };
}
