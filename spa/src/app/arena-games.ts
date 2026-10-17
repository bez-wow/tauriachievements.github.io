export type ArenaBracket = '2v2' | '3v3';
export const ARENA_BRACKETS: readonly ArenaBracket[] = ['2v2', '3v3'];

/** The bracket a `?bracket=` value asks for; 2v2 for anything else. */
export function parseArenaBracket(value: string | null): ArenaBracket {
  return ARENA_BRACKETS.find(bracket => bracket === value) ?? '2v2';
}

/** The data file BattlegroundCollector (RatedArenaGameCounter) writes for a bracket. */
export function getArenaGamesFile(bracket: ArenaBracket): string {
  return `rated-${bracket}-arena-games.json`;
}

/** One character's rated season in one bracket, as BattlegroundCollector writes it. */
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

/** A season title, given to the best-rated active players. */
export interface ArenaTitle {
  readonly name: string;
  /** For CSS classes: `tier-season-gladiator`. */
  readonly slug: string;
  /**
   * The share of the active players, best rating first, down to the end of this title (the
   * better titles included), in per mille so the maths stays exact: 6 is the top 0.6%.
   */
  readonly topPerMille: number;
}

function title(name: string, topPerMille: number): ArenaTitle {
  return { name, slug: name.toLowerCase().replace(/\s+/g, '-'), topPerMille };
}

/** Each bracket's titles, best first. */
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

/** "0.6%", "3%", "35%". */
export function formatTitleShare(arenaTitle: ArenaTitle): string {
  return `${arenaTitle.topPerMille / 10}%`;
}

export interface TitleCutoff {
  readonly title: ArenaTitle;
  /** Places from the top down to the end of this title, the better titles' places included. */
  readonly places: number;
  /**
   * The lowest rating that earns this title; everyone on it, ties included, and below the
   * better title's cutoff has it. Undefined while the title has no place of its own: its share,
   * rounded up, is no more than the better titles already cover.
   */
  readonly rating: number | undefined;
}

/**
 * Where each title's line falls among the active players. A title covers its share rounded up,
 * the server's rule: any part of a place counts as a whole one, so 1.01 places are 2.
 */
export function getTitleCutoffs(rows: readonly ArenaPlayerRow[], titles: readonly ArenaTitle[]): TitleCutoff[] {
  const ratings = rows.map(row => row.rating).sort((left, right) => right - left);
  let covered = 0;

  return titles.map(arenaTitle => {
    const places = Math.min(ratings.length, Math.ceil((ratings.length * arenaTitle.topPerMille) / 1000));
    const rating = places > covered ? ratings[places - 1] : undefined;
    covered = Math.max(covered, places);

    return { title: arenaTitle, places, rating };
  });
}

/** The best title a rating earns, if any. */
export function getTitle(rating: number, cutoffs: readonly TitleCutoff[]): TitleCutoff | undefined {
  return cutoffs.find(cutoff => cutoff.rating !== undefined && rating >= cutoff.rating);
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
