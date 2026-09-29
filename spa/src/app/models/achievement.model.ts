export interface PlayerAchievement {
  rank: number;
  name: string;
  realm: string;
  race: number;
  gender: number;
  raceIcon: string;
  classIcon: string;
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
  ilvl: number;
  characterAge: string;
  isNewCharacter: boolean;
  faction: 'Horde' | 'Alliance';
}
