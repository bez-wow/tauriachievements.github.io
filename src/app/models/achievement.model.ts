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
  honorableKills: number;
  faction: 'Horde' | 'Alliance'; 
}
