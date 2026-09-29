import { CLASS_COLORS, CLASS_NAMES, MythicPlusMember, MythicPlusRole } from './mythic-plus';

export interface SpecDefinition {
  classId: number;
  spec: string;
  role: MythicPlusRole;
  icon?: string;
}

const specIcon = (name: string): string => `https://legion-static.tauri.hu/images/icons/large/${name}.png`;

/** Every Legion spec, in the game's class and spec order. */
export const LEGION_SPECS: ReadonlyArray<SpecDefinition> = [
  { classId: 1, spec: 'Arms', role: 'dps', icon: specIcon('ability_warrior_savageblow') },
  { classId: 1, spec: 'Fury', role: 'dps', icon: specIcon('ability_warrior_innerrage') },
  { classId: 1, spec: 'Protection', role: 'tank', icon: specIcon('ability_warrior_defensivestance') },
  { classId: 2, spec: 'Holy', role: 'healer', icon: specIcon('spell_holy_holybolt') },
  { classId: 2, spec: 'Protection', role: 'tank', icon: specIcon('ability_paladin_shieldofthetemplar') },
  { classId: 2, spec: 'Retribution', role: 'dps', icon: specIcon('spell_holy_auraoflight') },
  { classId: 3, spec: 'Beast Mastery', role: 'dps', icon: specIcon('ability_hunter_bestialdiscipline') },
  { classId: 3, spec: 'Marksmanship', role: 'dps', icon: specIcon('ability_hunter_focusedaim') },
  { classId: 3, spec: 'Survival', role: 'dps', icon: specIcon('ability_hunter_camouflage') },
  { classId: 4, spec: 'Assassination', role: 'dps', icon: specIcon('ability_rogue_deadlybrew') },
  { classId: 4, spec: 'Outlaw', role: 'dps', icon: specIcon('inv_sword_30') },
  { classId: 4, spec: 'Subtlety', role: 'dps', icon: specIcon('ability_stealth') },
  { classId: 5, spec: 'Discipline', role: 'healer', icon: specIcon('spell_holy_powerwordshield') },
  { classId: 5, spec: 'Holy', role: 'healer', icon: specIcon('spell_holy_guardianspirit') },
  { classId: 5, spec: 'Shadow', role: 'dps', icon: specIcon('spell_shadow_shadowwordpain') },
  { classId: 6, spec: 'Blood', role: 'tank', icon: specIcon('spell_deathknight_bloodpresence') },
  { classId: 6, spec: 'Frost', role: 'dps', icon: specIcon('spell_deathknight_frostpresence') },
  { classId: 6, spec: 'Unholy', role: 'dps', icon: specIcon('spell_deathknight_unholypresence') },
  { classId: 7, spec: 'Elemental', role: 'dps', icon: specIcon('spell_nature_lightning') },
  { classId: 7, spec: 'Enhancement', role: 'dps', icon: specIcon('spell_shaman_improvedstormstrike') },
  { classId: 7, spec: 'Restoration', role: 'healer', icon: specIcon('spell_nature_magicimmunity') },
  { classId: 8, spec: 'Arcane', role: 'dps', icon: specIcon('spell_holy_magicalsentry') },
  { classId: 8, spec: 'Fire', role: 'dps', icon: specIcon('spell_fire_firebolt02') },
  { classId: 8, spec: 'Frost', role: 'dps', icon: specIcon('spell_frost_frostbolt02') },
  { classId: 9, spec: 'Affliction', role: 'dps', icon: specIcon('spell_shadow_deathcoil') },
  { classId: 9, spec: 'Demonology', role: 'dps', icon: specIcon('spell_shadow_metamorphosis') },
  { classId: 9, spec: 'Destruction', role: 'dps', icon: specIcon('spell_shadow_rainoffire') },
  { classId: 10, spec: 'Brewmaster', role: 'tank', icon: specIcon('spell_monk_brewmaster_spec') },
  { classId: 10, spec: 'Mistweaver', role: 'healer', icon: specIcon('spell_monk_mistweaver_spec') },
  { classId: 10, spec: 'Windwalker', role: 'dps', icon: specIcon('spell_monk_windwalker_spec') },
  { classId: 11, spec: 'Balance', role: 'dps', icon: specIcon('spell_nature_starfall') },
  { classId: 11, spec: 'Feral', role: 'dps', icon: specIcon('ability_druid_catform') },
  { classId: 11, spec: 'Guardian', role: 'tank', icon: specIcon('ability_racial_bearform') },
  { classId: 11, spec: 'Restoration', role: 'healer', icon: specIcon('spell_nature_healingtouch') },
  { classId: 12, spec: 'Havoc', role: 'dps', icon: specIcon('ability_demonhunter_specdps') },
  { classId: 12, spec: 'Vengeance', role: 'tank', icon: specIcon('ability_demonhunter_spectank') }
];

const specKey = (classId: number, spec: string): string => `${classId}:${spec}`;
const KNOWN_SPEC_KEYS = new Set(LEGION_SPECS.map(definition => specKey(definition.classId, definition.spec)));
const SPEC_ICONS = new Map(LEGION_SPECS.map(definition => [specKey(definition.classId, definition.spec), definition.icon]));

/** The icon for a class's spec, when it's one of the Legion specs. */
export function specIconFor(classId: number, spec: string): string | undefined {
  return SPEC_ICONS.get(specKey(classId, spec));
}

type PopularityMember = Pick<MythicPlusMember, 'name' | 'realm' | 'class' | 'spec' | 'role'>;

export interface SpecPopularityOptions {
  role?: MythicPlusRole;
  /** Count each character once per spec, instead of once per run it appears in. */
  uniqueCharacters?: boolean;
}

export interface SpecShare extends SpecDefinition {
  count: number;
  /** 0–1, of every counted slot (or character) in the selection. */
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
  /** Player slots (or unique characters) the shares are measured against. */
  total: number;
  runCount: number;
  classes: ClassShare[];
}

/**
 * How often each spec was seen, grouped by class. Specs inside a class are ordered by popularity (ties
 * keep the game's order), and classes are ordered by their most-seen spec — then their next one — like
 * raider.io, rather than by the class total. Every spec of the selected role is listed, so a spec nobody
 * played still shows up at 0%.
 */
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

      if (!KNOWN_SPEC_KEYS.has(key) && !unlistedSpecs.has(key)) {
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
        color: CLASS_COLORS[definition.classId] ?? '#9a9a9a',
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
  classes.sort((a, b) => compareSpecCounts(a.specs, b.specs) || a.classId - b.classId);

  return { total, runCount: runs.length, classes };
}

/** Descending by the most-seen spec, then the next one, and so on. Expects each list already sorted. */
function compareSpecCounts(a: readonly SpecShare[], b: readonly SpecShare[]): number {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (b[index]?.count ?? 0) - (a[index]?.count ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

/** Clean percentage gridlines (0, 5, 10, …) whose top value covers the largest share. */
export function shareTicks(maxShare: number): number[] {
  const maxPercent = Math.max(0, Math.round(maxShare * 1e6) / 1e4);
  const step = [1, 2, 5, 10, 20, 25, 50].find(candidate => maxPercent / candidate <= 5) ?? 50;
  const top = Math.max(step, Math.ceil(maxPercent / step) * step);

  return Array.from({ length: top / step + 1 }, (_, index) => index * step);
}

export function formatShare(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}
