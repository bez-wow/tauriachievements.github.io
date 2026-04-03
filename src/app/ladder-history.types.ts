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
  classId: number
];

export interface SerializedLadderHistorySnapshot {
  v: 1;
  g: string;
  c: number;
  s: string[];
  m: {
    a: SerializedLadderHistoryMover[];
    h: SerializedLadderHistoryMover[];
  };
}

export interface LadderHistoryMoverView {
  playerKey: string;
  name: string;
  realm: string;
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
}

export interface LadderHistoryData {
  generatedAt?: Date;
  snapshots: Date[];
  trackedPlayerCount: number;
  movers: {
    achievementPoints: LadderHistoryMoverView[];
    honorableKills: LadderHistoryMoverView[];
  };
}
