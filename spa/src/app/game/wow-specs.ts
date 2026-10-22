import { Role } from './wow';

export interface SpecDefinition {
  classId: number;
  spec: string;
  role: Role;
  icon?: string;
}

export interface LegionSpec extends SpecDefinition {
  id: number;
}

const specIcon = (name: string): string => `https://legion-static.tauri.hu/images/icons/large/${name}.png`;

export const LEGION_SPECS: ReadonlyArray<LegionSpec> = [
  { id: 71, classId: 1, spec: 'Arms', role: 'dps', icon: specIcon('ability_warrior_savageblow') },
  { id: 72, classId: 1, spec: 'Fury', role: 'dps', icon: specIcon('ability_warrior_innerrage') },
  { id: 73, classId: 1, spec: 'Protection', role: 'tank', icon: specIcon('ability_warrior_defensivestance') },
  { id: 65, classId: 2, spec: 'Holy', role: 'healer', icon: specIcon('spell_holy_holybolt') },
  { id: 66, classId: 2, spec: 'Protection', role: 'tank', icon: specIcon('ability_paladin_shieldofthetemplar') },
  { id: 70, classId: 2, spec: 'Retribution', role: 'dps', icon: specIcon('spell_holy_auraoflight') },
  { id: 253, classId: 3, spec: 'Beast Mastery', role: 'dps', icon: specIcon('ability_hunter_bestialdiscipline') },
  { id: 254, classId: 3, spec: 'Marksmanship', role: 'dps', icon: specIcon('ability_hunter_focusedaim') },
  { id: 255, classId: 3, spec: 'Survival', role: 'dps', icon: specIcon('ability_hunter_camouflage') },
  { id: 259, classId: 4, spec: 'Assassination', role: 'dps', icon: specIcon('ability_rogue_deadlybrew') },
  { id: 260, classId: 4, spec: 'Outlaw', role: 'dps', icon: specIcon('inv_sword_30') },
  { id: 261, classId: 4, spec: 'Subtlety', role: 'dps', icon: specIcon('ability_stealth') },
  { id: 256, classId: 5, spec: 'Discipline', role: 'healer', icon: specIcon('spell_holy_powerwordshield') },
  { id: 257, classId: 5, spec: 'Holy', role: 'healer', icon: specIcon('spell_holy_guardianspirit') },
  { id: 258, classId: 5, spec: 'Shadow', role: 'dps', icon: specIcon('spell_shadow_shadowwordpain') },
  { id: 250, classId: 6, spec: 'Blood', role: 'tank', icon: specIcon('spell_deathknight_bloodpresence') },
  { id: 251, classId: 6, spec: 'Frost', role: 'dps', icon: specIcon('spell_deathknight_frostpresence') },
  { id: 252, classId: 6, spec: 'Unholy', role: 'dps', icon: specIcon('spell_deathknight_unholypresence') },
  { id: 262, classId: 7, spec: 'Elemental', role: 'dps', icon: specIcon('spell_nature_lightning') },
  { id: 263, classId: 7, spec: 'Enhancement', role: 'dps', icon: specIcon('spell_shaman_improvedstormstrike') },
  { id: 264, classId: 7, spec: 'Restoration', role: 'healer', icon: specIcon('spell_nature_magicimmunity') },
  { id: 62, classId: 8, spec: 'Arcane', role: 'dps', icon: specIcon('spell_holy_magicalsentry') },
  { id: 63, classId: 8, spec: 'Fire', role: 'dps', icon: specIcon('spell_fire_firebolt02') },
  { id: 64, classId: 8, spec: 'Frost', role: 'dps', icon: specIcon('spell_frost_frostbolt02') },
  { id: 265, classId: 9, spec: 'Affliction', role: 'dps', icon: specIcon('spell_shadow_deathcoil') },
  { id: 266, classId: 9, spec: 'Demonology', role: 'dps', icon: specIcon('spell_shadow_metamorphosis') },
  { id: 267, classId: 9, spec: 'Destruction', role: 'dps', icon: specIcon('spell_shadow_rainoffire') },
  { id: 268, classId: 10, spec: 'Brewmaster', role: 'tank', icon: specIcon('spell_monk_brewmaster_spec') },
  { id: 270, classId: 10, spec: 'Mistweaver', role: 'healer', icon: specIcon('spell_monk_mistweaver_spec') },
  { id: 269, classId: 10, spec: 'Windwalker', role: 'dps', icon: specIcon('spell_monk_windwalker_spec') },
  { id: 102, classId: 11, spec: 'Balance', role: 'dps', icon: specIcon('spell_nature_starfall') },
  { id: 103, classId: 11, spec: 'Feral', role: 'dps', icon: specIcon('ability_druid_catform') },
  { id: 104, classId: 11, spec: 'Guardian', role: 'tank', icon: specIcon('ability_racial_bearform') },
  { id: 105, classId: 11, spec: 'Restoration', role: 'healer', icon: specIcon('spell_nature_healingtouch') },
  { id: 577, classId: 12, spec: 'Havoc', role: 'dps', icon: specIcon('ability_demonhunter_specdps') },
  { id: 581, classId: 12, spec: 'Vengeance', role: 'tank', icon: specIcon('ability_demonhunter_spectank') }
];

const specKey = (classId: number, spec: string): string => `${classId}:${spec}`;
const SPECS_BY_KEY = new Map(LEGION_SPECS.map(definition => [specKey(definition.classId, definition.spec), definition]));
const SPECS_BY_ID = new Map(LEGION_SPECS.map(definition => [definition.id, definition]));

export function specFor(classId: number, spec: string): LegionSpec | undefined {
  return SPECS_BY_KEY.get(specKey(classId, spec));
}

export function specById(id: number): LegionSpec | undefined {
  return SPECS_BY_ID.get(id);
}

export function specIconFor(classId: number, spec: string): string | undefined {
  return specFor(classId, spec)?.icon;
}

export function specRoleFor(classId: number, spec: string): Role | undefined {
  return specFor(classId, spec)?.role;
}

export function parseSpecName(classId: number | undefined, value: string | null): string | undefined {
  return LEGION_SPECS.find(spec => spec.classId === classId && spec.spec === value)?.spec;
}
