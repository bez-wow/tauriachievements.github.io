import { describe, it, expect } from 'vitest';
import { buildHighlightParts, mapLadderPlayersToView } from './ladder-player-view.mapper';
import { LadderAchievement } from './ladder.service';
import { RareAchievementSummary } from './rare-achievements.types';

function achievement(overrides: Partial<LadderAchievement> = {}): LadderAchievement {
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
    isNewCharacter: false,
    faction: 'Alliance',
    ...overrides
  };
}

describe('buildHighlightParts', () => {
  it('returns an empty array for an empty value', () => {
    expect(buildHighlightParts('', 'x')).toEqual([]);
  });

  it('returns a single non-match part when there is no query', () => {
    expect(buildHighlightParts('Larahh', '')).toEqual([{ text: 'Larahh', isMatch: false }]);
  });

  it('splits a case-insensitive match into highlighted and plain parts', () => {
    expect(buildHighlightParts('Larahh', 'rah')).toEqual([
      { text: 'La', isMatch: false },
      { text: 'rah', isMatch: true },
      { text: 'h', isMatch: false }
    ]);
  });

  it('preserves the original casing of the matched segment', () => {
    expect(buildHighlightParts('Larahh', 'LARAHH')).toEqual([{ text: 'Larahh', isMatch: true }]);
  });
});

describe('mapLadderPlayersToView', () => {
  it('assigns 1-based ranks in list order', () => {
    const views = mapLadderPlayersToView(
      [achievement({ name: 'A' }), achievement({ name: 'B' }), achievement({ name: 'C' })],
      ''
    );

    expect(views.map((view) => view.rank)).toEqual([1, 2, 3]);
    expect(views.map((view) => view.name)).toEqual(['A', 'B', 'C']);
  });

  it('maps the class id to the class icon key as a string', () => {
    const [view] = mapLadderPlayersToView([achievement({ class: 11 })], '');
    expect(view.classIcon).toBe('11');
  });

  it('defaults rare-achievement counts to zero when no summary is provided', () => {
    const [view] = mapLadderPlayersToView([achievement()], '');

    expect(view.gladiatorTitleCount).toBe(0);
    expect(view.gladiatorMountCount).toBe(0);
    expect(view.realmFirstCount).toBe(0);
    expect(view.isNewRareAchievementCharacter).toBe(false);
  });

  it('applies a matching rare-achievement summary by character key', () => {
    const summary: RareAchievementSummary = {
      gladiatorTitleCount: 2,
      gladiatorMountCount: 1,
      ratedBattlegroundHeroCount: 0,
      realmFirstCount: 3,
      achievementNames: []
    };

    const byCharacter = new Map<string, RareAchievementSummary>([['tauri::larahh', summary]]);
    const [view] = mapLadderPlayersToView([achievement({ name: 'Larahh', realm: 'Tauri' })], '', byCharacter);

    expect(view.gladiatorTitleCount).toBe(2);
    expect(view.gladiatorMountCount).toBe(1);
    expect(view.realmFirstCount).toBe(3);
  });

  it('flags a new character only when it has a qualifying rare achievement', () => {
    const summary: RareAchievementSummary = {
      gladiatorTitleCount: 1,
      gladiatorMountCount: 0,
      ratedBattlegroundHeroCount: 0,
      realmFirstCount: 0,
      achievementNames: []
    };
    const byCharacter = new Map<string, RareAchievementSummary>([['tauri::larahh', summary]]);

    const [withSummary] = mapLadderPlayersToView([achievement({ isNewCharacter: true })], '', byCharacter);
    const [withoutSummary] = mapLadderPlayersToView([achievement({ isNewCharacter: true })], '');

    expect(withSummary.isNewRareAchievementCharacter).toBe(true);
    expect(withoutSummary.isNewRareAchievementCharacter).toBe(false);
  });

  it('highlights search matches in both name and guild', () => {
    const [view] = mapLadderPlayersToView([achievement({ name: 'Larahh', guild: 'Outlaws' })], 'la');

    expect(view.nameParts.some((part) => part.isMatch)).toBe(true);
    expect(view.guildParts.some((part) => part.isMatch)).toBe(true);
  });
});
