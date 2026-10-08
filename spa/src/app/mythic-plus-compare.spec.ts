import { describe, expect, it } from 'vitest';
import { MythicPlusMember } from './mythic-plus';
import { COMPARE_LIMIT, compareParam, parseCompareParam, seriesColors } from './mythic-plus-compare';

function member(name: string, realm = 'Evermoon'): MythicPlusMember {
  return { name, realm, class: 10, race: 1, gender: 0, spec: 'Windwalker', role: 'dps' };
}

describe('compare param', () => {
  it('reads characters in order, without repeats, at most the limit', () => {
    const value = 'Exkeito-Evermoon, Pashao-Evermoon,exkeito-evermoon,A-Tauri,B-Tauri,C-Tauri';
    expect(parseCompareParam(value)).toEqual([
      { name: 'Exkeito', realm: 'Evermoon' },
      { name: 'Pashao', realm: 'Evermoon' },
      { name: 'A', realm: 'Tauri' },
      { name: 'B', realm: 'Tauri' }
    ]);
    expect(parseCompareParam(value)).toHaveLength(COMPARE_LIMIT);
  });

  it('skips what is not a character and reads nothing from nothing', () => {
    expect(parseCompareParam('Exkeito,-Evermoon,Pashao-')).toEqual([]);
    expect(parseCompareParam(null)).toEqual([]);
  });

  it('writes what it reads', () => {
    const characters = [member('Exkeito'), member('Táncoslány', 'Tauri')];
    expect(parseCompareParam(compareParam(characters))).toEqual([
      { name: 'Exkeito', realm: 'Evermoon' },
      { name: 'Táncoslány', realm: 'Tauri' }
    ]);
  });
});


describe('seriesColors', () => {
  it('keeps class colours and swaps a repeated one for a spare', () => {
    expect(seriesColors(['#00FF98', '#C41E3A', '#00ff98'])).toEqual(['#00FF98', '#C41E3A', '#4fc3f7']);
  });
});
