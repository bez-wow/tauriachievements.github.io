import { getClassIconPath } from '../game/classIconHelper';
import { CLASSES_BY_NAME, REALMS } from '../game/wow';

export interface LadderSelectOption<TValue> {
  value: TValue;
  label: string;
}

export interface LadderClassOption {
  id: number;
  name: string;
  icon: string;
}

export const REALM_OPTIONS: ReadonlyArray<LadderSelectOption<string | undefined>> = [
  { value: undefined, label: 'All Realms' },
  ...REALMS.map(realm => ({ value: realm, label: realm }))
];

export const FACTION_OPTIONS: ReadonlyArray<LadderSelectOption<string | undefined>> = [
  { value: undefined, label: 'All Factions' },
  { value: 'Horde', label: 'Horde' },
  { value: 'Alliance', label: 'Alliance' }
];

export const CLASS_OPTIONS: ReadonlyArray<LadderClassOption> = CLASSES_BY_NAME
  .map(({ id, name }) => ({ id, name, icon: getClassIconPath(id) }));
