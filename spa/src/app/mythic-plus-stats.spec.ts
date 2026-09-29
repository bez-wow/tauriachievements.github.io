import { describe, it, expect } from 'vitest';
import { MythicPlusRole } from './mythic-plus';
import { formatShare, shareTicks, specIconFor, specPopularity } from './mythic-plus-stats';

const member = (name: string, classId: number, spec: string, role: MythicPlusRole) =>
  ({ name, realm: 'Evermoon', class: classId, spec, role });

const runs = [
  {
    roster: [
      member('Pretz', 10, 'Brewmaster', 'tank'),
      member('Maruzobi', 7, 'Restoration', 'healer'),
      member('Goztdh', 12, 'Havoc', 'dps'),
      member('Exa', 8, 'Frost', 'dps'),
      member('Sosa', 8, 'Frost', 'dps')
    ]
  },
  {
    roster: [
      member('Pretz', 10, 'Brewmaster', 'tank'),
      member('Wxz', 11, 'Restoration', 'healer'),
      member('Goztdh', 12, 'Havoc', 'dps'),
      member('Exa', 8, 'Frost', 'dps'),
      member('Maja', 10, 'Windwalker', 'dps')
    ]
  }
];

describe('specPopularity', () => {
  it('shares every player slot out by spec, grouped and ordered by class popularity', () => {
    const result = specPopularity(runs);

    expect(result.total).toBe(10);
    expect(result.runCount).toBe(2);
    expect(result.classes).toHaveLength(12);
    expect(result.classes.slice(0, 5).map(group => group.className))
      .toEqual(['Mage', 'Monk', 'Demon Hunter', 'Shaman', 'Druid']);
    expect(result.classes[0].share).toBeCloseTo(0.3);
  });

  it('orders classes by their most-seen spec rather than by the class total', () => {
    const result = specPopularity([
      {
        roster: [
          member('Brew', 10, 'Brewmaster', 'tank'),
          member('Mist', 10, 'Mistweaver', 'healer'),
          member('Frost', 8, 'Frost', 'dps'),
          member('Frost2', 8, 'Frost', 'dps'),
          member('Frost3', 8, 'Frost', 'dps')
        ]
      },
      {
        roster: [
          member('Brew', 10, 'Brewmaster', 'tank'),
          member('Mist', 10, 'Mistweaver', 'healer'),
          member('Wind', 10, 'Windwalker', 'dps'),
          member('Havoc', 12, 'Havoc', 'dps'),
          member('Havoc2', 12, 'Havoc', 'dps')
        ]
      }
    ]);

    // Monk has the biggest total (5) but Mage has the single most-seen spec (Frost, 3).
    // Demon Hunter and Monk tie on their top spec (2), so Monk's second spec (2 vs 0) breaks the tie.
    expect(result.classes.slice(0, 3).map(group => [group.className, group.count]))
      .toEqual([['Mage', 3], ['Monk', 5], ['Demon Hunter', 2]]);
  });

  it('orders specs inside a class by popularity and keeps unplayed specs at 0%', () => {
    const monk = specPopularity(runs).classes.find(group => group.className === 'Monk');

    expect(monk?.specs.map(spec => [spec.spec, spec.count]))
      .toEqual([['Brewmaster', 2], ['Windwalker', 1], ['Mistweaver', 0]]);
  });

  it('limits both the counts and the listed specs to one role', () => {
    const result = specPopularity(runs, { role: 'tank' });

    expect(result.total).toBe(2);
    expect(result.classes).toHaveLength(6);
    expect(result.classes[0].className).toBe('Monk');
    expect(result.classes[0].specs.map(spec => spec.spec)).toEqual(['Brewmaster']);
    expect(result.classes[0].share).toBe(1);
  });

  it('counts each character once per spec in unique mode', () => {
    const result = specPopularity(runs, { uniqueCharacters: true });
    const mage = result.classes.find(group => group.className === 'Mage');

    expect(result.total).toBe(7);
    expect(mage?.count).toBe(2);
  });

  it('keeps specs it does not know about instead of dropping them', () => {
    const result = specPopularity([{ roster: [member('Odd', 6, 'Frostfire', 'dps')] }]);
    const deathKnight = result.classes[0];

    expect(deathKnight.className).toBe('Death Knight');
    expect(deathKnight.specs[0]).toMatchObject({ spec: 'Frostfire', count: 1, share: 1 });
  });

  it('returns zero shares for an empty selection', () => {
    const result = specPopularity([]);

    expect(result.total).toBe(0);
    expect(result.classes.every(group => group.share === 0)).toBe(true);
  });
});

describe('shareTicks', () => {
  it('picks a clean step and a top tick that covers the largest share', () => {
    expect(shareTicks(0.11)).toEqual([0, 5, 10, 15]);
    expect(shareTicks(0.055)).toEqual([0, 2, 4, 6]);
    expect(shareTicks(0.1)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(shareTicks(1)).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it('still draws a scale when nothing was seen', () => {
    expect(shareTicks(0)).toEqual([0, 1]);
  });
});

describe('formatShare', () => {
  it('formats a 0–1 share as a one-decimal percentage', () => {
    expect(formatShare(0.064)).toBe('6.4%');
    expect(formatShare(0)).toBe('0.0%');
    expect(formatShare(1)).toBe('100.0%');
  });
});

describe('specIconFor', () => {
  it('looks the icon up by class and spec, so same-named specs stay distinct', () => {
    expect(specIconFor(6, 'Blood')).toContain('spell_deathknight_bloodpresence');
    expect(specIconFor(2, 'Holy')).toContain('spell_holy_holybolt');
    expect(specIconFor(5, 'Holy')).toContain('spell_holy_guardianspirit');
  });

  it('returns nothing for a spec it does not know', () => {
    expect(specIconFor(6, 'Frostfire')).toBeUndefined();
  });
});
