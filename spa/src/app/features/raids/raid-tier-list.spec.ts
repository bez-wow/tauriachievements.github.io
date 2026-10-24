import { describe, expect, it } from 'vitest';
import { specById } from '../../game/wow-specs';
import { RaidCharacter, RaidSpec } from './raid-logs.types';
import { SpecCharacterScore } from './raid-scores';
import { FEW_PLAYERS, SPEC_TIERS, TIER_LIST_ROLES, describeTiers, percentOfBest, roleTierList, tierFor } from './raid-tier-list';

function raidSpec(id: number): RaidSpec {
  const spec = specById(id)!;
  return { id, classId: spec.classId, name: spec.spec, role: spec.role };
}

function players(specId: number, count: number, score: number): [RaidSpec, SpecCharacterScore[]] {
  const spec = raidSpec(specId);
  return [spec, Array.from({ length: count }, (_, index): SpecCharacterScore => ({
    character: { name: `${spec.name}${index}`, realm: 'Tauri', classId: spec.classId, race: 1, gender: 0, guild: '' } satisfies RaidCharacter,
    score
  }))];
}

const BLOOD = 250;
const VENGEANCE = 581;
const PROTECTION_PALADIN = 66;
const BREWMASTER = 268;
const GUARDIAN = 104;
const RESTORATION_DRUID = 105;
const MISTWEAVER = 270;

const tankScores = new Map([
  players(GUARDIAN, 1, 1199),
  players(BREWMASTER, 3, 1500),
  players(PROTECTION_PALADIN, 10, 1899),
  players(VENGEANCE, 12, 1900),
  players(BLOOD, 10, 2000)
]);

describe('percentOfBest', () => {
  it('rounds down, so a spec never shows more of the best than it has', () => {
    expect(percentOfBest(4750, 5000)).toBe(95);
    expect(percentOfBest(4749, 5000)).toBe(94);
    expect(percentOfBest(5000, 5000)).toBe(100);
    expect(percentOfBest(0, 0)).toBe(0);
  });
});

describe('tierFor', () => {
  it('puts a percentage in the highest tier it reaches', () => {
    expect([100, 95, 94, 85, 84, 75, 74, 60, 59, 0].map(percent => tierFor(percent).label))
      .toEqual(['S', 'S', 'A', 'A', 'B', 'B', 'C', 'C', 'F', 'F']);
    expect(describeTiers()).toBe('S from 95%, A from 85%, B from 75%, C from 60%, F below');
  });
});

describe('roleTierList', () => {
  it('lists DPS first, then Heal, then Tank', () => {
    expect(TIER_LIST_ROLES.map(({ role, title }) => [role, title])).toEqual([['dps', 'DPS'], ['healer', 'Heal'], ['tank', 'Tank']]);
  });

  const tanks = roleTierList(tankScores, 'tank', 'Tank', 'mythic');
  const placed = tanks.rows.map(row => [row.tier.label, row.specs.map(spec => spec.name)]);

  it('places each spec by its share of the best spec in the role, and always lists every tier', () => {
    expect(placed).toEqual([
      ['S', ['Blood Death Knight', 'Vengeance Demon Hunter']],
      ['A', ['Protection Paladin']],
      ['B', ['Brewmaster Monk']],
      ['C', []],
      ['F', ['Guardian Druid']]
    ]);
    expect(tanks.rows.map(row => row.tier)).toEqual(SPEC_TIERS);
    expect(tanks.characterCount).toBe(36);
  });

  it('marks a spec fewer than ten characters played, and lists the specs nobody played apart', () => {
    const specs = tanks.rows.flatMap(row => row.specs);
    expect(specs.filter(spec => spec.fewPlayers).map(spec => [spec.name, spec.count])).toEqual([
      ['Brewmaster Monk', 3],
      ['Guardian Druid', 1]
    ]);
    expect(FEW_PLAYERS).toBe(10);
    expect(tanks.unplayed).toEqual(['Protection Warrior']);
  });

  it('describes each spec for the tooltip and the screen reader', () => {
    const [blood] = tanks.rows[0].specs;
    const guardian = tanks.rows[4].specs[0];
    expect(blood.note).toBe('2,000 DPS score · 100% of the best · 10 characters');
    expect(guardian.note).toBe('1,199 DPS score · 59% of the best · only 1 character');
    expect(guardian.label).toBe('Guardian Druid, F tier: 1,199 DPS score, 59% of the best, only 1 character. Open its rankings.');
    expect(blood.art).toBe('assets/spec-art/death-knight-blood.webp');
    expect(tanks.rows[0].specs[1].art).toBe('assets/spec-art/demon-hunter-vengeance.webp');
  });

  it("links each spec to its rankings on the difficulty, by HPS for healers", () => {
    expect(tanks.rows[0].specs[0].rankingsQuery).toEqual({ difficulty: 'mythic', metric: null, class: 6, spec: BLOOD });

    const healers = roleTierList(new Map([players(MISTWEAVER, 10, 4000)]), 'healer', 'Heal', 'heroic');
    expect(healers.rows[0].specs[0].rankingsQuery).toEqual({ difficulty: 'heroic', metric: 'hps', class: 10, spec: MISTWEAVER });
    expect(healers.rows[0].specs[0].note).toBe('4,000 HPS score · 100% of the best · 10 characters');
  });

  it("keeps the game's order between specs with the same score", () => {
    const healers = roleTierList(new Map([players(RESTORATION_DRUID, 10, 4000), players(MISTWEAVER, 10, 4000)]), 'healer', 'Heal', 'normal');
    expect(healers.rows[0].specs.map(spec => spec.name)).toEqual(['Mistweaver Monk', 'Restoration Druid']);
  });

  it('leaves every tier empty when nobody in the role was logged', () => {
    const empty = roleTierList(new Map(), 'dps', 'DPS', 'mythic');
    expect(empty.rows.every(row => row.specs.length === 0)).toBe(true);
    expect(empty.characterCount).toBe(0);
    expect(empty.unplayed).toHaveLength(24);
  });
});
