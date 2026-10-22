import { describe, it, expect } from 'vitest';
import { RaceSample, racesBySpec } from './race-popularity';
import { Role } from '../../game/wow';

const sample = (name: string, classId: number, spec: string, race: number, role: Role = 'dps'): RaceSample =>
  ({ name, realm: 'Evermoon', class: classId, spec, role, race });

const fire = (name: string, race: number) => sample(name, 8, 'Fire', race);

describe('racesBySpec', () => {
  it('lists every DPS spec in game order, also the ones nobody played', () => {
    const result = racesBySpec([], 'dps');

    expect(result.total).toBe(0);
    expect(result.specs).toHaveLength(24);
    expect(result.specs.slice(0, 3).map(spec => spec.spec)).toEqual(['Arms', 'Fury', 'Retribution']);
    expect(result.specs.at(-1)).toMatchObject({ className: 'Demon Hunter', spec: 'Havoc', total: 0, races: [] });
  });

  it('counts a character once per spec, most-played race first', () => {
    const result = racesBySpec([
      fire('Sosa', 10),
      fire('Sosa', 10),
      fire('Exa', 10),
      fire('Troll', 8),
      sample('Sosa', 8, 'Frost', 10)
    ], 'dps');
    const fireMage = result.specs.find(spec => spec.spec === 'Fire')!;

    expect(result.total).toBe(4);
    expect(fireMage.total).toBe(3);
    expect(fireMage.races.map(race => [race.name, race.count])).toEqual([['Blood Elf', 2], ['Troll', 1]]);
    expect(fireMage.races[0].share).toBeCloseTo(2 / 3);
    expect(fireMage.color).toBe('#69ccf0');
  });

  it('tells apart characters of the same name on two realms', () => {
    const result = racesBySpec([fire('Sosa', 10), { ...fire('Sosa', 10), realm: '[HU] Tauri WoW Server' }], 'dps');

    expect(result.specs.find(spec => spec.spec === 'Fire')!.total).toBe(2);
  });

  it('counts only the asked role', () => {
    const samples = [
      sample('Pretz', 10, 'Brewmaster', 24, 'tank'),
      sample('Wxz', 11, 'Restoration', 6, 'healer'),
      fire('Sosa', 10)
    ];

    expect(racesBySpec(samples, 'dps').total).toBe(1);
    expect(racesBySpec(samples, 'healer').specs.find(spec => spec.spec === 'Restoration' && spec.classId === 11)!.races)
      .toEqual([{ race: 6, name: 'Tauren', count: 1, share: 1 }]);
  });

  it('lists the six tank and six healer specs', () => {
    expect(racesBySpec([], 'tank').specs.map(spec => `${spec.spec} ${spec.className}`)).toEqual([
      'Protection Warrior', 'Protection Paladin', 'Blood Death Knight', 'Brewmaster Monk', 'Guardian Druid', 'Vengeance Demon Hunter'
    ]);
    expect(racesBySpec([], 'healer').specs.map(spec => `${spec.spec} ${spec.className}`)).toEqual([
      'Holy Paladin', 'Discipline Priest', 'Holy Priest', 'Restoration Shaman', 'Mistweaver Monk', 'Restoration Druid'
    ]);
  });

  it('counts the three Pandaren ids as one race', () => {
    const result = racesBySpec([
      sample('Maja', 10, 'Windwalker', 24),
      sample('Pretz', 10, 'Windwalker', 25),
      sample('Wux', 10, 'Windwalker', 26),
      sample('Lin', 10, 'Windwalker', 10)
    ], 'dps');

    expect(result.specs.find(spec => spec.spec === 'Windwalker')!.races)
      .toEqual([{ race: 24, name: 'Pandaren', count: 3, share: 0.75 }, { race: 10, name: 'Blood Elf', count: 1, share: 0.25 }]);
  });

  it('keeps only one faction when asked, with shares of that faction alone', () => {
    const samples = [fire('Sosa', 10), fire('Exa', 10), fire('Lux', 1), fire('Wux', 26), fire('Maja', 24)];

    const alliance = racesBySpec(samples, 'dps', 'alliance').specs.find(spec => spec.spec === 'Fire')!;
    const horde = racesBySpec(samples, 'dps', 'horde').specs.find(spec => spec.spec === 'Fire')!;

    expect(alliance.races).toEqual([{ race: 1, name: 'Human', count: 1, share: 1 }]);
    expect(horde.total).toBe(3);
    expect(horde.races.map(race => race.name)).toEqual(['Blood Elf', 'Pandaren']);
  });

  it('breaks a tie between races by name', () => {
    const result = racesBySpec([fire('Sosa', 10), fire('Lux', 1)], 'dps');

    expect(result.specs.find(spec => spec.spec === 'Fire')!.races.map(race => race.name)).toEqual(['Blood Elf', 'Human']);
  });
});
