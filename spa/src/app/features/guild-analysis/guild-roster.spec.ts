import { describe, expect, it } from 'vitest';
import { GuildAnalysisPlayer } from './guild-analysis';
import {
  RosterFilters,
  combatRole,
  countClasses,
  defaultSortDirection,
  guildRankNames,
  guildRankOrder,
  isSortColumn,
  legendaryTooltipHtml,
  parseGuildTimestamp,
  rosterRows,
  timeZoneLabelOf,
  timeZoneOffset
} from './guild-roster';

function player(name: string, overrides: Partial<GuildAnalysisPlayer> = {}): GuildAnalysisPlayer {
  return {
    name,
    race: 1,
    gender: 0,
    class: 1,
    playedTime: 0,
    achievementPoints: 0,
    artifactRelics: 0,
    artifactTraits: 0,
    itemLevel: 900,
    ...overrides
  };
}

const allPlayers: RosterFilters = { classId: null, guildRank: '', combatRole: '' };

describe('sorting choices', () => {
  it('knows the sortable columns and sorts names and ranks A to Z, numbers high to low', () => {
    expect(isSortColumn('itemLevel')).toBe(true);
    expect(isSortColumn('playedTime')).toBe(false);
    expect(defaultSortDirection('name')).toBe('asc');
    expect(defaultSortDirection('guildRankName')).toBe('asc');
    expect(defaultSortDirection('artifactTraits')).toBe('desc');
  });
});

describe('countClasses', () => {
  it('counts each class against the largest, most first', () => {
    const counts = countClasses([
      player('A', { class: 8 }),
      player('B', { class: 8 }),
      player('C', { class: 1 }),
      player('D', { class: 99 })
    ]);

    expect(counts).toEqual([
      { id: 8, name: 'Mage', count: 2, percentage: 100 },
      { id: 1, name: 'Warrior', count: 1, percentage: 50 }
    ]);
  });
});

describe('guildRankNames', () => {
  it('follows the exported rank order, in the roster\'s spelling, then adds unlisted ranks A to Z', () => {
    const players = [player('A', { guildRankName: 'raider' }), player('B', { guildRankName: 'Zealot' }), player('C', { guildRankName: 'Alt' })];

    expect(guildRankNames(players, [{ order: 1, name: 'Raider' }, { order: 0, name: 'Guild Master' }]))
      .toEqual(['Guild Master', 'raider', 'Alt', 'Zealot']);
  });

  it('falls back to the usual rank order when the export has none', () => {
    const players = ['Trial', 'Banker', 'Officer', 'Guild Master'].map(rank => player(rank, { guildRankName: rank }));

    expect(guildRankNames(players, [])).toEqual(['Guild Master', 'Officer', 'Trial', 'Banker']);
  });
});

describe('combatRole', () => {
  it('reads the role from the class and specialization', () => {
    expect(combatRole(player('A', { class: 11, specialization: 'Balance' }))).toBe('Ranged');
    expect(combatRole(player('B', { class: 10, specialization: 'Mistweaver' }))).toBe('Heal');
    expect(combatRole(player('C', { class: 6, specialization: 'Blood' }))).toBe('Tank');
    expect(combatRole(player('D', { class: 3, specialization: 'Survival' }))).toBe('Melee');
    expect(combatRole(player('E', { class: 8, specialization: ' ' }))).toBeUndefined();
  });
});

describe('rosterRows', () => {
  const roster = [
    player('Bob', { class: 8, specialization: 'Fire', artifactTraits: 40, guildRankName: 'Raider', artifactKnowledge: null }),
    player('Ann', { class: 1, specialization: 'Protection', artifactTraits: 40, guildRankName: 'Officer', artifactKnowledge: 25 }),
    player('Cid', { class: 8, specialization: 'Frost', artifactTraits: 52, guildRankName: 'raider', artifactKnowledge: 20 })
  ];
  const order = guildRankOrder([]);
  const names = (rows: GuildAnalysisPlayer[]) => rows.map(row => row.name);

  it('sorts by the column, breaking ties by name and putting missing values last', () => {
    expect(names(rosterRows(roster, allPlayers, 'artifactTraits', 'desc', order))).toEqual(['Cid', 'Ann', 'Bob']);
    expect(names(rosterRows(roster, allPlayers, 'artifactKnowledge', 'asc', order))).toEqual(['Cid', 'Ann', 'Bob']);
    expect(names(rosterRows(roster, allPlayers, 'guildRankName', 'asc', order))).toEqual(['Ann', 'Bob', 'Cid']);
  });

  it('filters by class, rank ignoring case, and combat role', () => {
    expect(names(rosterRows(roster, { ...allPlayers, classId: 8 }, 'name', 'asc', order))).toEqual(['Bob', 'Cid']);
    expect(names(rosterRows(roster, { ...allPlayers, guildRank: 'RAIDER' }, 'name', 'asc', order))).toEqual(['Bob', 'Cid']);
    expect(names(rosterRows(roster, { ...allPlayers, combatRole: 'Tank' }, 'name', 'asc', order))).toEqual(['Ann']);
  });
});

describe('guild timestamps', () => {
  it('reads the exporter\'s local time and zone', () => {
    expect(parseGuildTimestamp('2026-10-22 14:00:00 CEST')?.toISOString()).toBe('2026-10-22T12:00:00.000Z');
    expect(parseGuildTimestamp('2026-01-05 09:30:00 CET')?.toISOString()).toBe('2026-01-05T08:30:00.000Z');
    expect(parseGuildTimestamp('yesterday')).toBeUndefined();
    expect(timeZoneLabelOf('2026-10-22 14:00:00 CEST')).toBe('CEST');
    expect(timeZoneLabelOf('')).toBe('Local time');
    expect(timeZoneOffset('CEST')).toBe('+0200');
    expect(timeZoneOffset('Local time')).toBeUndefined();
  });
});

describe('legendaryTooltipHtml', () => {
  it('drops the item level note, durability, level requirement and sell price', () => {
    const html = '<td>Ring&nbsp;<small>ilvl</small><br />Durability 1 / 1<br />Requires Level 110<br />Effect<br>Sell Price: 1g</td>';

    expect(legendaryTooltipHtml(html)).toBe('<td>Ring<br />Effect</td>');
  });
});
