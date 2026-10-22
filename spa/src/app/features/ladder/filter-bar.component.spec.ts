import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { FilterBarComponent } from './filter-bar.component';

describe('FilterBarComponent active filters', () => {
  it('lists every setting Reset would undo, but not the search', () => {
    TestBed.configureTestingModule({ imports: [FilterBarComponent] });
    const fixture = TestBed.createComponent(FilterBarComponent);
    const setInputs = (inputs: Record<string, unknown>) =>
      Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    setInputs({
      sortOptions: [{ value: 'achievementPoints', label: 'Character Achievements' }, { value: 'honorableKills', label: 'Honorable Kills' }],
      realmOptions: [{ value: undefined, label: 'All Realms' }, { value: 'Tauri', label: 'Tauri' }],
      factionOptions: [{ value: undefined, label: 'All Factions' }, { value: 'Horde', label: 'Horde' }],
      classOptions: [{ id: 8, name: 'Mage', icon: '' }]
    });

    expect(fixture.componentInstance.activeFilterLabels()).toEqual([]);

    setInputs({ searchTerm: 'larahh', sort: 'honorableKills', realm: 'Tauri', playerClass: 8, faction: 'Horde', pageSize: 500 });

    expect(fixture.componentInstance.activeFilterLabels()).toEqual(['Sort: Honorable Kills', 'Tauri', 'Mage', 'Horde', '500 per page']);
  });
});
