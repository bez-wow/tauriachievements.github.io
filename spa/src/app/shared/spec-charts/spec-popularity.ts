import { getClassColor } from '../../game/class-colors';
import { CLASS_NAMES, Role } from '../../game/wow';
import { LEGION_SPECS, SpecDefinition, specFor } from '../../game/wow-specs';

const specKey = (classId: number, spec: string): string => `${classId}:${spec}`;

interface PopularityMember {
  name: string;
  realm: string;
  class: number;
  spec: string;
  role: Role;
}

export interface SpecPopularityOptions {
  role?: Role;
  uniqueCharacters?: boolean;
}

export interface SpecShare extends SpecDefinition {
  count: number;
  share: number;
}

export interface ClassShare {
  classId: number;
  className: string;
  color: string;
  count: number;
  share: number;
  specs: SpecShare[];
}

export interface SpecPopularity {
  total: number;
  runCount: number;
  classes: ClassShare[];
}

export function specPopularity(
  runs: ReadonlyArray<{ roster: ReadonlyArray<PopularityMember> }>,
  options: SpecPopularityOptions = {}
): SpecPopularity {
  const counts = new Map<string, number>();
  const unlistedSpecs = new Map<string, SpecDefinition>();
  const seenCharacters = new Set<string>();
  let total = 0;

  for (const run of runs) {
    for (const member of run.roster) {
      if (options.role && member.role !== options.role) {
        continue;
      }

      if (options.uniqueCharacters) {
        const characterKey = `${member.name}|${member.realm}|${member.spec}`;
        if (seenCharacters.has(characterKey)) {
          continue;
        }
        seenCharacters.add(characterKey);
      }

      const key = specKey(member.class, member.spec);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total++;

      if (!specFor(member.class, member.spec) && !unlistedSpecs.has(key)) {
        unlistedSpecs.set(key, { classId: member.class, spec: member.spec, role: member.role });
      }
    }
  }

  const groups = new Map<number, ClassShare>();
  for (const definition of [...LEGION_SPECS, ...unlistedSpecs.values()]) {
    if (options.role && definition.role !== options.role) {
      continue;
    }

    let group = groups.get(definition.classId);
    if (!group) {
      group = {
        classId: definition.classId,
        className: CLASS_NAMES[definition.classId] ?? 'Unknown',
        color: getClassColor(definition.classId) ?? '#9a9a9a',
        count: 0,
        share: 0,
        specs: []
      };
      groups.set(definition.classId, group);
    }

    const count = counts.get(specKey(definition.classId, definition.spec)) ?? 0;
    group.specs.push({ ...definition, count, share: total > 0 ? count / total : 0 });
    group.count += count;
  }

  const classes = [...groups.values()];
  for (const group of classes) {
    group.share = total > 0 ? group.count / total : 0;
    group.specs.sort((a, b) => b.count - a.count);
  }
  classes.sort((a, b) => compareSpecLists(a.specs, b.specs, spec => spec.count) || a.classId - b.classId);

  return { total, runCount: runs.length, classes };
}

export function compareSpecLists<T>(a: readonly T[], b: readonly T[], value: (spec: T) => number): number {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (b[index] ? value(b[index]) : 0) - (a[index] ? value(a[index]) : 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

export function shareTicks(maxShare: number): number[] {
  const maxPercent = Math.max(0, Math.round(maxShare * 1e6) / 1e4);
  const step = [1, 2, 5, 10, 20, 25, 50].find(candidate => maxPercent / candidate <= 5) ?? 50;
  const top = Math.max(step, Math.ceil(maxPercent / step) * step);

  return Array.from({ length: top / step + 1 }, (_, index) => index * step);
}

export function formatShare(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}
