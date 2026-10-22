import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerSnapshot } from './character.model';
import { readPlayerSnapshot } from './player-snapshot';

function snapshot(columns: string[], rows: (string | number)[][]): PlayerSnapshot {
  return {
    v: 4,
    c: columns,
    k: {
      achievementPoints: ['achievementPoints', 'honorableKills'],
      honorableKills: ['honorableKills', 'achievementPoints'],
      achievementsTotal: ['achievementsTotal', 'achievementPoints', 'honorableKills'],
      playedTime: ['playedTime', 'achievementPoints', 'honorableKills'],
      appearanceCount: ['appearanceCount', 'achievementPoints', 'honorableKills'],
      ilvl: ['ilvl', 'achievementPoints', 'honorableKills']
    },
    r: ['Evermoon', 'Tauri'],
    f: ['Alliance', 'Horde', 'Neutral'],
    t: rows.length,
    p: rows
  };
}

describe('readPlayerSnapshot', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads values by column name, whatever the column order', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const forward = snapshot(['name', 'realm', 'faction', 'achievementPoints'], [['Larahh', 1, 0, 19325]]);
    const reversed = snapshot(['achievementPoints', 'faction', 'realm', 'name'], [[19325, 0, 1, 'Larahh']]);

    for (const file of [forward, reversed]) {
      const [player] = readPlayerSnapshot(file);
      expect(player.name).toBe('Larahh');
      expect(player.realm).toBe('Tauri');
      expect(player.faction).toBe('Alliance');
      expect(player.achievementPoints).toBe(19325);
    }
  });

  it('turns the 0/1 new-character flag into a boolean and keeps Neutral', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const [player] = readPlayerSnapshot(
      snapshot(['name', 'realm', 'faction', 'isNewCharacter'], [['Panda', 0, 2, 1]])
    );

    expect(player.isNewCharacter).toBe(true);
    expect(player.faction).toBe('Neutral');
  });

  it('turns played time and its delta from minutes into seconds', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const [player] = readPlayerSnapshot(
      snapshot(['name', 'realm', 'playedTime', 'playedTimeDelta'], [['Shiny', 1, 1444, -90]])
    );

    expect(player.playedTime).toBe(1444 * 60);
    expect(player.playedTimeDelta).toBe(-90 * 60);
  });

  it('defaults missing columns and reports them once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const [player] = readPlayerSnapshot(snapshot(['name', 'realm'], [['Old', 0]]));

    expect(player.playedTime).toBe(0);
    expect(player.guild).toBe('');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('skips rows without a name or a known realm', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const players = readPlayerSnapshot(snapshot(['name', 'realm'], [['', 0], ['Lost', 9], ['Kept', 1]]));

    expect(players.map((player) => player.name)).toEqual(['Kept']);
  });
});
