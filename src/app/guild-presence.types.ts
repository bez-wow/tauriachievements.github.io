export type GuildPresenceMetric = 'achievementPoints' | 'honorableKills';
export type GuildPresenceFaction = 'Alliance' | 'Horde' | 'Mixed';

export interface GuildPresenceRankingEntry {
  rank: number;
  key: string;
  guild: string;
  realm: string;
  faction: GuildPresenceFaction;
  playerCount: number;
  topMemberName: string;
  topMemberMetricValue: number;
}

export interface GuildPresenceData {
  achievementLeaderboardSize: number;
  honorableKillLeaderboardSize: number;
  achievementGuilds: GuildPresenceRankingEntry[];
  honorableKillGuilds: GuildPresenceRankingEntry[];
}
