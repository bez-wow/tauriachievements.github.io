import { Player, PlayerRankingField } from './models/character.model';

/** A ladder is ordered by one of the build's rankings. */
export type LadderSort = PlayerRankingField;

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

/** A player as one row of the ladder table: the player plus what the row displays. */
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
