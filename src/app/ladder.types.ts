import { PlayerAchievement } from './models/achievement.model';

export type LadderSort = 'achievementPoints' | 'honorableKills';

export interface LadderFilterState {
  sort: LadderSort;
  realm?: string;
  faction?: string;
  playerClass?: number;
  pageSize: number;
  search: string;
}

export interface HighlightPart {
  text: string;
  isMatch: boolean;
}

export interface LadderPlayerView extends PlayerAchievement {
  nameParts: HighlightPart[];
  guildParts: HighlightPart[];
  gladiatorTitleCount: number;
  gladiatorMountCount: number;
  ratedBattlegroundHeroCount: number;
  realmFirstCount: number;
  isNewRareAchievementCharacter: boolean;
  rareAchievementSummaryLabel?: string;
}
