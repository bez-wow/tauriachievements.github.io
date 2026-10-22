import { CLASS_NAMES } from '../../game/wow';
import { GuildAnalysisLegendary, GuildAnalysisPlayer, GuildAnalysisRank } from './guild-analysis';

export type CombatRole = 'Tank' | 'Heal' | 'Ranged' | 'Melee';

export type SortColumn =
  | 'name'
  | 'guildRankName'
  | 'artifactTraits'
  | 'artifactKnowledge'
  | 'itemLevel';

export type SortDirection = 'asc' | 'desc';

export interface ClassCountEntry {
  id: number;
  name: string;
  count: number;
  percentage: number;
}

export interface RosterFilters {
  classId: number | null;
  guildRank: string;
  combatRole: CombatRole | '';
}

const LEGACY_GUILD_RANK_ORDER = [
  'Guild Master',
  'Officer',
  'Officer Alt',
  'Core',
  'Raider',
  'Trial',
  'Alt',
  'Family'
] as const;

const SORT_COLUMNS = new Set<string>([
  'name',
  'guildRankName',
  'artifactTraits',
  'artifactKnowledge',
  'itemLevel'
]);

export function isSortColumn(column: string): column is SortColumn {
  return SORT_COLUMNS.has(column);
}

export function defaultSortDirection(column: SortColumn): SortDirection {
  return column === 'name' || column === 'guildRankName' ? 'asc' : 'desc';
}

export function guildRankOrder(ranks: readonly GuildAnalysisRank[]): ReadonlyMap<string, number> {
  return new Map(ranks.map((rank) => [rank.name.trim().toLocaleLowerCase(), rank.order]));
}

export function countClasses(players: readonly GuildAnalysisPlayer[]): ClassCountEntry[] {
  const counts = new Map<number, number>();

  for (const player of players) {
    if (!CLASS_NAMES[player.class]) {
      continue;
    }

    counts.set(player.class, (counts.get(player.class) ?? 0) + 1);
  }

  const largestClassCount = Math.max(0, ...counts.values());
  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      name: CLASS_NAMES[id],
      count,
      percentage: largestClassCount === 0 ? 0 : count / largestClassCount * 100
    }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

export function guildRankNames(players: readonly GuildAnalysisPlayer[], ranks: readonly GuildAnalysisRank[]): string[] {
  const playerRankNames = [...new Set(
    players
      .map((player) => player.guildRankName?.trim())
      .filter((rank): rank is string => Boolean(rank))
  )];
  const playerRankNamesByKey = new Map(
    playerRankNames.map((rank) => [rank.toLocaleLowerCase(), rank])
  );
  const exportedRanks = ranks
    .filter((rank) => rank.name.trim().length > 0)
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))
    .map((rank) => playerRankNamesByKey.get(rank.name.trim().toLocaleLowerCase()) ?? rank.name.trim());
  const exportedRankKeys = new Set(exportedRanks.map((rank) => rank.toLocaleLowerCase()));
  const unlistedPlayerRanks = playerRankNames
    .filter((rank) => !exportedRankKeys.has(rank.toLocaleLowerCase()))
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));

  if (exportedRanks.length > 0) {
    return [...exportedRanks, ...unlistedPlayerRanks];
  }

  return playerRankNames.sort((left, right) => {
    const leftIndex = guildRankOrderIndex(left);
    const rightIndex = guildRankOrderIndex(right);
    return leftIndex - rightIndex
      || left.localeCompare(right, undefined, { sensitivity: 'base' });
  });
}

export function rosterRows(
  players: readonly GuildAnalysisPlayer[],
  filters: RosterFilters,
  column: SortColumn,
  direction: SortDirection,
  rankOrder: ReadonlyMap<string, number>
): GuildAnalysisPlayer[] {
  const multiplier = direction === 'asc' ? 1 : -1;
  const classFilteredPlayers = filters.classId === null
    ? players
    : players.filter((player) => player.class === filters.classId);
  const rankFilteredPlayers = filters.guildRank
    ? classFilteredPlayers.filter((player) =>
        player.guildRankName?.localeCompare(
          filters.guildRank,
          undefined,
          { sensitivity: 'base' }
        ) === 0
      )
    : classFilteredPlayers;
  const visiblePlayers = filters.combatRole
    ? rankFilteredPlayers.filter((player) =>
        combatRole(player) === filters.combatRole
      )
    : rankFilteredPlayers;

  return [...visiblePlayers].sort((left, right) => {
    const leftValue = sortValue(left, column, rankOrder);
    const rightValue = sortValue(right, column, rankOrder);

    if (leftValue === null && rightValue === null) {
      return left.name.localeCompare(right.name);
    }
    if (leftValue === null) {
      return 1;
    }
    if (rightValue === null) {
      return -1;
    }

    const comparison = typeof leftValue === 'string'
      ? leftValue.localeCompare(rightValue as string, undefined, { sensitivity: 'base' })
      : leftValue - (rightValue as number);

    return comparison === 0 ? left.name.localeCompare(right.name) : comparison * multiplier;
  });
}

export function combatRole(player: GuildAnalysisPlayer): CombatRole | undefined {
  const specialization = player.specialization?.trim();
  if (!specialization) {
    return undefined;
  }

  switch (player.class) {
    case 1:
      return specialization === 'Protection' ? 'Tank' : 'Melee';
    case 2:
      return specialization === 'Protection' ? 'Tank'
        : specialization === 'Holy' ? 'Heal'
        : 'Melee';
    case 3:
      return specialization === 'Survival' ? 'Melee' : 'Ranged';
    case 4:
      return 'Melee';
    case 5:
      return specialization === 'Shadow' ? 'Ranged' : 'Heal';
    case 6:
      return specialization === 'Blood' ? 'Tank' : 'Melee';
    case 7:
      return specialization === 'Restoration' ? 'Heal'
        : specialization === 'Elemental' ? 'Ranged'
        : 'Melee';
    case 8:
    case 9:
      return 'Ranged';
    case 10:
      return specialization === 'Brewmaster' ? 'Tank'
        : specialization === 'Mistweaver' ? 'Heal'
        : 'Melee';
    case 11:
      return specialization === 'Guardian' ? 'Tank'
        : specialization === 'Restoration' ? 'Heal'
        : specialization === 'Balance' ? 'Ranged'
        : 'Melee';
    case 12:
      return specialization === 'Vengeance' ? 'Tank' : 'Melee';
    default:
      return undefined;
  }
}

export function parseGuildTimestamp(timestamp: string): Date | undefined {
  const match = timestamp.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\s+(CET|CEST|UTC)$/
  );
  if (!match) {
    return undefined;
  }

  const [, year, month, day, hour, minute, second, zone] = match;
  const offset = zone === 'CEST' ? '+02:00' : zone === 'CET' ? '+01:00' : '+00:00';
  const parsedDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`);
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
}

export function timeZoneLabelOf(timestamp: string): string {
  return timestamp.trim().split(/\s+/).at(-1) || 'Local time';
}

export function timeZoneOffset(timeZoneLabel: string): string | undefined {
  return timeZoneLabel === 'CEST' ? '+0200'
    : timeZoneLabel === 'CET' ? '+0100'
    : timeZoneLabel === 'UTC' ? '+0000'
    : undefined;
}

export function legendaryUrl(item: Pick<GuildAnalysisLegendary, 'id'>): string {
  return `https://legion-shoot.tauri.hu/?item=${item.id}`;
}

export function legendaryTooltipHtml(tooltipHtml: string): string {
  return tooltipHtml
    .replace(/(?:&nbsp;)?<small\b[^>]*>.*?<\/small>/gis, '')
    .replace(
      /<br\s*\/?>\s*(?:<!--sockets-->)?\s*Durability[^<]*<br\s*\/?>/gi,
      '<br />'
    )
    .replace(/<br\s*\/?>\s*Requires Level[^<]*<br\s*\/?>/gi, '<br />')
    .replace(/<br\s*\/?>Sell Price:.*?(?=<\/td>)/is, '');
}

function guildRankOrderIndex(rankName: string): number {
  const normalizedRankName = rankName.trim().toLocaleLowerCase();
  const rankIndex = LEGACY_GUILD_RANK_ORDER.findIndex(
    (rank) => rank.toLocaleLowerCase() === normalizedRankName
  );

  return rankIndex === -1 ? LEGACY_GUILD_RANK_ORDER.length : rankIndex;
}

function sortValue(
  player: GuildAnalysisPlayer,
  column: SortColumn,
  rankOrder: ReadonlyMap<string, number>
): string | number | null {
  switch (column) {
    case 'name':
      return player.name;
    case 'guildRankName':
      if (Number.isInteger(player.guildRank)) {
        return player.guildRank as number;
      }

      if (!player.guildRankName) {
        return null;
      }

      return rankOrder.get(
        player.guildRankName.trim().toLocaleLowerCase()
      ) ?? guildRankOrderIndex(player.guildRankName);
    default:
      return player[column] ?? null;
  }
}
