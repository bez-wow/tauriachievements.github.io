import { Role } from '../../game/wow';
import { LEGION_SPECS } from '../../game/wow-specs';
import { getSpecArtPath } from '../../game/classIconHelper';
import { RaidSpec } from './raid-logs.types';
import { SPEC_TOP_SCORES, SpecCharacterScore, specPerformance } from './raid-scores';

export interface SpecTier {
  key: string;
  label: string;
  minPercent: number;
  color: string;
}

export const SPEC_TIERS: ReadonlyArray<SpecTier> = [
  { key: 's', label: 'S', minPercent: 95, color: '#ff7f7f' },
  { key: 'a', label: 'A', minPercent: 85, color: '#ffbf7f' },
  { key: 'b', label: 'B', minPercent: 75, color: '#ffdf7f' },
  { key: 'c', label: 'C', minPercent: 60, color: '#ffff7f' },
  { key: 'f', label: 'F', minPercent: 0, color: '#bfff7f' }
];

export const FEW_PLAYERS = SPEC_TOP_SCORES;

export const TIER_LIST_ROLES: ReadonlyArray<{ role: Role; title: string }> = [
  { role: 'dps', title: 'DPS' },
  { role: 'healer', title: 'Heal' },
  { role: 'tank', title: 'Tank' }
];

export type RankingsQuery = Record<string, string | number | null>;

export interface TierSpec {
  id: number;
  classId: number;
  name: string;
  color: string;
  art: string;
  score: number;
  count: number;
  percentOfBest: number;
  fewPlayers: boolean;
  note: string;
  label: string;
  rankingsQuery: RankingsQuery;
}

export interface TierRow {
  tier: SpecTier;
  specs: TierSpec[];
}

export interface RoleTierList {
  role: Role;
  title: string;
  characterCount: number;
  rows: TierRow[];
  unplayed: string[];
}

const GAME_ORDER = new Map(LEGION_SPECS.map((spec, index) => [spec.id, index]));

export function percentOfBest(score: number, best: number): number {
  return best > 0 ? Math.floor(score * 100 / best + 1e-9) : 0;
}

export function tierFor(percent: number): SpecTier {
  return SPEC_TIERS.find(tier => percent >= tier.minPercent) ?? SPEC_TIERS[SPEC_TIERS.length - 1];
}

export function describeTiers(): string {
  return SPEC_TIERS
    .map(tier => tier.minPercent ? `${tier.label} from ${tier.minPercent}%` : `${tier.label} below`)
    .join(', ');
}

function characterCount(count: number, fewPlayers: boolean): string {
  const characters = `${count.toLocaleString('en-US')} ${count === 1 ? 'character' : 'characters'}`;
  return fewPlayers ? `only ${characters}` : characters;
}

function specFacts(score: number, percent: number, count: number, fewPlayers: boolean, role: Role): string[] {
  return [
    `${score.toLocaleString('en-US')} ${role === 'healer' ? 'HPS' : 'DPS'} score`,
    `${percent}% of the best`,
    characterCount(count, fewPlayers)
  ];
}

export function roleTierList(
  scores: ReadonlyMap<RaidSpec, readonly SpecCharacterScore[]>,
  role: Role,
  title: string,
  difficulty: string
): RoleTierList {
  const { classes, characterCount: characters } = specPerformance(scores, role);
  const ranked = classes
    .flatMap(group => group.specs.map(spec => ({ spec, className: group.className, color: group.color })))
    .sort((a, b) => b.spec.score - a.spec.score || (GAME_ORDER.get(a.spec.id) ?? 0) - (GAME_ORDER.get(b.spec.id) ?? 0));
  const best = ranked[0]?.spec.score ?? 0;

  const played = ranked.filter(({ spec }) => spec.count > 0).map(({ spec, className, color }): TierSpec => {
    const percent = percentOfBest(spec.score, best);
    const fewPlayers = spec.count < FEW_PLAYERS;
    const facts = specFacts(spec.score, percent, spec.count, fewPlayers, role);
    const name = `${spec.spec} ${className}`;
    return {
      id: spec.id,
      classId: spec.classId,
      name,
      color,
      art: getSpecArtPath(className, spec.spec),
      score: spec.score,
      count: spec.count,
      percentOfBest: percent,
      fewPlayers,
      note: facts.join(' · '),
      label: `${name}, ${tierFor(percent).label} tier: ${facts.join(', ')}. Open its rankings.`,
      rankingsQuery: { difficulty, metric: role === 'healer' ? 'hps' : null, class: spec.classId, spec: spec.id }
    };
  });

  return {
    role,
    title,
    characterCount: characters,
    rows: SPEC_TIERS.map(tier => ({ tier, specs: played.filter(spec => tierFor(spec.percentOfBest) === tier) })),
    unplayed: ranked.filter(({ spec }) => spec.count === 0).map(({ spec, className }) => `${spec.spec} ${className}`)
  };
}
