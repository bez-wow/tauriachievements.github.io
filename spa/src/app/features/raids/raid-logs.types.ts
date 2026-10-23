import { Role } from '../../game/wow';

export interface RaidDifficultyEntry {
  id: number;
  slug: string;
  name: string;
  shortName: string;
  kills: number;
}

export interface RaidBossEntry {
  id: number;
  slug: string;
  name: string;
}

export interface RaidSpecEntry {
  id: number;
  class: number;
  name: string;
  role: Role;
}

export type RaidGuildEntry = [name: string, realm: string, faction: number, id: number];

export type RaidIndexLogEntry = [
  realm: string,
  logId: number,
  boss: number,
  difficulty: number,
  killedAt: number,
  fightMs: number,
  guild: number,
  faction: number,
  wipes: number,
  deaths: number,
  members: number
];

export type RaidPerformerEntry = [
  name: string,
  realm: string,
  classId: number,
  specId: number,
  perSecond: number,
  logRealm: string,
  logId: number
];

export interface RaidTopEntry {
  boss: string;
  difficulty: string;
  dps: RaidPerformerEntry | null;
  hps: RaidPerformerEntry | null;
}

export type RaidItemEntry = [id: number, name: string, quality: number, icon: string];

export interface RaidLogsIndexFile {
  version: number;
  generatedAt: string;
  previousGeneratedAt?: string;
  raid: { id: number; slug: string; name: string };
  difficulties: RaidDifficultyEntry[];
  bosses: RaidBossEntry[];
  specs: RaidSpecEntry[];
  guilds: RaidGuildEntry[];
  formerCharacters?: RaidFormerCharactersEntry[];
  logs: RaidIndexLogEntry[];
  newLogs?: Array<[realm: string, logId: number]>;
  top: RaidTopEntry[];
  items: RaidItemEntry[];
}

export type RaidFormerCharactersEntry = [name: string, realm: string, classId: number, formerClassIds: number[]];

export type RaidPlayerEntry = [name: string, realm: string, classId: number, race: number, gender: number, guild: string, former?: 1];

export type RaidMemberEntry = [
  player: number,
  spec: number,
  itemLevel: number,
  damage: number,
  healing: number,
  absorbs: number,
  overhealing: number,
  damageTaken: number,
  interrupts: number,
  dispels: number,
  talents?: string,
  trinkets?: number[]
];

export type RaidTrinketEntry = [id: number, itemLevel: number, name: string, quality: number, icon: string];

export type RaidTalentEntry = [spellId: number, name: string, icon: string];

export interface RaidTalentsFile {
  version: number;
  specs: Array<[specId: number, tiers: Array<Array<RaidTalentEntry | null>>]>;
}

export type RaidTalentTooltipEntry = [spellId: number, details: string[], description: string];

export interface RaidTalentTooltipsFile {
  version: number;
  spells: RaidTalentTooltipEntry[];
}

export type RaidBossLogEntry = [
  realm: string,
  logId: number,
  killedAt: number,
  fightMs: number,
  guild: number,
  faction: number,
  wipes: number,
  deaths: number,
  resurrects: number,
  members: RaidMemberEntry[],
  items: number[]
];

export interface RaidGendersFile {
  v: number;
  female: Record<string, string[]>;
  male: Record<string, string[]>;
}

export interface RaidBossFile {
  version: number;
  boss: string;
  difficulty: string;
  guilds: RaidGuildEntry[];
  players: RaidPlayerEntry[];
  trinkets?: RaidTrinketEntry[];
  logs: RaidBossLogEntry[];
}

export interface RaidDifficulty extends RaidDifficultyEntry {}

export interface RaidBoss {
  id: number;
  slug: string;
  name: string;
  shortName: string;
  index: number;
  portrait: string;
}

export interface RaidSpec {
  id: number;
  classId: number;
  name: string;
  role: Role;
  icon?: string;
}

export interface RaidGuild {
  name: string;
  realm: string;
  faction: number;
  id: number;
}

export interface RaidPerformer {
  name: string;
  realm: string;
  classId: number;
  spec?: RaidSpec;
  perSecond: number;
  logRealm: string;
  logId: number;
}

export interface RaidItem {
  id: number;
  name: string;
  quality: number;
  icon: string;
}

export interface RaidTrinket extends RaidItem {
  itemLevel: number;
}

export interface RaidTalent {
  id: number;
  name: string;
  icon: string;
}

export type RaidTalentTable = ReadonlyMap<number, ReadonlyArray<ReadonlyArray<RaidTalent | undefined>>>;

export interface RaidTalentTooltip {
  details: string;
  description: string;
}

export type RaidTalentTooltips = ReadonlyMap<number, RaidTalentTooltip>;

export interface RaidKill {
  realm: string;
  logId: number;
  boss: RaidBoss;
  difficulty: RaidDifficulty;
  killedAt: number;
  fightMs: number;
  guild?: RaidGuild;
  faction: number;
  wipes: number;
  deaths: number;
  memberCount: number;
}

export interface RaidCharacter {
  name: string;
  realm: string;
  classId: number;
  race: number;
  gender: number;
  guild: string;
  former?: boolean;
}

export interface RaidMember {
  character: RaidCharacter;
  spec?: RaidSpec;
  itemLevel: number;
  damage: number;
  healing: number;
  absorbs: number;
  overhealing: number;
  damageTaken: number;
  interrupts: number;
  dispels: number;
  dps: number;
  hps: number;
  talents: string;
  trinkets: RaidTrinket[];
}

export interface RaidKillDetails extends Omit<RaidKill, 'memberCount'> {
  resurrects: number;
  members: RaidMember[];
  items: number[];
}

export interface RaidLogsIndex {
  generatedAt?: Date;
  previousGeneratedAt?: Date;
  newLogs: ReadonlySet<string>;
  raid: { id: number; slug: string; name: string };
  difficulties: RaidDifficulty[];
  bosses: RaidBoss[];
  specs: ReadonlyMap<number, RaidSpec>;
  kills: RaidKill[];
  items: ReadonlyMap<number, RaidItem>;
  top: ReadonlyMap<string, { dps?: RaidPerformer; hps?: RaidPerformer }>;
  formerCharacters: ReadonlyMap<string, RaidCharacterClasses>;
}

export interface RaidCharacterClasses {
  classId: number;
  formerClassIds: readonly number[];
}
