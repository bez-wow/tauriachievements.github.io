export interface Character {
  name: string;
  realm: string;
  realmApi: string;
  realmDisplay: string;
}

export type SerializedPlayerRecord = [
  name: string,
  race: number,
  gender: number,
  playerClass: number,
  realmIndex: number,
  guild: string,
  achievementPoints: number,
  honorableKills: number,
  factionIndex: number
];

export interface PlayerSnapshot {
  v: 1;
  r: string[];
  f: string[];
  p: SerializedPlayerRecord[];
}

export interface TauriApiRequest {
  secret: string;
  url: string;
  params: {
    r: string;
    n: string;
  };
}

export interface TauriCharacterSheetResponse {
  response?: {
    race?: number;
    gender?: number;
    class?: number;
    pts?: number;
    playerHonorKills?: number;
    faction_string_class?: string;
    guildName?: string;
  };
}

export interface TauriGuildRosterResponse {
  response?: {
    members?: Array<{
      name?: string;
      level?: number;
    }>;
  };
}

export interface Player {
  name: string;
  race: number;
  gender: number;
  class: number;
  realm: string;
  guild: string;
  achievementPoints: number;
  honorableKills: number;
  faction: string;
}

export interface Guild {
  guildName: string;
  realmApi: string;
  realmDisplay: string;
}
