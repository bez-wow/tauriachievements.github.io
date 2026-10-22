import { Player, PlayerRankingField } from '../../players/character.model';

export type LadderSort = PlayerRankingField;

export interface LadderFilterState {
  sort: LadderSort;
  realm?: string;
  faction?: string;
  playerClass?: number;
  pageSize: number;
  search: string;
}

export interface LadderRow {
  player: Player;
  rank: number;
}

export interface HighlightPart {
  text: string;
  isMatch: boolean;
}

export interface LadderPlayerView extends Player {
  rank: number;
  raceIcon: string;
  classIcon: string;
  nameParts: HighlightPart[];
  guildParts: HighlightPart[];
  gladiatorTitleCount: number;
  gladiatorMountCount: number;
  ratedBattlegroundHeroCount: number;
  realmFirstCount: number;
  isNewRareAchievementCharacter: boolean;
  rareAchievementSummaryLabel?: string;
}
