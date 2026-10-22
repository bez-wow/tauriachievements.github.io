import { describe, expect, it } from 'vitest';
import { buildRareAchievementCharacterKey } from '../../players/rare-achievement-groups';
import { RareAchievementCharacter, RareAchievementSummary } from '../../players/rare-achievements.types';
import {
  MatchFilters,
  countRankingMetricFor,
  findCharacterAchievement,
  parseDate,
  rankMatchingCharacters,
  toAchievementId
} from './rare-achievement-matches';
import {
  ALL_GLADIATOR_TITLES_FILTER_VALUE,
  GLADIATOR_MOUNT_COUNT_RANKING_FILTER_VALUE,
  GLADIATOR_TITLE_COUNT_RANKING_FILTER_VALUE
} from './rare-achievements-filter-state';

const PRIDEFUL = 8666;
const GRIEVOUS = 8643;
const SCARAB_LORD = 416;

function character(
  name: string,
  achievements: Array<[id: number, obtainedAt: string | null]>,
  overrides: Partial<RareAchievementCharacter> = {}
): RareAchievementCharacter {
  return {
    name,
    realm: 'Tauri',
    race: 1,
    gender: 0,
    class: 1,
    guild: 'Outlaws',
    achievements: achievements.map(([id, obtainedAt]) => ({ id, obtainedAt })),
    ...overrides
  };
}

function summary(gladiatorTitleCount: number, gladiatorMountCount = 0): RareAchievementSummary {
  return { gladiatorTitleCount, gladiatorMountCount, ratedBattlegroundHeroCount: 0, realmFirstCount: 0, achievementNames: [] };
}

const noFilters: MatchFilters = { realm: undefined, classId: undefined, search: '' };

describe('toAchievementId', () => {
  it('keeps achievement ids and the grouped choices, and drops anything else', () => {
    expect(toAchievementId(PRIDEFUL)).toBe(PRIDEFUL);
    expect(toAchievementId(ALL_GLADIATOR_TITLES_FILTER_VALUE)).toBe(ALL_GLADIATOR_TITLES_FILTER_VALUE);
    expect(toAchievementId('somethingElse')).toBeUndefined();
    expect(toAchievementId(Number.NaN)).toBeUndefined();
    expect(toAchievementId(undefined)).toBeUndefined();
  });
});

describe('countRankingMetricFor', () => {
  it('ranks by a count only for the two "most" choices', () => {
    expect(countRankingMetricFor(GLADIATOR_TITLE_COUNT_RANKING_FILTER_VALUE)).toBe('gladiatorTitleCount');
    expect(countRankingMetricFor(GLADIATOR_MOUNT_COUNT_RANKING_FILTER_VALUE)).toBe('gladiatorMountCount');
    expect(countRankingMetricFor(PRIDEFUL)).toBeUndefined();
  });
});

describe('findCharacterAchievement', () => {
  it('finds one achievement, or the latest of a group', () => {
    const hero = character('Hero', [[GRIEVOUS, '2014-03-01T00:00:00Z'], [PRIDEFUL, '2014-09-01T00:00:00Z'], [SCARAB_LORD, null]]);

    expect(findCharacterAchievement(hero, SCARAB_LORD)?.id).toBe(SCARAB_LORD);
    expect(findCharacterAchievement(hero, ALL_GLADIATOR_TITLES_FILTER_VALUE)?.id).toBe(PRIDEFUL);
    expect(findCharacterAchievement(character('Nobody', []), PRIDEFUL)).toBeUndefined();
  });
});

describe('rankMatchingCharacters', () => {
  it('lists the newest first, then undated ones by realm and name, and reads each side from the race', () => {
    const characters = [
      character('Older', [[PRIDEFUL, '2014-01-01T00:00:00Z']]),
      character('Newer', [[PRIDEFUL, '2015-01-01T00:00:00Z']], { race: 2 }),
      character('Bundled', [[PRIDEFUL, null]], { realm: 'Evermoon' }),
      character('Absent', [])
    ];

    const rows = rankMatchingCharacters(characters, PRIDEFUL, new Map(), noFilters);

    expect(rows.map(row => [row.rank, row.name, row.faction])).toEqual([
      [1, 'Newer', 'Horde'],
      [2, 'Older', 'Alliance'],
      [3, 'Bundled', 'Alliance']
    ]);
    expect(rows[2].obtainedAtLabel).toBe('Unknown');
  });

  it('ranks by title count, leaving out characters without one', () => {
    const characters = [
      character('One', [[PRIDEFUL, '2015-01-01T00:00:00Z']]),
      character('Two', [[GRIEVOUS, '2014-01-01T00:00:00Z'], [PRIDEFUL, '2014-09-01T00:00:00Z']]),
      character('Unsummarised', [[PRIDEFUL, '2015-02-01T00:00:00Z']])
    ];
    const summaries = new Map([
      [buildRareAchievementCharacterKey('One', 'Tauri'), summary(1)],
      [buildRareAchievementCharacterKey('Two', 'Tauri'), summary(2)]
    ]);

    const rows = rankMatchingCharacters(characters, GLADIATOR_TITLE_COUNT_RANKING_FILTER_VALUE, summaries, noFilters);

    expect(rows.map(row => [row.name, row.gladiatorTitleCount])).toEqual([['Two', 2], ['One', 1]]);
  });

  it('filters by realm, class and a name or guild search', () => {
    const characters = [
      character('Exa', [[PRIDEFUL, '2015-01-01T00:00:00Z']], { realm: 'Evermoon', class: 8 }),
      character('Sosa', [[PRIDEFUL, '2015-01-02T00:00:00Z']], { guild: 'Miracle' })
    ];
    const names = (filters: Partial<MatchFilters>) =>
      rankMatchingCharacters(characters, PRIDEFUL, new Map(), { ...noFilters, ...filters }).map(row => row.name);

    expect(names({ realm: 'Evermoon' })).toEqual(['Exa']);
    expect(names({ classId: 8 })).toEqual(['Exa']);
    expect(names({ search: ' MIRA ' })).toEqual(['Sosa']);
  });

  it('marks Scarab Lords', () => {
    const rows = rankMatchingCharacters([character('Lord', [[PRIDEFUL, null], [SCARAB_LORD, null]])], PRIDEFUL, new Map(), noFilters);

    expect(rows[0].hasScarabLord).toBe(true);
  });
});

describe('parseDate', () => {
  it('reads a date, or nothing for a missing or broken one', () => {
    expect(parseDate('2026-10-22T12:00:00Z')?.toISOString()).toBe('2026-10-22T12:00:00.000Z');
    expect(parseDate('not a date')).toBeUndefined();
    expect(parseDate(undefined)).toBeUndefined();
  });
});
