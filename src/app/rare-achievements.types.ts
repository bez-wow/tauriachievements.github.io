export interface RareAchievementDefinition {
  id: number;
  name: string;
}

export interface RareAchievementOwnership {
  id: number;
  obtainedAt: string | null;
}

export interface RareAchievementSummary {
  gladiatorTitleCount: number;
  gladiatorMountCount: number;
  ratedBattlegroundHeroCount: number;
  realmFirstCount: number;
}

export interface RareAchievementCharacter {
  name: string;
  realm: string;
  race: number;
  class: number;
  guild: string;
  achievements: RareAchievementOwnership[];
}

export interface RareAchievementsDataset {
  generatedAt: string;
  achievements: RareAchievementDefinition[];
  characters: RareAchievementCharacter[];
}
