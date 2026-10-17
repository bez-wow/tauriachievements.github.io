import { describe, expect, it } from 'vitest';
import { ArenaPlayer, getGladiatorCutoff, sortArenaRows, toArenaRows } from './arena-games';

function player(name: string, wins: number, losses: number, rating: number): ArenaPlayer {
  return { guid: 1, realm: 'Evermoon', name, class: 1, games: wins + losses, wins, losses, rating };
}

describe('toArenaRows', () => {
  it('keeps characters with at least the threshold of games and adds their win rate', () => {
    const rows = toArenaRows(
      [player('FortyNine', 25, 24, 1500), player('Fifty', 25, 25, 1500), player('Sixty', 45, 15, 1800)],
      50
    );

    expect(rows.map(row => [row.name, row.winRate])).toEqual([['Fifty', 0.5], ['Sixty', 0.75]]);
  });
});

describe('sortArenaRows', () => {
  const rows = toArenaRows(
    [
      player('Bravo', 40, 20, 2100),
      player('Alpha', 30, 30, 2100),
      player('Delta', 60, 40, 1700),
      player('Charlie', 31, 29, 1900)
    ],
    50
  );
  const names = (key: Parameters<typeof sortArenaRows>[1], direction: 'asc' | 'desc') =>
    sortArenaRows(rows, key, direction).map(row => row.name);

  it('sorts by any column, most first or least first', () => {
    expect(names('games', 'desc')).toEqual(['Delta', 'Alpha', 'Bravo', 'Charlie']);
    expect(names('losses', 'asc')).toEqual(['Bravo', 'Charlie', 'Alpha', 'Delta']);
    expect(names('winRate', 'desc')).toEqual(['Bravo', 'Delta', 'Charlie', 'Alpha']);
  });

  it('breaks ties by most games, then name', () => {
    expect(names('rating', 'desc')).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    expect(names('rating', 'asc')).toEqual(['Delta', 'Charlie', 'Alpha', 'Bravo']);
  });

  it('leaves the input order alone', () => {
    sortArenaRows(rows, 'rating', 'asc');

    expect(rows.map(row => row.name)).toEqual(['Bravo', 'Alpha', 'Delta', 'Charlie']);
  });
});

describe('getGladiatorCutoff', () => {
  const field = (ratings: number[]) =>
    toArenaRows(ratings.map((rating, index) => player(`P${index}`, 30, 30, rating)), 50);

  it('covers 0.6% of the active players, rounded down', () => {
    const ratings = Array.from({ length: 500 }, (_, index) => 3000 - index);

    expect(getGladiatorCutoff(field(ratings))).toEqual({ places: 3, rating: 2998 });
  });

  it('keeps at least one place for a small field', () => {
    expect(getGladiatorCutoff(field([1800, 2400, 2100]))).toEqual({ places: 1, rating: 2400 });
  });

  it('has no cutoff without players', () => {
    expect(getGladiatorCutoff([])).toBeUndefined();
  });
});
