export type ArenaBracket = '2v2' | '3v3';
export const ARENA_BRACKETS: readonly ArenaBracket[] = ['2v2', '3v3'];

export function parseArenaBracket(value: string | null): ArenaBracket {
  return ARENA_BRACKETS.find(bracket => bracket === value) ?? '2v2';
}

export function getArenaGamesFile(bracket: ArenaBracket): string {
  return `rated-${bracket}-arena-games.json`;
}

export interface ArenaPlayer {
  guid: number;
  realm: string;
  name: string;
  class: number;
  games: number;
  wins: number;
  losses: number;
  rating: number;
}

export interface ArenaPlayerRow extends ArenaPlayer {
  readonly winRate: number;
}

export type ArenaSortKey = 'games' | 'wins' | 'losses' | 'winRate' | 'rating';
export type SortDirection = 'asc' | 'desc';

export const REWARD_MIN_WINS = 50;

export interface ArenaTitle {
  readonly name: string;
  readonly slug: string;
  readonly topPerMille: number;
}

function title(name: string, topPerMille: number): ArenaTitle {
  return { name, slug: name.toLowerCase().replace(/\s+/g, '-'), topPerMille };
}

export const ARENA_TITLES: Readonly<Record<ArenaBracket, readonly ArenaTitle[]>> = {
  '2v2': [title('Gladiator', 6), title('Duelist', 30), title('Rival', 100), title('Challenger', 350)],
  '3v3': [
    title('Season Gladiator', 5),
    title('Gladiator', 30),
    title('Duelist', 100),
    title('Rival', 350),
    title('Challenger', 450)
  ]
};

export function formatTitleShare(arenaTitle: ArenaTitle): string {
  return `${arenaTitle.topPerMille / 10}%`;
}

export interface TitleCutoff {
  readonly title: ArenaTitle;
  readonly places: number;
  readonly rating: number | undefined;
  readonly ties: number;
}

export function getTitleCutoffs(rows: readonly ArenaPlayerRow[], titles: readonly ArenaTitle[]): TitleCutoff[] {
  const ratings = rows.map(row => row.rating).sort((left, right) => right - left);
  const placeRatings = [...new Set(ratings)];
  let coveredPlaces = 0;
  let coveredPlayers = 0;

  return titles.map(arenaTitle => {
    const places = Math.min(ratings.length, Math.ceil((ratings.length * arenaTitle.topPerMille) / 1000));
    const reached = Math.min(places, placeRatings.length);
    if (reached <= coveredPlaces) {
      return { title: arenaTitle, places, rating: undefined, ties: 0 };
    }

    const rating = placeRatings[reached - 1];
    const players = ratings.filter(other => other >= rating).length;
    const ties = (players - coveredPlayers) - (reached - coveredPlaces);
    coveredPlaces = reached;
    coveredPlayers = players;

    return { title: arenaTitle, places, rating, ties };
  });
}

export function getTitle(rating: number, cutoffs: readonly TitleCutoff[]): TitleCutoff | undefined {
  return cutoffs.find(cutoff => cutoff.rating !== undefined && rating >= cutoff.rating);
}

export function toArenaRows(players: readonly ArenaPlayer[], minGames: number): ArenaPlayerRow[] {
  return players
    .filter(player => player.games >= minGames)
    .map(player => ({ ...player, winRate: player.wins / player.games }));
}

export function sortArenaRows(
  rows: readonly ArenaPlayerRow[],
  key: ArenaSortKey,
  direction: SortDirection
): ArenaPlayerRow[] {
  const sign = direction === 'asc' ? 1 : -1;

  return [...rows].sort((left, right) =>
    sign * (left[key] - right[key])
    || right.games - left.games
    || left.name.localeCompare(right.name)
  );
}
