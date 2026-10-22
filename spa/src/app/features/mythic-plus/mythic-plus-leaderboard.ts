import { FilterDropdownOption } from '../../shared/filter-dropdown.types';
import { CLASS_NAMES, Role, realmSlug } from '../../game/wow';
import {
  MythicPlusDungeon,
  MythicPlusIndex,
  MythicPlusMember,
  MythicPlusPlayerEntry,
  MythicPlusRun,
  characterKey,
  hasScanChanges,
  rankRuns,
  runIncludesCharacter,
  runIncludesPlayer
} from './mythic-plus';

export type LeaderboardView = 'runs' | 'players';

export type LeaderboardPeriod = 'season' | 'week';

export type RunOrder = 'best' | 'latest';

export interface RankedRun {
  run: MythicPlusRun;
  rank: number;
}

export interface PlayerStandingChange {
  score: number;
  rank: number;
}

export interface MemberFilters {
  realm?: string;
  classId?: number;
  spec?: string;
  role?: Role;
}

export interface EmptyLeaderboard {
  view: LeaderboardView;
  period: LeaderboardPeriod;
  query: string;
  dungeon?: Pick<MythicPlusDungeon, 'name'>;
  character?: { name: string; realm: string };
  classId?: number;
  spec?: string;
  realmName?: string;
  role?: Role;
}

export function realmFilterOptions(players: readonly MythicPlusPlayerEntry[]): FilterDropdownOption[] {
  const counts = new Map<string, number>();
  for (const [, realm] of players) {
    counts.set(realm, (counts.get(realm) ?? 0) + 1);
  }

  return [
    { value: undefined, label: 'All realms' },
    ...[...counts].sort((a, b) => b[1] - a[1]).map(([realm]) => ({ value: realmSlug(realm), label: realm }))
  ];
}

export function memberFilter({ realm, classId, spec, role }: MemberFilters): ((member: MythicPlusMember) => boolean) | undefined {
  if (realm === undefined && classId === undefined && role === undefined) {
    return undefined;
  }

  return member => (realm === undefined || realmSlug(member.realm) === realm)
    && (classId === undefined || (member.class === classId && (spec === undefined || member.spec === spec)))
    && (role === undefined || member.role === role);
}

export function runsInScope(
  loaded: ReadonlyMap<string, readonly MythicPlusRun[]>,
  dungeons: readonly MythicPlusDungeon[],
  selected: MythicPlusDungeon | undefined,
  since: number | undefined
): readonly MythicPlusRun[] | undefined {
  const inPeriod = (runs: readonly MythicPlusRun[]) => since === undefined
    ? runs
    : runs.filter(run => Date.parse(run.completedAt) >= since);
  if (selected) {
    const runs = loaded.get(selected.id);
    return runs && rankRuns(inPeriod(runs));
  }

  if (dungeons.some(entry => !loaded.has(entry.id))) {
    return undefined;
  }

  return rankRuns(inPeriod(dungeons.flatMap(entry => loaded.get(entry.id) ?? [])));
}

export function filterRuns(
  ranked: readonly RankedRun[],
  character: string | undefined,
  query: string,
  order: RunOrder
): readonly RankedRun[] {
  const rows = character
    ? ranked.filter(entry => runIncludesCharacter(entry.run, character))
    : query.trim() ? ranked.filter(entry => runIncludesPlayer(entry.run, query)) : ranked;
  return order === 'latest'
    ? [...rows].sort((a, b) => Date.parse(b.run.completedAt) - Date.parse(a.run.completedAt) || a.rank - b.rank)
    : rows;
}

export function scanStandingChanges(index: MythicPlusIndex | undefined): Map<string, PlayerStandingChange> {
  const changes = new Map<string, PlayerStandingChange>();
  if (!hasScanChanges(index)) {
    return changes;
  }

  index.standings.forEach((standing, playerIndex) => {
    const score = standing[2];
    const rank = standing[3];
    const player = index.players[playerIndex];
    if (player && score !== undefined && rank !== undefined) {
      changes.set(characterKey({ name: player[0], realm: player[1] }), { score, rank });
    }
  });
  return changes;
}

export function emptyLeaderboardMessage(state: EmptyLeaderboard): string {
  const { view, period, dungeon, character, classId, realmName, role } = state;
  const query = state.query.trim();

  if (character && view === 'runs') {
    return `No runs with ${character.name} (${character.realm})${dungeon ? ` in ${dungeon.name}` : ''}.`;
  }

  if (query) {
    const subject = view === 'players' ? 'No players matching' : 'No runs with a player matching';
    return `${subject} "${query}"${dungeon ? ` in ${dungeon.name}` : ''}.`;
  }

  if (view === 'players' && (classId !== undefined || realmName || role)) {
    const who = role ? (role === 'dps' ? 'DPS player' : role)
      : classId === undefined ? 'player' : [state.spec, CLASS_NAMES[classId]].filter(Boolean).join(' ');
    return `No ${who}${realmName ? ` on ${realmName}` : ''} has a run${dungeon ? ` in ${dungeon.name}` : ''} yet.`;
  }

  if (period === 'week') {
    return dungeon ? `No ${dungeon.name} runs yet this week.` : 'No runs yet this week.';
  }

  return dungeon ? `No ${dungeon.name} runs recorded yet.` : 'No runs recorded yet this season.';
}
