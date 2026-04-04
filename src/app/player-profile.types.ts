export type SerializedPlayerProfileSeries = number[];

export type SerializedPlayerProfileRecord = [
  playerKey: string,
  firstSeenIndex: number,
  lastSeenIndex: number,
  bestAchievementRank: number,
  bestHonorableKillRank: number,
  achievementPointsSeries: SerializedPlayerProfileSeries,
  honorableKillsSeries: SerializedPlayerProfileSeries
];

export interface SerializedPlayerProfileBucket {
  v: 1;
  p: SerializedPlayerProfileRecord[];
}

export interface SerializedPlayerProfileMeta {
  v: 1;
  g: string;
  b: number;
  s: string[];
}

export interface PlayerProfileHistoryData {
  playerKey: string;
  generatedAt?: Date;
  snapshots: Date[];
  firstSeen?: Date;
  lastSeen?: Date;
  bestAchievementRank?: number;
  bestHonorableKillRank?: number;
  achievementPointsSeries: Array<number | null>;
  honorableKillsSeries: Array<number | null>;
  trackedSnapshotCount: number;
}
