import { describe, it, expect } from 'vitest';
import {
  buildRareAchievementNamesById,
  buildRareAchievementSummaryLabel,
  summarizeRareAchievements
} from './rare-achievement-summary';
import { RareAchievementCharacter, RareAchievementSummary } from './rare-achievements.types';

const GLADIATOR_TITLE_ID = 8666;
const GLADIATOR_MOUNT_ID = 416;
const RATED_BG_HERO_ID = 8659;
const REALM_FIRST_ID = 4576;
const UNTRACKED_ID = 1;

function character(achievementIds: number[]): RareAchievementCharacter {
  return {
    name: 'Spuky',
    realm: 'Evermoon',
    race: 1,
    gender: 0,
    class: 2,
    guild: 'Leviathan',
    achievements: achievementIds.map((id) => ({ id, obtainedAt: null }))
  };
}

describe('buildRareAchievementNamesById', () => {
  it('maps achievement ids to their names', () => {
    const map = buildRareAchievementNamesById([
      { id: 10, name: 'Alpha' },
      { id: 20, name: 'Beta' }
    ]);

    expect(map.get(10)).toBe('Alpha');
    expect(map.get(20)).toBe('Beta');
    expect(map.size).toBe(2);
  });
});

describe('summarizeRareAchievements', () => {
  it('returns undefined when the character owns no tracked rare achievement', () => {
    expect(summarizeRareAchievements(character([UNTRACKED_ID]), new Map())).toBeUndefined();
  });

  it('counts each tracked category independently', () => {
    const summary = summarizeRareAchievements(
      character([GLADIATOR_TITLE_ID, GLADIATOR_MOUNT_ID, RATED_BG_HERO_ID, REALM_FIRST_ID, UNTRACKED_ID]),
      new Map()
    );

    expect(summary).toBeDefined();
    expect(summary).toMatchObject({
      gladiatorTitleCount: 1,
      gladiatorMountCount: 1,
      ratedBattlegroundHeroCount: 1,
      realmFirstCount: 1
    });
  });

  it('orders names by category: titles, then mounts, then BG heroes, then realm firsts', () => {
    const names = new Map<number, string>([
      [GLADIATOR_TITLE_ID, 'A-Title'],
      [GLADIATOR_MOUNT_ID, 'B-Mount'],
      [RATED_BG_HERO_ID, 'C-Hero'],
      [REALM_FIRST_ID, 'D-RealmFirst']
    ]);

    const summary = summarizeRareAchievements(
      character([REALM_FIRST_ID, RATED_BG_HERO_ID, GLADIATOR_MOUNT_ID, GLADIATOR_TITLE_ID]),
      names
    );

    expect(summary?.achievementNames).toEqual(['A-Title', 'B-Mount', 'C-Hero', 'D-RealmFirst']);
  });

  it('falls back to the built-in label when the names map lacks the id', () => {
    const summary = summarizeRareAchievements(character([GLADIATOR_TITLE_ID]), new Map());

    expect(summary?.achievementNames).toEqual(['S15 - Prideful Gladiator']);
  });

  it('does not count the same tracked id twice', () => {
    const summary = summarizeRareAchievements(
      character([GLADIATOR_TITLE_ID, GLADIATOR_TITLE_ID]),
      new Map()
    );

    expect(summary?.gladiatorTitleCount).toBe(1);
  });
});

describe('buildRareAchievementSummaryLabel', () => {
  it('returns undefined for no summary', () => {
    expect(buildRareAchievementSummaryLabel(undefined)).toBeUndefined();
  });

  it('joins achievement names with newlines when present', () => {
    const summary: RareAchievementSummary = {
      gladiatorTitleCount: 1,
      gladiatorMountCount: 0,
      ratedBattlegroundHeroCount: 0,
      realmFirstCount: 0,
      achievementNames: ['First', 'Second']
    };

    expect(buildRareAchievementSummaryLabel(summary)).toBe('First\nSecond');
  });

  it('pluralizes category counts when there are no explicit names', () => {
    const summary: RareAchievementSummary = {
      gladiatorTitleCount: 2,
      gladiatorMountCount: 1,
      ratedBattlegroundHeroCount: 0,
      realmFirstCount: 3,
      achievementNames: []
    };

    expect(buildRareAchievementSummaryLabel(summary)).toBe(
      '2 Gladiator titles\n1 Gladiator mount\n3 Realm first achievements'
    );
  });
});
