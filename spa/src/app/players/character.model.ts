export type Faction = 'Alliance' | 'Horde' | 'Neutral';

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
  level10Day: number;
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

export type PlayerRankingField =
  | 'achievementPoints'
  | 'honorableKills'
  | 'appearanceCount'
  | 'achievementsTotal'
  | 'playedTime'
  | 'ilvl';

export type PlayerRankings = Readonly<Record<PlayerRankingField, readonly PlayerRankingField[]>>;

export interface PlayerSnapshot {
  v: number;
  c: string[];
  k: PlayerRankings;
  r: string[];
  f: string[];
  t: number;
  p: (string | number)[][];
}
