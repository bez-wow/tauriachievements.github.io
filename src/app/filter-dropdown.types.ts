export type FilterDropdownValue = string | number | undefined;

export interface FilterDropdownOption<TValue extends FilterDropdownValue = FilterDropdownValue> {
  value: TValue;
  label: string;
  icon?: string;
  color?: string;
}
