import { getClassColor } from '../../game/class-colors';
import { CLASS_NAMES, RACE_NAMES, raceFaction, Role } from '../../game/wow';
import { LEGION_SPECS } from '../../game/wow-specs';

const PANDAREN = 24;
const canonicalRace = (race: number): number => race === 25 || race === 26 ? PANDAREN : race;

export type RaceFactionFilter = 'all' | 'alliance' | 'horde';

export interface RaceSample {
  name: string;
  realm: string;
  class: number;
  spec: string;
  role: Role;
  race: number;
}

export interface RaceShare {
  race: number;
  name: string;
  count: number;
  share: number;
}

export interface SpecRaces {
  classId: number;
  className: string;
  color: string;
  spec: string;
  icon?: string;
  total: number;
  races: RaceShare[];
}

export interface RacesBySpec {
  total: number;
  specs: SpecRaces[];
}

const FACTION_IDS: Readonly<Record<Exclude<RaceFactionFilter, 'all'>, number>> = { alliance: 0, horde: 1 };

export function racesBySpec(
  samples: Iterable<RaceSample>,
  role: Role,
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
