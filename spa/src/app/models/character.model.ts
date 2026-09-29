export type Faction = 'Alliance' | 'Horde' | 'Neutral';

/**
 * The one shape of a player in the app. Every page and view works with this type, and
 * view models extend it (see LadderPlayerView) instead of copying its fields.
 */
export interface Player {
  name: string;
  race: number;
  gender: number;
  class: number;
  realm: string;
  guild: string;
  faction: Faction;
  achievementPoints: number;
  honorableKills: number;
  appearanceCount: number;
  achievementsTotal: number;
  playedTime: number;
  ilvl: number;
  /** Days since 1970-01-01 (UTC) when the character earned "Level 10"; 0 when unknown. */
  level10Day: number;
  /** First seen in this scan: no earlier character had the same name and class. */
  isNewCharacter: boolean;
  achievementPointsDelta: number;
  achievementRankDelta: number;
  honorableKillsDelta: number;
  honorableKillsRankDelta: number;
  appearanceCountDelta: number;
  appearanceRankDelta: number;
  achievementsTotalDelta: number;
  achievementsTotalRankDelta: number;
  playedTimeDelta: number;
  playedTimeRankDelta: number;
}

/** The numeric fields a ranking can order players by. */
export type PlayerRankingField =
  | 'achievementPoints'
  | 'honorableKills'
  | 'appearanceCount'
  | 'achievementsTotal'
  | 'playedTime'
  | 'ilvl';

/**
 * How each leaderboard orders players: fields compared highest-first, with remaining ties
 * kept in the snapshot's row order. Defined once by the build (scripts/player-ranking.js)
 * and shipped inside the snapshot.
 */
export type PlayerRankings = Readonly<Record<PlayerRankingField, readonly PlayerRankingField[]>>;

/**
 * A players file as written by scripts/generate-player-snapshot.js. Rows are in
 * achievement-point rank order and are read by column name, never by position.
 */
export interface PlayerSnapshot {
  v: number;
  /** Column names, one per value in each row of `p`. */
  c: string[];
  /** Ranking rules. */
  k: PlayerRankings;
  /** Realm names; the `realm` column holds an index into this list. */
  r: string[];
  /** Faction names; the `faction` column holds an index into this list. */
  f: string[];
  /** Total players on the server; larger than `p.length` in the head snapshot. */
  t: number;
  p: (string | number)[][];
}
