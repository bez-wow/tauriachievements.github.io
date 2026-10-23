import { realmSlug } from '../../game/wow';
import { LEGION_SPECS } from '../../game/wow-specs';
import {
  RaidSpecEntry,
  RaidGuildEntry,
  RaidPerformerEntry,
  RaidLogsIndexFile,
  RaidTalentsFile,
  RaidTalentTooltipsFile,
  RaidGendersFile,
  RaidBossFile,
  RaidDifficulty,
  RaidBoss,
  RaidSpec,
  RaidGuild,
  RaidPerformer,
  RaidTrinket,
  RaidTalent,
  RaidTalentTable,
  RaidTalentTooltips,
  RaidKill,
  RaidCharacter,
  RaidCharacterClasses,
  RaidMember,
  RaidKillDetails,
  RaidLogsIndex
} from './raid-logs.types';

export const RAID_LOGS_DATA_DIR = 'raid-log-data';

export const RAID_TALENTS_PATH = `${RAID_LOGS_DATA_DIR}/talents.json`;

export const RAID_TALENT_TOOLTIPS_PATH = `${RAID_LOGS_DATA_DIR}/talent-tooltips.json`;

export const RAID_GENDERS_PATH = 'assets/data/raid-genders.json';

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

const KILL_ORDER: ReadonlyArray<string> = ['nythendra', 'ursoc', 'dragons-of-nightmare', 'elerethe-renferal', 'ilgynoth', 'cenarius', 'xavius'];

export function bossesInKillOrder<T extends Pick<RaidBoss, 'slug' | 'index'>>(bosses: readonly T[]): T[] {
  const place = (boss: T) => {
    const position = KILL_ORDER.indexOf(boss.slug);
    return position < 0 ? KILL_ORDER.length + boss.index : position;
  };
  return [...bosses].sort((a, b) => place(a) - place(b));
}

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
    top,
    formerCharacters: new Map((file.formerCharacters ?? []).map(([name, realm, classId, formerClassIds]) =>
      [characterKey({ name, realm }), { classId, formerClassIds }]))
  };
}

export function formerCharactersOf(
  index: Pick<RaidLogsIndex, 'formerCharacters'>,
  realm: string,
  name: string
): RaidCharacterClasses | undefined {
  const exact = `${realmSlug(realm)}/${name}`;
  const folded = exact.toLocaleLowerCase();
  return index.formerCharacters.get(exact)
    ?? [...index.formerCharacters].find(([key]) => key.toLocaleLowerCase() === folded)?.[1];
}

export function decodeBossFile(
  file: RaidBossFile,
  boss: RaidBoss,
  difficulty: RaidDifficulty,
  specs: ReadonlyMap<number, RaidSpec>
): RaidKillDetails[] {
  const guilds = file.guilds.map(decodeGuild);
  const characters = file.players.map(([name, realm, classId, race, gender, guild, former]): RaidCharacter =>
    ({ name, realm, classId, race, gender, guild, former: former === 1 }));
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

export function memberTalents(member: Pick<RaidMember, 'spec' | 'talents'>, table: RaidTalentTable): Array<RaidTalent | undefined> {
  const tiers = member.spec ? table.get(member.spec.id) : undefined;
  if (!tiers || !member.talents) {
    return [];
  }

  return [...member.talents].map((column, tier) => tiers[tier]?.[Number(column)]);
}

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

export function defaultDifficulty(difficulties: readonly RaidDifficulty[]): RaidDifficulty | undefined {
  return [...difficulties].reverse().find(difficulty => difficulty.kills > 0) ?? difficulties[0];
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
