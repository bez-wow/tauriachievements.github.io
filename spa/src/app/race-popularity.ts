import { getClassColor } from './class-colors';
import { CLASS_NAMES, MythicPlusRole } from './mythic-plus';
import { LEGION_SPECS } from './mythic-plus-stats';
import { raceFaction } from './raid-logs';

export const RACE_NAMES: Readonly<Record<number, string>> = {
  1: 'Human', 2: 'Orc', 3: 'Dwarf', 4: 'Night Elf',
  5: 'Undead', 6: 'Tauren', 7: 'Gnome', 8: 'Troll',
  9: 'Goblin', 10: 'Blood Elf', 11: 'Draenei', 22: 'Worgen',
  24: 'Pandaren', 25: 'Pandaren', 26: 'Pandaren'
};

/** The island Pandaren (24) and both faction ids (25 Alliance, 26 Horde) are one race choice. */
const PANDAREN = 24;
const canonicalRace = (race: number): number => race === 25 || race === 26 ? PANDAREN : race;

export type RaceFactionFilter = 'all' | 'alliance' | 'horde';

/** A character as one roster slot shows it, in a Mythic+ run or a raid kill. */
export interface RaceSample {
  name: string;
  realm: string;
  class: number;
  spec: string;
  role: MythicPlusRole;
  race: number;
}

export interface RaceShare {
  /** 24 for every Pandaren. */
  race: number;
  name: string;
  count: number;
  /** 0–1, of the spec's characters. */
  share: number;
}

export interface SpecRaces {
  classId: number;
  className: string;
  color: string;
  spec: string;
  icon?: string;
  /** Characters who played the spec. */
  total: number;
  /** Most-played first. */
  races: RaceShare[];
}

export interface RacesBySpec {
  /** Character-spec pairs counted, so a character who played two specs of the role counts twice. */
  total: number;
  specs: SpecRaces[];
}

const FACTION_IDS: Readonly<Record<Exclude<RaceFactionFilter, 'all'>, number>> = { alliance: 0, horde: 1 };

/**
 * Which races play each spec of one role. A character counts once per spec, however many runs or
 * kills they played it in. Every Legion spec of the role is listed in the game's class and spec
 * order, also one nobody played; ties between races go to the name.
 */
export function racesBySpec(
  samples: Iterable<RaceSample>,
  role: MythicPlusRole,
  faction: RaceFactionFilter = 'all'
): RacesBySpec {
  const factionId = faction === 'all' ? undefined : FACTION_IDS[faction];
  const counts = new Map<string, Map<number, number>>();
  const seen = new Set<string>();

  for (const sample of samples) {
    if (sample.role !== role || (factionId !== undefined && raceFaction(sample.race) !== factionId)) {
      continue;
    }

    const specKey = `${sample.class}:${sample.spec}`;
    const characterKey = `${sample.realm}|${sample.name}|${specKey}`;
    if (seen.has(characterKey)) {
      continue;
    }
    seen.add(characterKey);

    let races = counts.get(specKey);
    if (!races) {
      races = new Map();
      counts.set(specKey, races);
    }
    const race = canonicalRace(sample.race);
    races.set(race, (races.get(race) ?? 0) + 1);
  }

  let total = 0;
  const specs = LEGION_SPECS.filter(definition => definition.role === role).map((definition): SpecRaces => {
    const races = counts.get(`${definition.classId}:${definition.spec}`) ?? new Map<number, number>();
    const specTotal = [...races.values()].reduce((sum, count) => sum + count, 0);
    total += specTotal;

    return {
      classId: definition.classId,
      className: CLASS_NAMES[definition.classId] ?? 'Unknown',
      color: getClassColor(definition.classId) ?? '#9a9a9a',
      spec: definition.spec,
      icon: definition.icon,
      total: specTotal,
      races: [...races]
        .map(([race, count]) => ({ race, name: RACE_NAMES[race] ?? `Race ${race}`, count, share: count / specTotal }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    };
  });

  return { total, specs };
}
