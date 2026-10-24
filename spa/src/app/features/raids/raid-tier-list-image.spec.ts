import { describe, expect, it } from 'vitest';
import { SPEC_TIERS, RoleTierList, TierSpec } from './raid-tier-list';
import { TierListImageInfo, formatImageDate, imageColumns, imageFooter, imageLayout, tierListImageName, wrapText } from './raid-tier-list-image';

function spec(id: number, count = 20): TierSpec {
  return {
    id, classId: 1, name: `Spec ${id}`, color: '#fff', art: '', score: 1000, count, percentOfBest: 100,
    fewPlayers: count < 10, note: '', label: '', rankingsQuery: {}
  };
}

function list(sizes: number[], extra: Partial<RoleTierList> = {}): RoleTierList {
  let id = 0;
  return {
    role: 'dps',
    title: 'DPS',
    characterCount: 959,
    rows: SPEC_TIERS.map((tier, index) => ({ tier, specs: Array.from({ length: sizes[index] ?? 0 }, () => spec(++id)) })),
    unplayed: [],
    ...extra
  };
}

const info: TierListImageInfo = {
  raidName: 'The Emerald Nightmare',
  raidSlug: 'emerald-nightmare',
  difficultySlug: 'mythic',
  difficultyName: 'Mythic',
  date: new Date(2026, 9, 3, 23, 30)
};

const dps = list([2, 2, 3, 7, 10]);
const healers = list([3, 1, 1, 1, 0], { role: 'healer', title: 'Heal', characterCount: 319, unplayed: ['Holy Priest'] });
const tanks = list([1, 0, 1, 1, 3], { role: 'tank', title: 'Tank', characterCount: 152 });

describe('the tier list image', () => {
  it('gives each table room for its fullest tier, between 6 and 12 icons', () => {
    expect(imageColumns(dps)).toBe(10);
    expect(imageColumns(tanks)).toBe(6);
    expect(imageColumns(list([20]))).toBe(12);
  });

  it('puts the first role across the top and the others side by side below, in order', () => {
    const layout = imageLayout([dps, healers, tanks]);
    expect([layout.width, layout.bottom]).toEqual([1264, 1056]);
    expect(layout.tables.map(table => [table.list.title, table.x, table.top, table.width, table.columns])).toEqual([
      ['DPS', 36, 178, 1192, 13],
      ['Heal', 36, 650, 582, 6],
      ['Tank', 646, 650, 582, 6]
    ]);
  });

  it('is named after the raid, difficulty and local day', () => {
    expect(tierListImageName(info)).toBe('emerald-nightmare-mythic-tier-list-2026-10-03.png');
    expect(formatImageDate(info.date)).toBe('Oct 3, 2026');
  });

  it('explains the scores in its footer, with the few-players and unplayed notes only when needed', () => {
    const rule = "Each spec's top 10 scores, averaged: HPS for healers, DPS for everyone else. Tier by share of the best spec in its role: S from 95%, A from 85%, B from 75%, C from 60%, F below.";
    expect(imageFooter([dps, tanks])).toEqual([rule]);

    const fewHealers = list([1], { role: 'healer', title: 'Heal', characterCount: 1, unplayed: ['Holy Priest'] });
    fewHealers.rows[0].specs[0] = spec(1, 1);
    expect(imageFooter([dps, fewHealers, tanks])).toEqual([
      rule,
      'A number on an icon: fewer than 10 characters played it.',
      'Not played: Holy Priest.'
    ]);
  });

  it('wraps text at word breaks to fit the width', () => {
    const measure = (text: string) => text.length;
    expect(wrapText('one two three four', 9, measure)).toEqual(['one two', 'three', 'four']);
    expect(wrapText('unbreakableword', 4, measure)).toEqual(['unbreakableword']);
    expect(wrapText('', 10, measure)).toEqual([]);
  });
});
