import { describe, it, expect } from 'vitest';
import { ParamMap } from '@angular/router';
import {
  DEFAULT_LADDER_FILTER_STATE,
  areLadderFilterStatesEqual,
  parseLadderFilterState,
  toLadderQueryParams
} from './ladder-filter-state';

function paramMap(values: Record<string, string>): ParamMap {
  return {
    get: (name: string) => (name in values ? values[name] : null),
    has: (name: string) => name in values,
    getAll: (name: string) => (name in values ? [values[name]] : []),
    keys: Object.keys(values)
  };
}

describe('parseLadderFilterState', () => {
  it('returns the default state for empty params', () => {
    expect(parseLadderFilterState(paramMap({}))).toEqual(DEFAULT_LADDER_FILTER_STATE);
  });

  it('parses a full set of valid params', () => {
    const state = parseLadderFilterState(paramMap({
      sort: 'honorableKills',
      realm: 'Tauri',
      faction: 'Alliance',
      class: '2',
      pageSize: '500',
      search: 'Larahh'
    }));

    expect(state).toEqual({
      sort: 'honorableKills',
      realm: 'Tauri',
      faction: 'Alliance',
      playerClass: 2,
      pageSize: 500,
      search: 'Larahh'
    });
  });

  it('falls back to defaults for invalid values', () => {
    const state = parseLadderFilterState(paramMap({
      sort: 'nonsense',
      realm: 'Atlantis',
      faction: 'Pandaren',
      class: '999',
      pageSize: '42'
    }));

    expect(state).toEqual(DEFAULT_LADDER_FILTER_STATE);
  });

  it('rejects a non-numeric class and an unknown class id', () => {
    expect(parseLadderFilterState(paramMap({ class: 'abc' })).playerClass).toBeUndefined();
    expect(parseLadderFilterState(paramMap({ class: '13' })).playerClass).toBeUndefined();
  });

  it('only accepts whitelisted page sizes', () => {
    expect(parseLadderFilterState(paramMap({ pageSize: '1000' })).pageSize).toBe(1000);
    expect(parseLadderFilterState(paramMap({ pageSize: '250' })).pageSize).toBe(DEFAULT_LADDER_FILTER_STATE.pageSize);
  });

  it('accepts appearances as a sort metric', () => {
    expect(parseLadderFilterState(paramMap({ sort: 'appearanceCount' })).sort).toBe('appearanceCount');
  });
});

describe('toLadderQueryParams', () => {
  it('omits default sort and page size, and a blank search', () => {
    expect(toLadderQueryParams(DEFAULT_LADDER_FILTER_STATE)).toEqual({
      sort: null,
      realm: null,
      faction: null,
      class: null,
      pageSize: null,
      search: null
    });
  });

  it('emits non-default values and trims the search', () => {
    expect(toLadderQueryParams({
      sort: 'honorableKills',
      realm: 'Evermoon',
      faction: 'Horde',
      playerClass: 8,
      pageSize: 500,
      search: '  Spuky  '
    })).toEqual({
      sort: 'honorableKills',
      realm: 'Evermoon',
      faction: 'Horde',
      class: 8,
      pageSize: 500,
      search: 'Spuky'
    });
  });

  it('round-trips a parsed state back to query params', () => {
    const params = {
      sort: 'honorableKills',
      realm: 'Tauri',
      faction: 'Alliance',
      class: '2',
      pageSize: '500',
      search: 'Larahh'
    };
    const reEmitted = toLadderQueryParams(parseLadderFilterState(paramMap(params)));

    expect(reEmitted).toEqual({
      sort: 'honorableKills',
      realm: 'Tauri',
      faction: 'Alliance',
      class: 2,
      pageSize: 500,
      search: 'Larahh'
    });
  });

  it('emits the appearances sort in query params', () => {
    expect(toLadderQueryParams({
      ...DEFAULT_LADDER_FILTER_STATE,
      sort: 'appearanceCount'
    })['sort']).toBe('appearanceCount');
  });
});

describe('areLadderFilterStatesEqual', () => {
  it('is true for identical states and false when any field differs', () => {
    expect(areLadderFilterStatesEqual(DEFAULT_LADDER_FILTER_STATE, { ...DEFAULT_LADDER_FILTER_STATE })).toBe(true);
    expect(areLadderFilterStatesEqual(DEFAULT_LADDER_FILTER_STATE, { ...DEFAULT_LADDER_FILTER_STATE, playerClass: 2 })).toBe(false);
    expect(areLadderFilterStatesEqual(DEFAULT_LADDER_FILTER_STATE, { ...DEFAULT_LADDER_FILTER_STATE, search: 'x' })).toBe(false);
  });
});
