import { getClassColor } from './class-colors';
import { CLASS_NAMES, formatClock } from './mythic-plus';
import { LEGION_SPECS, SpecDefinition, compareSpecLists } from './mythic-plus-stats';

/*
 * The /raid-logs pages: every boss kill of the current raid, from the files RaidLogExporter
 * writes (contract: api/RaidLogExporter/RaidLogFileWriter.cs). This file holds the file format,
 * its decoding, and the pure rankings the pages share.
 */

export const RAID_LOGS_DATA_DIR = 'raid-log-data';

/** Every spec's talent tiers, which members' `talents` columns pick from. */
export const RAID_TALENTS_PATH = `${RAID_LOGS_DATA_DIR}/talents.json`;

export const RAID_TALENT_TOOLTIPS_PATH = `${RAID_LOGS_DATA_DIR}/talent-tooltips.json`;

/** Written at build time by scripts/generate-raid-genders.js. */
export const RAID_GENDERS_PATH = 'assets/data/raid-genders.json';

export type RaidRole = 'tank' | 'healer' | 'dps';
export type RaidMetric = 'dps' | 'hps';
export type RoleFilter = RaidRole | 'all';

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
  /** The export the `newLogs` are new to; missing on a first export. */
  previousGeneratedAt?: string;
  raid: { id: number; slug: string; name: string };
  difficulties: RaidDifficultyEntry[];
  bosses: RaidBossEntry[];
  specs: RaidSpecEntry[];
  guilds: RaidGuildEntry[];
  logs: RaidIndexLogEntry[];
  /** `[realm, logId]`: the kills added since `previousGeneratedAt`. */
  newLogs?: Array<[realm: string, logId: number]>;
  top: RaidTopEntry[];
  items: RaidItemEntry[];
}

/** `[name, realm, class, race, gender, guild]` */
export type RaidPlayerEntry = [name: string, realm: string, classId: number, race: number, gender: number, guild: string];

/**
 * `[player, spec, ilvl, damage, healing, absorbs, overhealing, damageTaken, interrupts, dispels,
 * talents, [trinket, ...]]`. `talents` is the column picked on each tier, top to bottom: `0` to
 * `2` from the left, `.` for none; trinkets are positions in the file's `trinkets`. Files of
 * format version 1 stop after `dispels`.
 */
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

/** `[id, itemLevel, name, quality, icon]`: one item worn at one item level. */
export type RaidTrinketEntry = [id: number, itemLevel: number, name: string, quality: number, icon: string];

/** `[spellId, name, icon]` */
export type RaidTalentEntry = [spellId: number, name: string, icon: string];

/** Each spec's tiers, top to bottom, each with its choices left to right (null for none). */
export interface RaidTalentsFile {
  version: number;
  specs: Array<[specId: number, tiers: Array<Array<RaidTalentEntry | null>>]>;
}

export type RaidTalentTooltipEntry = [spellId: number, details: string[], description: string];

export interface RaidTalentTooltipsFile {
  version: number;
  spells: RaidTalentTooltipEntry[];
}

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

/**
 * The ladder's gender (Players.csv) for the raid characters whose gender the raid logs have
 * wrong; the API reports nearly everyone as male. Names by realm.
 */
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
  /** Missing in format version 1. */
  trinkets?: RaidTrinketEntry[];
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

export interface RaidTrinket extends RaidItem {
  itemLevel: number;
}

export interface RaidTalent {
  /** The spell, as TauriShoot's `?spell=` names it. */
  id: number;
  name: string;
  icon: string;
}

/** By spec id: the tiers top to bottom, each with its choices left to right. */
export type RaidTalentTable = ReadonlyMap<number, ReadonlyArray<ReadonlyArray<RaidTalent | undefined>>>;

export interface RaidTalentTooltip {
  details: string;
  description: string;
}

export type RaidTalentTooltips = ReadonlyMap<number, RaidTalentTooltip>;

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
  /** The column picked on each talent tier (see RaidMemberEntry); empty when unknown. */
  talents: string;
  /** None to two, shared by every member wearing the same item at the same level. */
  trinkets: RaidTrinket[];
}

/** A kill with everything the boss file knows about it. */
export interface RaidKillDetails extends Omit<RaidKill, 'memberCount'> {
  resurrects: number;
  members: RaidMember[];
  items: number[];
}

export interface RaidLogsIndex {
  generatedAt?: Date;
  /** The export before this one; undefined when there is nothing to compare with. */
  previousGeneratedAt?: Date;
  /** The kills added since `previousGeneratedAt`, by logKey. */
  newLogs: ReadonlySet<string>;
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

const BOSS_SHORT_NAMES: Readonly<Record<string, string>> = {
  'elerethe-renferal': 'Elerethe',
  'dragons-of-nightmare': 'Dragons'
};

export function bossShortName(boss: { slug: string; name: string }): string {
  return BOSS_SHORT_NAMES[boss.slug] ?? boss.name.split(',')[0].trim();
}

/**
 * The order the progress squares and the per-boss bars show the bosses in: the order raiders kill
 * them, not the Dungeon Journal's that the files use.
 */
const KILL_ORDER: ReadonlyArray<string> = ['nythendra', 'ursoc', 'dragons-of-nightmare', 'elerethe-renferal', 'ilgynoth', 'cenarius', 'xavius'];

/** The bosses in kill order. One the order doesn't name goes after them, in raid order. */
export function bossesInKillOrder<T extends Pick<RaidBoss, 'slug' | 'index'>>(bosses: readonly T[]): T[] {
  const place = (boss: T) => {
    const position = KILL_ORDER.indexOf(boss.slug);
    return position < 0 ? KILL_ORDER.length + boss.index : position;
  };
  return [...bosses].sort((a, b) => place(a) - place(b));
}

export const FACTION_NAMES: Readonly<Record<number, string>> = { 0: 'Alliance', 1: 'Horde' };

/** The realms the raid logs cover, for realm filters; `realmSlug` of one is its filter value. */
export const RAID_REALMS: ReadonlyArray<string> = ['Evermoon', 'Tauri', 'WoD'];

export const ROLE_NAMES: Readonly<Record<RaidRole, string>> = { tank: 'Tank', healer: 'Healer', dps: 'Damage' };

/** WoW's item quality colours, poor to heirloom. */
export const ITEM_QUALITY_COLORS: ReadonlyArray<string> = [
  '#9d9d9d', '#ffffff', '#1eff00', '#0070dd', '#a335ee', '#ff8000', '#e6cc80', '#00ccff'
];

const ICON_BASE = 'https://legion-static.tauri.hu/images/icons/';

/** TauriShoot's icons: medium is 36 px square, large 56. */
export function itemIconUrl(icon: string, size: 'medium' | 'large' = 'large'): string {
  return `${ICON_BASE}${size}/${icon || 'inv_misc_questionmark'}.png`;
}

/** For an icon shown about 22 px wide: the medium one, the large one on a sharper screen. */
export function iconSrcset(icon: string): string {
  return `${itemIconUrl(icon, 'medium')} 36w, ${itemIconUrl(icon)} 56w`;
}

export function itemUrl(itemId: number): string {
  return `https://legion-shoot.tauri.hu/?item=${itemId}`;
}

export function spellUrl(spellId: number): string {
  return `https://legion-shoot.tauri.hu/?spell=${spellId}`;
}

// --- Decoding ---------------------------------------------------------------------------

export function decodeIndex(file: RaidLogsIndexFile): RaidLogsIndex {
  const generatedAt = new Date(file.generatedAt);
  const previousGeneratedAt = new Date(file.previousGeneratedAt ?? NaN);
  const difficulties = file.difficulties.map(difficulty => ({ ...difficulty }));
  const difficultiesById = new Map(difficulties.map(difficulty => [difficulty.id, difficulty]));
  const bosses = file.bosses.map((boss, index): RaidBoss => ({
    id: boss.id,
    slug: boss.slug,
    name: boss.name,
    shortName: bossShortName(boss),
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

  const hasPrevious = !Number.isNaN(previousGeneratedAt.getTime());
  return {
    generatedAt: Number.isNaN(generatedAt.getTime()) ? undefined : generatedAt,
    previousGeneratedAt: hasPrevious ? previousGeneratedAt : undefined,
    newLogs: new Set(hasPrevious ? (file.newLogs ?? []).map(([realm, logId]) => logKey({ realm, logId })) : []),
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
  const trinkets = (file.trinkets ?? []).map(([id, itemLevel, name, quality, icon]): RaidTrinket =>
    ({ id, itemLevel, name, quality, icon }));

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
      members: members.flatMap(([player, spec, itemLevel, damage, healing, absorbs, overhealing, damageTaken, interrupts, dispels, talents, worn]) => {
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
          hps: seconds ? (healing + absorbs) / seconds : 0,
          talents: talents ?? '',
          trinkets: (worn ?? []).flatMap(position => trinkets[position] ?? [])
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

export function decodeTalents(file: RaidTalentsFile): RaidTalentTable {
  return new Map(file.specs.map(([specId, tiers]) => [
    specId,
    tiers.map(choices => choices.map(choice => choice ? { id: choice[0], name: choice[1], icon: choice[2] } : undefined))
  ]));
}

export function decodeTalentTooltips(file: RaidTalentTooltipsFile): RaidTalentTooltips {
  return new Map(file.spells.map(([spellId, details, description]) => [spellId, { details: details.join(' · '), description }]));
}

/**
 * The talent a member picked on each tier, top to bottom; undefined for a tier left empty or a
 * column the table doesn't have. Nothing when the log has no talents or the spec no table.
 */
export function memberTalents(member: Pick<RaidMember, 'spec' | 'talents'>, table: RaidTalentTable): Array<RaidTalent | undefined> {
  const tiers = member.spec ? table.get(member.spec.id) : undefined;
  if (!tiers || !member.talents) {
    return [];
  }

  return [...member.talents].map((column, tier) => tiers[tier]?.[Number(column)]);
}

/** The corrected gender, 0 male and 1 female, by characterKey. */
export function decodeGenders(file: RaidGendersFile): Map<string, number> {
  const genders = new Map<string, number>();
  for (const [gender, byRealm] of [[0, file.male], [1, file.female]] as const) {
    for (const [realm, names] of Object.entries(byRealm ?? {})) {
      for (const name of names) {
        genders.set(characterKey({ name, realm }), gender);
      }
    }
  }
  return genders;
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

export interface BossStanding {
  /** From 1; undefined while the character has no kill the ranking counts. */
  rank?: number;
  /** How many characters the ranking holds. */
  ranked: number;
  /** The character's best over the best in the ranking: 0 to 1. */
  relative: number;
}

/**
 * Where one character's best kill of a boss stands among the characters rankCharacters ranks
 * with the filter: their rank, out of how many, and their best over the ranking's best. Without
 * a filter the relative value is the one the character's score counts for the boss; with a class,
 * every number is among that class only.
 */
export function bossStanding(
  kills: readonly RaidKillDetails[],
  metric: RaidMetric,
  key: string,
  filter: RankingFilter = {}
): BossStanding {
  const ranking = rankCharacters(kills, metric, filter);
  const own = ranking.find(entry => characterKey(entry.member.character) === key);
  const top = ranking[0]?.value ?? 0;
  return { rank: own?.rank, ranked: ranking.length, relative: own && top > 0 ? own.value / top : 0 };
}

// --- Character score --------------------------------------------------------------------

/** The score of a character who did the most damage (or healing) on every boss. */
export const MAX_SCORE = 6969;

const ALLIANCE_RACES: ReadonlySet<number> = new Set([1, 3, 4, 7, 11, 22, 25]);
const HORDE_RACES: ReadonlySet<number> = new Set([2, 5, 6, 8, 9, 10, 26]);

/** 0 Alliance, 1 Horde; undefined for a race on neither side (a Pandaren still on the island). */
export function raceFaction(race: number): number | undefined {
  return ALLIANCE_RACES.has(race) ? 0 : HORDE_RACES.has(race) ? 1 : undefined;
}

interface Appearance {
  member: RaidMember;
  kill: RaidKillDetails;
}

/**
 * characterKey, worked out once per character object: scoring needs it for every member of every
 * kill, twice when the changes since the previous scan show, and the strings were most of its time.
 */
const characterKeys = new WeakMap<RaidCharacter, string>();

function cachedCharacterKey(character: RaidCharacter): string {
  let key = characterKeys.get(character);
  if (key === undefined) {
    key = characterKey(character);
    characterKeys.set(character, key);
  }
  return key;
}

export interface BossPerformance {
  boss: RaidBoss;
  /** The character's best kill of the boss by the metric; undefined while they have none. */
  best?: Appearance;
  value: number;
  /** The value over the best anyone did on the boss: 0 to 1. */
  relative: number;
}

export interface CharacterScore {
  /** As the character's latest kill has it, so the guild is the current one. */
  character: RaidCharacter;
  /** The spec played most often, the latest kill breaking a tie. */
  spec?: RaidSpec;
  faction: number;
  /** At the latest kill. */
  itemLevel: number;
  /** One per boss, in raid order. */
  bosses: BossPerformance[];
  killed: number;
  /** The average of the bosses' relative values, a boss not killed counting 0: 0 to 1. */
  performance: number;
  /** MAX_SCORE times the performance, floored. */
  score: number;
}

export interface RankedScore extends CharacterScore {
  rank: number;
}

/**
 * Every character's score on one difficulty, best first. On each boss the character's best kill
 * is divided by the best anyone did there, so a boss where big numbers come easy weighs no more
 * than any other; the average over the bosses, times MAX_SCORE, is the score. A boss nobody has
 * killed is left out of the average. `bossKills` holds each boss's kills by boss index.
 *
 * With a spec, characters are scored on the kills they played as that spec only, as the M+
 * leaderboard does; the best on each boss is still the best anyone did there, any spec.
 */
export function scoreCharacters(
  bosses: readonly RaidBoss[],
  bossKills: ReadonlyArray<readonly RaidKillDetails[]>,
  metric: RaidMetric,
  specId?: number
): CharacterScore[] {
  interface Tally {
    latest: Appearance;
    specs: Map<RaidSpec, { count: number; at: number }>;
    bests: Array<Appearance | undefined>;
  }

  // Each boss file has its own character objects, so characters are keyed by name and realm.
  const tallies = new Map<string, Tally>();
  const tops = bosses.map(() => 0);

  bosses.forEach((boss, bossIndex) => {
    for (const kill of bossKills[bossIndex] ?? []) {
      for (const member of kill.members) {
        if (!member.spec || !countsFor(metric, member.spec)) {
          continue;
        }

        const value = member[metric];
        tops[bossIndex] = Math.max(tops[bossIndex], value);
        if (specId !== undefined && member.spec.id !== specId) {
          continue;
        }

        const key = cachedCharacterKey(member.character);
        let tally = tallies.get(key);
        if (!tally) {
          tally = { latest: { member, kill }, specs: new Map(), bests: bosses.map(() => undefined) };
          tallies.set(key, tally);
        }

        if (kill.killedAt > tally.latest.kill.killedAt) {
          tally.latest = { member, kill };
        }

        const spec = tally.specs.get(member.spec) ?? { count: 0, at: 0 };
        tally.specs.set(member.spec, { count: spec.count + 1, at: Math.max(spec.at, kill.killedAt) });

        const best = tally.bests[bossIndex];
        if (!best || value > best.member[metric] || (value === best.member[metric] && kill.killedAt < best.kill.killedAt)) {
          tally.bests[bossIndex] = { member, kill };
        }
      }
    }
  });

  const scoredBosses = tops.filter(top => top > 0).length;
  if (!scoredBosses) {
    return [];
  }

  const scores = [...tallies.values()].map((tally): CharacterScore => {
    const performances = bosses.map((boss, bossIndex): BossPerformance => {
      const best = tally.bests[bossIndex];
      const value = best ? best.member[metric] : 0;
      return { boss, best, value, relative: tops[bossIndex] > 0 ? value / tops[bossIndex] : 0 };
    });
    const performance = performances.reduce((sum, entry) => sum + entry.relative, 0) / scoredBosses;
    const { member, kill } = tally.latest;
    const spec = [...tally.specs.entries()].sort((a, b) => b[1].count - a[1].count || b[1].at - a[1].at)[0]?.[0];

    return {
      character: member.character,
      spec,
      faction: raceFaction(member.character.race) ?? kill.faction,
      itemLevel: member.itemLevel,
      bosses: performances,
      killed: performances.filter(entry => entry.best).length,
      performance,
      score: toScore(performance)
    };
  });

  return scores.sort((a, b) =>
    b.performance - a.performance || b.killed - a.killed || a.character.name.localeCompare(b.character.name));
}

function toScore(performance: number): number {
  // A float sum can land a hair under a whole number; the nudge keeps that from costing a point.
  return Math.floor(MAX_SCORE * performance + 1e-9);
}

// --- Spec performance -------------------------------------------------------------------

/** The metric a spec is scored on, as the leaderboard ranks it: healing for healers, damage for the rest. */
export function specMetric(spec: RaidSpec): RaidMetric {
  return spec.role === 'healer' ? 'hps' : 'dps';
}

export interface SpecCharacterScore {
  character: RaidCharacter;
  score: number;
}

/**
 * Every character's score as each spec they played, best first: the score the leaderboard shows
 * with that spec picked (scoreCharacters with its specId), for every spec in one pass.
 */
export function scoresBySpec(
  bosses: readonly RaidBoss[],
  bossKills: ReadonlyArray<readonly RaidKillDetails[]>
): Map<RaidSpec, SpecCharacterScore[]> {
  const tops: Record<RaidMetric, number[]> = { dps: bosses.map(() => 0), hps: bosses.map(() => 0) };
  // Each character's best value on each boss, by spec and characterKey.
  const bests = new Map<RaidSpec, Map<string, { character: RaidCharacter; values: number[] }>>();

  bosses.forEach((boss, bossIndex) => {
    for (const kill of bossKills[bossIndex] ?? []) {
      for (const member of kill.members) {
        if (!member.spec) {
          continue;
        }

        const metric = specMetric(member.spec);
        const value = member[metric];
        tops[metric][bossIndex] = Math.max(tops[metric][bossIndex], value);

        let characters = bests.get(member.spec);
        if (!characters) {
          characters = new Map();
          bests.set(member.spec, characters);
        }

        const key = cachedCharacterKey(member.character);
        let entry = characters.get(key);
        if (!entry) {
          entry = { character: member.character, values: bosses.map(() => 0) };
          characters.set(key, entry);
        }
        entry.values[bossIndex] = Math.max(entry.values[bossIndex], value);
      }
    }
  });

  const scoredBosses = { dps: tops.dps.filter(top => top > 0).length, hps: tops.hps.filter(top => top > 0).length };
  const scores = new Map<RaidSpec, SpecCharacterScore[]>();
  for (const [spec, characters] of bests) {
    const metric = specMetric(spec);
    const top = tops[metric];
    if (!scoredBosses[metric]) {
      continue;
    }

    scores.set(spec, [...characters.values()]
      .map(({ character, values }) => ({
        character,
        score: toScore(values.reduce((sum, value, bossIndex) => sum + (top[bossIndex] > 0 ? value / top[bossIndex] : 0), 0) / scoredBosses[metric])
      }))
      .sort((a, b) => b.score - a.score || a.character.name.localeCompare(b.character.name)));
  }

  return scores;
}

/**
 * How many of a spec's best scores its performance averages. Averaging everyone would mostly
 * measure attendance, as a character who killed one boss scores a seventh of one who killed all.
 */
export const SPEC_TOP_SCORES = 10;

/** The average of the best `count` scores, or of all of them when there are fewer; 0 for none. */
export function topAverage(scores: readonly number[], count: number = SPEC_TOP_SCORES): number {
  const top = [...scores].sort((a, b) => b - a).slice(0, count);
  return top.length ? Math.round(top.reduce((sum, score) => sum + score, 0) / top.length) : 0;
}

export interface SpecPerformance extends SpecDefinition {
  /** Characters scored as the spec. */
  count: number;
  /** The topAverage of their scores; 0 when nobody played the spec. */
  score: number;
  best?: SpecCharacterScore;
}

export interface ClassPerformance {
  classId: number;
  className: string;
  color: string;
  /** Characters scored as any of the listed specs, each counted once. */
  count: number;
  /** The topAverage of those characters, each at their best listed spec. */
  score: number;
  specs: SpecPerformance[];
}

export interface SpecPerformanceSummary {
  /** Characters scored as any listed spec, each counted once. */
  characterCount: number;
  classes: ClassPerformance[];
}

/**
 * Each spec's performance, grouped by class like specPopularity: specs inside a class best first
 * (ties keep the game's order), and classes by their best spec, then their next one. Every Legion
 * spec of the role is listed, so a spec nobody played still shows, at 0.
 */
export function specPerformance(
  scores: ReadonlyMap<RaidSpec, readonly SpecCharacterScore[]>,
  role?: RaidRole
): SpecPerformanceSummary {
  const bySpec = new Map([...scores].map(([spec, entries]) => [`${spec.classId}|${spec.name}`, entries]));
  const groups = new Map<number, { group: ClassPerformance; characters: Map<string, number> }>();
  const characters = new Set<string>();

  for (const definition of LEGION_SPECS) {
    if (role && definition.role !== role) {
      continue;
    }

    let entry = groups.get(definition.classId);
    if (!entry) {
      entry = {
        group: {
          classId: definition.classId,
          className: CLASS_NAMES[definition.classId] ?? 'Unknown',
          color: getClassColor(definition.classId) ?? '#9a9a9a',
          count: 0,
          score: 0,
          specs: []
        },
        characters: new Map()
      };
      groups.set(definition.classId, entry);
    }

    const specScores = bySpec.get(`${definition.classId}|${definition.spec}`) ?? [];
    entry.group.specs.push({
      ...definition,
      count: specScores.length,
      score: topAverage(specScores.map(score => score.score)),
      best: specScores[0]
    });

    for (const { character, score } of specScores) {
      const key = cachedCharacterKey(character);
      characters.add(key);
      entry.characters.set(key, Math.max(entry.characters.get(key) ?? 0, score));
    }
  }

  const classes = [...groups.values()].map(({ group, characters: classCharacters }) => {
    group.count = classCharacters.size;
    group.score = topAverage([...classCharacters.values()]);
    group.specs.sort((a, b) => b.score - a.score);
    return group;
  });
  classes.sort((a, b) => compareSpecLists(a.specs, b.specs, spec => spec.score) || a.classId - b.classId);

  return { characterCount: characters.size, classes };
}

/** Clean score gridlines (0, 1000, 2000, …), at most five steps, whose top value covers the best score. */
export function scoreTicks(maxScore: number): number[] {
  const step = [100, 200, 250, 500, 1000, 2000].find(candidate => maxScore / candidate <= 5) ?? 2000;
  const top = Math.max(step, Math.ceil(maxScore / step) * step);
  return Array.from({ length: top / step + 1 }, (_, index) => index * step);
}

/** A gridline's score as the axis shows it: 500, 1k, 2.5k. */
export function formatScoreTick(score: number): string {
  return score >= 1000 ? `${score / 1000}k` : String(score);
}

export interface ScoreFilter {
  classId?: number;
  realm?: string;
}

/** The scores the filter lets through, ranked from 1. Each score is still measured against everyone. */
export function rankScores(scores: readonly CharacterScore[], filter: ScoreFilter = {}): RankedScore[] {
  return scores
    .filter(entry => (filter.classId === undefined || entry.character.classId === filter.classId)
      && (filter.realm === undefined || realmSlug(entry.character.realm) === filter.realm))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

// --- Since the previous scan ------------------------------------------------------------

/**
 * Each boss's kills as the previous export had them: without the ones it didn't have yet
 * (`newLogs`, by logKey). Scored and ranked like the current ones, they give the standings
 * that the rank and score changes measure from.
 */
export function killsBefore(
  bossKills: ReadonlyArray<readonly RaidKillDetails[]>,
  newLogs: ReadonlySet<string>
): RaidKillDetails[][] {
  return bossKills.map(kills => kills.filter(kill => !newLogs.has(logKey(kill))));
}

export interface ScoreChange {
  /** Ranks climbed since the previous ranking, negative for ranks lost. */
  rank: number;
  /** Score gained, negative for score lost: a new best on a boss lowers everyone else's share of it. */
  score: number;
  /** Not in the previous ranking: a first kill, or a first as the spec filtered on. Rank and score are 0. */
  isNew: boolean;
}

/**
 * How each character moved from one ranking to the other, by characterKey. Both have to be
 * ranked the same way (difficulty, metric, spec and filters). A character whose rank and score
 * held is left out.
 */
export function scoreChanges(current: readonly RankedScore[], previous: readonly RankedScore[]): Map<string, ScoreChange> {
  const before = new Map(previous.map(entry => [cachedCharacterKey(entry.character), entry]));
  const changes = new Map<string, ScoreChange>();

  for (const entry of current) {
    const key = cachedCharacterKey(entry.character);
    const earlier = before.get(key);
    if (!earlier) {
      changes.set(key, { rank: 0, score: 0, isNew: true });
    } else if (earlier.rank !== entry.rank || earlier.score !== entry.score) {
      changes.set(key, { rank: earlier.rank - entry.rank, score: entry.score - earlier.score, isNew: false });
    }
  }

  return changes;
}

/**
 * The item quality whose colour shows a share of the best, as Warcraft Logs colours parses:
 * artifact for the best, then legendary from 95%, epic from 75%, rare from 50%, uncommon from 25%.
 */
export function performanceQuality(relative: number): number {
  if (relative >= 1) {
    return 6;
  }
  if (relative >= .95) {
    return 5;
  }
  if (relative >= .75) {
    return 4;
  }
  if (relative >= .5) {
    return 3;
  }
  return relative >= .25 ? 2 : 0;
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

export interface ProgressionFilter {
  /** 0 Alliance, 1 Horde (FACTION_NAMES). */
  faction?: number;
  /** A realm's `realmSlug`. */
  realm?: string;
}

/** The guilds a filter keeps, ranked among themselves, as `rankScores` ranks characters. */
export function filterProgression(rows: readonly GuildProgress[], filter: ProgressionFilter = {}): GuildProgress[] {
  return rows
    .filter(row => (filter.faction === undefined || row.guild.faction === filter.faction)
      && (filter.realm === undefined || realmSlug(row.guild.realm) === filter.realm))
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

export function parseRoleFilter(value: string | null | undefined): RoleFilter {
  return value === 'tank' || value === 'healer' || value === 'dps' ? value : 'all';
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
