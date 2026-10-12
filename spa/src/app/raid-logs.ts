import { formatClock } from './mythic-plus';
import { LEGION_SPECS } from './mythic-plus-stats';

/*
 * The /raid-logs pages: every boss kill of the current raid, from the files RaidLogExporter
 * writes (contract: api/RaidLogExporter/RaidLogFileWriter.cs). This file holds the file format,
 * its decoding, and the pure rankings the pages share.
 */

export const RAID_LOGS_DATA_DIR = 'raid-log-data';

export type RaidRole = 'tank' | 'healer' | 'dps';
export type RaidMetric = 'dps' | 'hps';

// --- File format ------------------------------------------------------------------------

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
  role: RaidRole;
}

/** `[name, realm, faction, guildId]`; an empty name is a guild that could not be named. */
export type RaidGuildEntry = [name: string, realm: string, faction: number, id: number];

/** `[realm, logId, boss, difficultyId, killedAtUnix, fightMs, guild, faction, wipes, deaths, members]` */
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

/** `[name, realm, class, spec, perSecond, logRealm, logId]` */
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

/** `[id, name, quality, icon]` */
export type RaidItemEntry = [id: number, name: string, quality: number, icon: string];

export interface RaidLogsIndexFile {
  version: number;
  generatedAt: string;
  raid: { id: number; slug: string; name: string };
  difficulties: RaidDifficultyEntry[];
  bosses: RaidBossEntry[];
  specs: RaidSpecEntry[];
  guilds: RaidGuildEntry[];
  logs: RaidIndexLogEntry[];
  top: RaidTopEntry[];
  items: RaidItemEntry[];
}

/** `[name, realm, class, race, gender, guild]` */
export type RaidPlayerEntry = [name: string, realm: string, classId: number, race: number, gender: number, guild: string];

/** `[player, spec, ilvl, damage, healing, absorbs, overhealing, damageTaken, interrupts, dispels]` */
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
  dispels: number
];

/** `[realm, logId, killedAtUnix, fightMs, guild, faction, wipes, deaths, resurrects, members, items]` */
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

export interface RaidBossFile {
  version: number;
  boss: string;
  difficulty: string;
  guilds: RaidGuildEntry[];
  players: RaidPlayerEntry[];
  logs: RaidBossLogEntry[];
}

// --- Decoded ----------------------------------------------------------------------------

export interface RaidDifficulty extends RaidDifficultyEntry {}

export interface RaidBoss {
  id: number;
  slug: string;
  name: string;
  /** "Il'gynoth" for "Il'gynoth, The Heart of Corruption". */
  shortName: string;
  /** Position in the raid, from 0. */
  index: number;
  portrait: string;
}

export interface RaidSpec {
  id: number;
  classId: number;
  name: string;
  role: RaidRole;
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

/** A kill as the index lists it. */
export interface RaidKill {
  realm: string;
  logId: number;
  boss: RaidBoss;
  difficulty: RaidDifficulty;
  /** Milliseconds since the epoch. */
  killedAt: number;
  fightMs: number;
  /** Undefined for a pickup group. A guild that could not be named has an empty name. */
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
}

export interface RaidMember {
  /** One object per character per boss file, so it can key maps. */
  character: RaidCharacter;
  /** Undefined for the odd member whose spec belongs to another class. */
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
  /** Healing plus absorbs, per second. */
  hps: number;
}

/** A kill with everything the boss file knows about it. */
export interface RaidKillDetails extends Omit<RaidKill, 'memberCount'> {
  resurrects: number;
  members: RaidMember[];
  items: number[];
}

export interface RaidLogsIndex {
  generatedAt?: Date;
  raid: { id: number; slug: string; name: string };
  difficulties: RaidDifficulty[];
  bosses: RaidBoss[];
  specs: ReadonlyMap<number, RaidSpec>;
  /** Every kill, oldest first. */
  kills: RaidKill[];
  items: ReadonlyMap<number, RaidItem>;
  top: ReadonlyMap<string, { dps?: RaidPerformer; hps?: RaidPerformer }>;
}

// --- Static lookups ---------------------------------------------------------------------

const BOSS_PORTRAITS: Readonly<Record<string, string>> = {
  nythendra: 'assets/emerald-nightmare/01-nythendra.png',
  ilgynoth: "assets/emerald-nightmare/02-il'gunoth.png",
  'elerethe-renferal': 'assets/emerald-nightmare/03-elerethe.png',
  ursoc: 'assets/emerald-nightmare/04-ursoc.png',
  'dragons-of-nightmare': 'assets/emerald-nightmare/05-dragons-of-nightmare.png',
  cenarius: 'assets/emerald-nightmare/06-cenarius.png',
  xavius: 'assets/emerald-nightmare/07-xavious.png'
};

export const FACTION_NAMES: Readonly<Record<number, string>> = { 0: 'Alliance', 1: 'Horde' };

export const ROLE_NAMES: Readonly<Record<RaidRole, string>> = { tank: 'Tank', healer: 'Healer', dps: 'Damage' };

/** WoW's item quality colours, poor to heirloom. */
export const ITEM_QUALITY_COLORS: ReadonlyArray<string> = [
  '#9d9d9d', '#ffffff', '#1eff00', '#0070dd', '#a335ee', '#ff8000', '#e6cc80', '#00ccff'
];

const ITEM_ICON_BASE = 'https://legion-static.tauri.hu/images/icons/large/';

export function itemIconUrl(icon: string): string {
  return `${ITEM_ICON_BASE}${icon || 'inv_misc_questionmark'}.png`;
}

export function itemUrl(itemId: number): string {
  return `https://legion-shoot.tauri.hu/?item=${itemId}`;
}

// --- Decoding ---------------------------------------------------------------------------

export function decodeIndex(file: RaidLogsIndexFile): RaidLogsIndex {
  const generatedAt = new Date(file.generatedAt);
  const difficulties = file.difficulties.map(difficulty => ({ ...difficulty }));
  const difficultiesById = new Map(difficulties.map(difficulty => [difficulty.id, difficulty]));
  const bosses = file.bosses.map((boss, index): RaidBoss => ({
    id: boss.id,
    slug: boss.slug,
    name: boss.name,
    shortName: boss.name.split(',')[0].trim(),
    index,
    portrait: BOSS_PORTRAITS[boss.slug] ?? ''
  }));
  const specs = decodeSpecs(file.specs);
  const guilds = file.guilds.map(decodeGuild);

  const kills: RaidKill[] = [];
  for (const [realm, logId, boss, difficultyId, killedAt, fightMs, guild, faction, wipes, deaths, members] of file.logs) {
    const difficulty = difficultiesById.get(difficultyId);
    if (!bosses[boss] || !difficulty) {
      continue;
    }

    kills.push({
      realm,
      logId,
      boss: bosses[boss],
      difficulty,
      killedAt: killedAt * 1000,
      fightMs,
      guild: guilds[guild],
      faction,
      wipes,
      deaths,
      memberCount: members
    });
  }

  const top = new Map<string, { dps?: RaidPerformer; hps?: RaidPerformer }>();
  for (const entry of file.top) {
    top.set(encounterKey(entry.boss, entry.difficulty), {
      dps: entry.dps ? decodePerformer(entry.dps, specs) : undefined,
      hps: entry.hps ? decodePerformer(entry.hps, specs) : undefined
    });
  }

  return {
    generatedAt: Number.isNaN(generatedAt.getTime()) ? undefined : generatedAt,
    raid: file.raid,
    difficulties,
    bosses,
    specs,
    kills,
    items: new Map(file.items.map(([id, name, quality, icon]) => [id, { id, name, quality, icon }])),
    top
  };
}

/** Decodes a boss file. Each character becomes one object, shared by all of its kills. */
export function decodeBossFile(
  file: RaidBossFile,
  boss: RaidBoss,
  difficulty: RaidDifficulty,
  specs: ReadonlyMap<number, RaidSpec>
): RaidKillDetails[] {
  const guilds = file.guilds.map(decodeGuild);
  const characters = file.players.map(([name, realm, classId, race, gender, guild]): RaidCharacter =>
    ({ name, realm, classId, race, gender, guild }));

  return file.logs.map(([realm, logId, killedAt, fightMs, guild, faction, wipes, deaths, resurrects, members, items]) => {
    const seconds = fightMs > 0 ? fightMs / 1000 : 0;
    return {
      realm,
      logId,
      boss,
      difficulty,
      killedAt: killedAt * 1000,
      fightMs,
      guild: guilds[guild],
      faction,
      wipes,
      deaths,
      resurrects,
      items,
      members: members.flatMap(([player, spec, itemLevel, damage, healing, absorbs, overhealing, damageTaken, interrupts, dispels]) => {
        const character = characters[player];
        return character ? [{
          character,
          spec: specs.get(spec),
          itemLevel,
          damage,
          healing,
          absorbs,
          overhealing,
          damageTaken,
          interrupts,
          dispels,
          dps: seconds ? damage / seconds : 0,
          hps: seconds ? (healing + absorbs) / seconds : 0
        }] : [];
      })
    };
  });
}

export function bossFilePath(boss: Pick<RaidBoss, 'slug'>, difficulty: Pick<RaidDifficulty, 'slug'>): string {
  return `${RAID_LOGS_DATA_DIR}/${boss.slug}-${difficulty.slug}.json`;
}

export function encounterKey(bossSlug: string, difficultySlug: string): string {
  return `${bossSlug}|${difficultySlug}`;
}

function decodeSpecs(entries: readonly RaidSpecEntry[]): Map<number, RaidSpec> {
  const icons = new Map(LEGION_SPECS.map(spec => [`${spec.classId}|${spec.spec}`, spec.icon]));
  return new Map(entries.map(entry => [entry.id, {
    id: entry.id,
    classId: entry.class,
    name: entry.name,
    role: entry.role,
    icon: icons.get(`${entry.class}|${entry.name}`)
  }]));
}

function decodeGuild([name, realm, faction, id]: RaidGuildEntry): RaidGuild {
  return { name, realm, faction, id };
}

function decodePerformer(
  [name, realm, classId, specId, perSecond, logRealm, logId]: RaidPerformerEntry,
  specs: ReadonlyMap<number, RaidSpec>
): RaidPerformer {
  return { name, realm, classId, spec: specs.get(specId), perSecond, logRealm, logId };
}

// --- Rankings ---------------------------------------------------------------------------

export interface RankingFilter {
  classId?: number;
  specId?: number;
  realm?: string;
  role?: RaidRole;
}

export interface RankedPerformance {
  rank: number;
  member: RaidMember;
  kill: RaidKillDetails;
  value: number;
}

/** Who a metric ranks: healers by healing, everyone else by damage. */
export function countsFor(metric: RaidMetric, spec: RaidSpec | undefined): boolean {
  if (!spec) {
    return false;
  }

  return metric === 'hps' ? spec.role === 'healer' : spec.role !== 'healer';
}

/**
 * Each character's best kill by the metric, best first. With a spec filter a character is ranked
 * on kills played as that spec only. Ties keep the earlier kill first.
 */
export function rankCharacters(
  kills: readonly RaidKillDetails[],
  metric: RaidMetric,
  filter: RankingFilter = {}
): RankedPerformance[] {
  const best = new Map<RaidCharacter, Omit<RankedPerformance, 'rank'>>();

  for (const kill of kills) {
    for (const member of kill.members) {
      if (!countsFor(metric, member.spec) || !matchesFilter(member, filter)) {
        continue;
      }

      const value = member[metric];
      const known = best.get(member.character);
      if (!known || value > known.value || (value === known.value && kill.killedAt < known.kill.killedAt)) {
        best.set(member.character, { member, kill, value });
      }
    }
  }

  return [...best.values()]
    .sort((a, b) => b.value - a.value || a.kill.killedAt - b.kill.killedAt)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function matchesFilter(member: RaidMember, filter: RankingFilter): boolean {
  return (filter.classId === undefined || member.character.classId === filter.classId)
    && (filter.specId === undefined || member.spec?.id === filter.specId)
    && (filter.role === undefined || member.spec?.role === filter.role)
    && (filter.realm === undefined || realmSlug(member.character.realm) === filter.realm);
}

/** Shortest fight first; the earlier kill wins a tie. */
export function fastestKills<T extends Pick<RaidKill, 'fightMs' | 'killedAt'>>(kills: readonly T[]): T[] {
  return [...kills].sort((a, b) => a.fightMs - b.fightMs || a.killedAt - b.killedAt);
}

export function latestKills<T extends Pick<RaidKill, 'killedAt'>>(kills: readonly T[]): T[] {
  return [...kills].sort((a, b) => b.killedAt - a.killedAt);
}

export interface GuildProgress {
  rank: number;
  guild: RaidGuild;
  /** The guild's first kill of each boss, by boss index; undefined while it is alive. */
  firsts: Array<RaidKill | undefined>;
  killed: number;
  /** When the guild reached its current progress: its latest first kill. */
  progressedAt: number;
  kills: number;
}

/**
 * The guilds' progress on one difficulty: most bosses down first, then whoever got there first.
 * Pickup groups and guilds without a name don't take part. A guild is its name on its realm, so
 * a guild that was recreated under the same name keeps one row.
 */
export function guildProgression(
  kills: readonly RaidKill[],
  difficultyId: number,
  bossCount: number
): GuildProgress[] {
  const rows = new Map<string, Omit<GuildProgress, 'rank'>>();

  for (const kill of kills) {
    const guild = kill.guild;
    if (kill.difficulty.id !== difficultyId || !guild?.name) {
      continue;
    }

    const key = guildKey(guild);
    let row = rows.get(key);
    if (!row) {
      row = { guild, firsts: Array.from({ length: bossCount }, () => undefined), killed: 0, progressedAt: 0, kills: 0 };
      rows.set(key, row);
    }

    row.kills++;
    const first = row.firsts[kill.boss.index];
    if (!first || kill.killedAt < first.killedAt) {
      row.firsts[kill.boss.index] = kill;
    }
  }

  for (const row of rows.values()) {
    const firsts = row.firsts.filter((kill): kill is RaidKill => !!kill);
    row.killed = firsts.length;
    row.progressedAt = Math.max(0, ...firsts.map(kill => kill.killedAt));
  }

  return [...rows.values()]
    .sort((a, b) => b.killed - a.killed || a.progressedAt - b.progressedAt || a.guild.name.localeCompare(b.guild.name))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

/** The kill's place among the boss's kills on its difficulty by fight time, from 1. */
export function speedRank(kill: Pick<RaidKill, 'realm' | 'logId'>, kills: readonly RaidKill[]): number {
  const fastest = fastestKills(kills);
  return fastest.findIndex(other => other.realm === kill.realm && other.logId === kill.logId) + 1;
}

/**
 * The hardest difficulty with at least one kill, else the first listed. The overview and boss
 * pages open on it.
 */
export function defaultDifficulty(difficulties: readonly RaidDifficulty[]): RaidDifficulty | undefined {
  return [...difficulties].reverse().find(difficulty => difficulty.kills > 0) ?? difficulties[0];
}

// --- Identity and links -----------------------------------------------------------------

/** The realm as it appears in URLs: `evermoon`, `tauri`, `wod`. */
export function realmSlug(realm: string): string {
  return realm.toLowerCase();
}

export function guildKey(guild: Pick<RaidGuild, 'name' | 'realm'>): string {
  return `${realmSlug(guild.realm)}/${guild.name}`;
}

export function characterKey(character: Pick<RaidCharacter, 'name' | 'realm'>): string {
  return `${realmSlug(character.realm)}/${character.name}`;
}

export function logKey(kill: Pick<RaidKill, 'realm' | 'logId'>): string {
  return `${realmSlug(kill.realm)}/${kill.logId}`;
}

export function raidLogLink(kill: Pick<RaidKill, 'realm' | 'logId'>): Array<string | number> {
  return ['/raid-logs', 'log', realmSlug(kill.realm), kill.logId];
}

export function raidBossLink(boss: Pick<RaidBoss, 'slug'>): string[] {
  return ['/raid-logs', 'boss', boss.slug];
}

export function raidGuildLink(guild: Pick<RaidGuild, 'name' | 'realm'>): string[] {
  return ['/raid-logs', 'guild', realmSlug(guild.realm), guild.name];
}

export function raidCharacterLink(character: Pick<RaidCharacter, 'name' | 'realm'>): string[] {
  return ['/raid-logs', 'character', realmSlug(character.realm), character.name];
}

// --- Formatting -------------------------------------------------------------------------

/** `4:12`, or `1:02:05` past the hour. */
export function formatFightTime(milliseconds: number): string {
  return formatClock(Math.round(milliseconds / 1000));
}

/** `594.2k`, `1.24M`: a per-second figure in a table cell. */
export function formatPerSecond(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return String(Math.round(value));
}

/** `63.0M`, `850k`: a fight's total damage or healing. */
export function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return String(Math.round(value));
}

/** `12 min ago`, `5 h ago`, `3 d ago`. */
export function formatAgo(at: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
}

/** Whether a name contains the typed text, ignoring case and accents (`sosa` finds Sósa). */
export function nameMatches(name: string, query: string): boolean {
  const wanted = foldText(query.trim());
  return !wanted || foldText(name).includes(wanted);
}

function foldText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

export const RAID_PAGE_SIZE = 50;

export function pageCount(total: number, pageSize: number = RAID_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
