import { describe, it, expect } from 'vitest';
import { buildPlayerComparison, getClassColor, getClassName } from './compare';
import { RankedLadderPlayer } from './ladder.service';

function ranked(overrides: Partial<RankedLadderPlayer> = {}): RankedLadderPlayer {
  return {
    name: 'Larahh',
    race: 4,
    gender: 1,
    class: 11,
    realm: 'Tauri',
    guild: 'Outlaws',
    achievementPoints: 19325,
    achievementPointsDelta: 0,
    achievementRankDelta: 0,
    honorableKills: 329412,
    honorableKillsDelta: 0,
    honorableKillsRankDelta: 0,
    appearanceCount: 0,
    appearanceCountDelta: 0,
    appearanceRankDelta: 0,
    characterAge: '',
    isNewCharacter: false,
    faction: 'Alliance',
    achievementRank: 1,
    honorableKillRank: 1,
    ...overrides
  };
}

function metric(result: ReturnType<typeof buildPlayerComparison>, label: string) {
  const row = result.rows.find((entry) => entry.label === label);
  if (!row || row.kind !== 'metric') {
    throw new Error(`metric row not found: ${label}`);
  }
  return row;
}

describe('getClassName', () => {
  it('maps known class ids to names and falls back for unknown ids', () => {
    expect(getClassName(2)).toBe('Paladin');
    expect(getClassName(11)).toBe('Druid');
    expect(getClassName(99)).toBe('Class 99');
  });
});

describe('getClassColor', () => {
  it('returns the supplied World of Warcraft class colors', () => {
    expect(getClassColor(5)).toBe('#FFFFFF');
    expect(getClassColor(11)).toBe('#FF7C0A');
    expect(getClassColor(13)).toBe('#33937F');
    expect(getClassColor(99)).toBeUndefined();
  });
});

describe('buildPlayerComparison', () => {
  it('awards higher-is-better metrics to the larger value', () => {
    const result = buildPlayerComparison(
      ranked({ achievementPoints: 20000 }),
      ranked({ achievementPoints: 18000 })
    );

    expect(metric(result, 'Achievement Points').outcome).toBe('a');
  });

  it('awards rank metrics to the lower (better) rank', () => {
    const result = buildPlayerComparison(
      ranked({ achievementRank: 5 }),
      ranked({ achievementRank: 2 })
    );

    expect(metric(result, 'Achievement Rank').outcome).toBe('b');
  });

  it('treats equal metric values as a tie', () => {
    const result = buildPlayerComparison(
      ranked({ honorableKills: 1000 }),
      ranked({ honorableKills: 1000 })
    );

    expect(metric(result, 'Honorable Kills').outcome).toBe('tie');
  });

  it('compares appearance totals as a higher-is-better metric', () => {
    const result = buildPlayerComparison(
      ranked({ appearanceCount: 2849 }),
      ranked({ appearanceCount: 1932 })
    );

    expect(metric(result, 'Appearances').outcome).toBe('a');
    expect(metric(result, 'Appearances').difference).toBe(917);
  });

  it('shows the absolute difference between metric values', () => {
    const result = buildPlayerComparison(
      ranked({ achievementPoints: 19115, honorableKills: 70888 }),
      ranked({ achievementPoints: 13390, honorableKills: 34597 })
    );

    expect(metric(result, 'Achievement Points').difference).toBe(5725);
    expect(metric(result, 'Honorable Kills').difference).toBe(36291);
  });

  it('does not include recent movement rows', () => {
    const result = buildPlayerComparison(ranked(), ranked());

    expect(result.rows.some((row) => row.label === 'Recent Achievement Movement')).toBe(false);
    expect(result.rows.some((row) => row.label === 'Recent Honorable Kill Movement')).toBe(false);
  });

  it('tallies wins and resolves the verdict', () => {
    const result = buildPlayerComparison(
      ranked({ achievementPoints: 20000, achievementRank: 1, honorableKills: 500, honorableKillRank: 9 }),
      ranked({ achievementPoints: 10000, achievementRank: 9, honorableKills: 5000, honorableKillRank: 1 })
    );

    expect(result.aWins).toBe(2);
    expect(result.bWins).toBe(2);
    expect(result.verdict).toBe('tie');
  });

  it('emits informational rows for class, realm, guild, and faction', () => {
    const result = buildPlayerComparison(
      ranked({ realm: 'Tauri', guild: 'Outlaws' }),
      ranked({ realm: 'Evermoon', guild: 'Leviathan' })
    );

    const realm = result.rows.find((row) => row.label === 'Realm');
    expect(realm?.kind).toBe('info');
    if (realm?.kind === 'info') {
      expect(realm.aText).toBe('Tauri');
      expect(realm.bText).toBe('Evermoon');
      expect(realm.same).toBe(false);
    }
  });

  it('adds each character class color to the class row', () => {
    const result = buildPlayerComparison(ranked({ class: 5 }), ranked({ class: 11 }));
    const classRow = result.rows.find((row) => row.label === 'Class');

    expect(classRow?.kind).toBe('info');
    if (classRow?.kind === 'info') {
      expect(classRow.aColor).toBe('#FFFFFF');
      expect(classRow.bColor).toBe('#FF7C0A');
    }
  });

  it('shows an em dash for a missing guild', () => {
    const result = buildPlayerComparison(ranked({ guild: '' }), ranked({ guild: 'Outlaws' }));
    const guild = result.rows.find((row) => row.label === 'Guild');

    expect(guild?.kind).toBe('info');
    if (guild?.kind === 'info') {
      expect(guild.aText).toBe('—');
    }
  });
});
