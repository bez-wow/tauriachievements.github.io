export interface Character {
  name: string;
  realm: string;
  realmApi: string;
  realmDisplay: string;
}

export type SerializedPlayerRecord = [
  name: string,
  race: number,
  gender: number,
  playerClass: number,
  realmIndex: number,
  guild: string,
  achievementPoints: number,
  honorableKills: number,
  factionIndex: number,
  achievementPointsDelta?: number,
  achievementRankDelta?: number,
  honorableKillsDelta?: number,
  honorableKillsRankDelta?: number,
  isNewCharacter?: boolean,
  appearanceCount?: number,
  appearanceCountDelta?: number,
  appearanceRankDelta?: number,
  characterAge?: string,
  achievementsTotal?: number,
  achievementsTotalDelta?: number,
  achievementsTotalRankDelta?: number,
  playedTime?: number,
  playedTimeDelta?: number,
  playedTimeRankDelta?: number
];

export interface PlayerSnapshot {
  v: 1 | 2;
  r: string[];
  f: string[];
  p: SerializedPlayerRecord[];
}

export interface Player {
  name: string;
  race: number;
  gender: number;
  class: number;
  realm: string;
  guild: string;
  achievementPoints: number;
  achievementPointsDelta: number;
  achievementRankDelta: number;
  honorableKills: number;
  honorableKillsDelta: number;
  honorableKillsRankDelta: number;
  appearanceCount: number;
  appearanceCountDelta: number;
  appearanceRankDelta: number;
  achievementsTotal: number;
  achievementsTotalDelta: number;
  achievementsTotalRankDelta: number;
  playedTime: number;
  playedTimeDelta: number;
  playedTimeRankDelta: number;
  characterAge: string;
  isNewCharacter: boolean;
  faction: string;
}

export interface Guild {
  guildName: string;
  realmApi: string;
  realmDisplay: string;
}
