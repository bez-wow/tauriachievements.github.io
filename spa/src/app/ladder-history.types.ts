export type SerializedLadderHistoryMover = [
  playerKey: string,
  delta: number,
  previousRank: number,
  currentRank: number,
  achievementPointsDelta: number,
  honorableKillsDelta: number,
  previousAchievementPoints: number,
  currentAchievementPoints: number,
  previousHonorableKills: number,
  currentHonorableKills: number,
  race: number,
  gender: number,
  classId: number,
  guild?: string,
  appearanceCountDelta?: number,
  previousAppearanceCount?: number,
  currentAppearanceCount?: number,
  playedTimeDelta?: number,
  previousPlayedTime?: number,
  currentPlayedTime?: number
];

export interface SerializedLadderHistorySnapshot {
  v: number;
  g: string;
  s: string[];
  m: {
    a: SerializedLadderHistoryMover[];
    h: SerializedLadderHistoryMover[];
    t?: SerializedLadderHistoryMover[];
    p?: SerializedLadderHistoryMover[];
  };
}

export interface LadderHistoryMoverView {
  playerKey: string;
  name: string;
  realm: string;
  guild: string;
  race: number;
  gender: number;
  classId: number;
  rankDelta: number;
  previousRank: number;
  currentRank: number;
  achievementPointsDelta: number;
  honorableKillsDelta: number;
  previousAchievementPoints: number;
  currentAchievementPoints: number;
  previousHonorableKills: number;
  currentHonorableKills: number;
  appearanceCountDelta: number;
  previousAppearanceCount: number;
  currentAppearanceCount: number;
  playedTimeDelta: number;
  previousPlayedTime: number;
  currentPlayedTime: number;
}

export interface LadderHistoryData {
  generatedAt?: Date;
  snapshots: Date[];
  movers: {
    achievementPoints: LadderHistoryMoverView[];
    honorableKills: LadderHistoryMoverView[];
    playedTime: LadderHistoryMoverView[];
    appearanceCount: LadderHistoryMoverView[];
  };
}
