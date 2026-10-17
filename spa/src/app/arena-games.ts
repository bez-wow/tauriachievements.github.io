/** One character's rated 2v2 season, as BattlegroundCollector (RatedArenaGameCounter) writes it. */
export interface ArenaPlayer {
  guid: number;
  realm: string;
  name: string;
  class: number;
  games: number;
  wins: number;
  losses: number;
  /** Personal rating after the character's latest game. */
  rating: number;
}

export interface ArenaPlayerRow extends ArenaPlayer {
  /** Wins as a share of games, 0–1. */
  readonly winRate: number;
}

export type ArenaSortKey = 'games' | 'wins' | 'losses' | 'winRate' | 'rating';
export type SortDirection = 'asc' | 'desc';

/** A season reward needs this many wins. */
export const REWARD_MIN_WINS = 50;
/** Gladiator goes to the top 0.6% of the active players by rating; kept in per mille so the maths stays exact. */
export const GLADIATOR_TOP_PER_MILLE = 6;

export interface GladiatorCutoff {
  /** How many places the top 0.6% covers. */
  readonly places: number;
  /** The rating of the last place. Everyone on it or above is inside the cutoff, ties included. */
  readonly rating: number;
}

/**
 * The top 0.6% of the active players by rating: 0.6% of them rounded down, so every place is
 * really inside the top 0.6%, but always at least one place.
 */
export function getGladiatorCutoff(rows: readonly ArenaPlayerRow[]): GladiatorCutoff | undefined {
  if (rows.length === 0) {
    return undefined;
  }

  const places = Math.max(1, Math.floor((rows.length * GLADIATOR_TOP_PER_MILLE) / 1000));
  const ratings = rows.map(row => row.rating).sort((left, right) => right - left);

  return { places, rating: ratings[places - 1] };
}

/** The characters with at least `minGames` games, with their win rate. */
export function toArenaRows(players: readonly ArenaPlayer[], minGames: number): ArenaPlayerRow[] {
  return players
    .filter(player => player.games >= minGames)
    .map(player => ({ ...player, winRate: player.wins / player.games }));
}

/**
 * Sorts by one column. Ties fall back to most games, then name, whichever way the column
 * runs, so equal rows keep a steady order.
 */
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
