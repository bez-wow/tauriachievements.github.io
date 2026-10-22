import { describe, expect, it } from 'vitest';
import { MythicPlusDungeon, MythicPlusIndex, MythicPlusMember, MythicPlusRun } from './mythic-plus';
import {
  emptyLeaderboardMessage,
  filterRuns,
  memberFilter,
  realmFilterOptions,
  runsInScope,
  scanStandingChanges
} from './mythic-plus-leaderboard';

function member(name: string, overrides: Partial<MythicPlusMember> = {}): MythicPlusMember {
  return { name, realm: 'Evermoon', class: 10, race: 1, gender: 0, spec: 'Windwalker', role: 'dps', ...overrides };
}

function run(id: string, dungeon: string, score: number, completedAt: string, roster: MythicPlusMember[] = []): MythicPlusRun {
  return { id, dungeon, keyLevel: 15, clearTimeSeconds: 1500, score, completedAt, affixes: [], roster };
}

function dungeon(id: string, name: string): MythicPlusDungeon {
  return { id, challengeId: 0, shortName: id.toUpperCase(), name, timerSeconds: 1800, icon: '', runCount: 0, bestScore: 0 };
}

const cos = dungeon('cos', 'Court of Stars');
const brh = dungeon('brh', 'Black Rook Hold');

describe('realmFilterOptions', () => {
  it('lists the realms with the most players first, by their URL slug', () => {
    expect(realmFilterOptions([
      ['A', 'Tauri', '', 1, 1, 0],
      ['B', 'Evermoon', '', 1, 1, 0],
      ['C', 'Evermoon', '', 1, 1, 0]
    ])).toEqual([
      { value: undefined, label: 'All realms' },
      { value: 'evermoon', label: 'Evermoon' },
      { value: 'tauri', label: 'Tauri' }
    ]);
  });
});

describe('memberFilter', () => {
  it('keeps every member when nothing is picked', () => {
    expect(memberFilter({})).toBeUndefined();
  });

  it('matches realm, class, spec and role together, and a spec only within its class', () => {
    const include = memberFilter({ realm: 'evermoon', classId: 10, spec: 'Brewmaster', role: 'tank' });
    expect(include?.(member('Pretz', { spec: 'Brewmaster', role: 'tank' }))).toBe(true);
    expect(include?.(member('Pretz', { spec: 'Brewmaster', role: 'tank', realm: 'Tauri' }))).toBe(false);
    expect(include?.(member('Maja', { role: 'tank' }))).toBe(false);
    expect(memberFilter({ spec: 'Brewmaster' })).toBeUndefined();
  });
});

describe('runsInScope', () => {
  const loaded = new Map([
    ['cos', [run('a', 'cos', 150, '2026-10-01T20:00:00Z'), run('b', 'cos', 180, '2026-10-20T20:00:00Z')]],
    ['brh', [run('c', 'brh', 170, '2026-10-21T20:00:00Z')]]
  ]);

  it('ranks one dungeon as soon as its file is in', () => {
    expect(runsInScope(loaded, [cos, brh], cos, undefined)?.map(entry => entry.id)).toEqual(['b', 'a']);
  });

  it('waits for every dungeon before ranking them all', () => {
    expect(runsInScope(new Map([['cos', []]]), [cos, brh], undefined, undefined)).toBeUndefined();
    expect(runsInScope(loaded, [cos, brh], undefined, undefined)?.map(entry => entry.id)).toEqual(['b', 'c', 'a']);
  });

  it('keeps only the runs since the start of the week', () => {
    const since = Date.parse('2026-10-19T00:00:00Z');
    expect(runsInScope(loaded, [cos, brh], undefined, since)?.map(entry => entry.id)).toEqual(['b', 'c']);
  });
});

describe('filterRuns', () => {
  const ranked = [
    { run: run('a', 'cos', 180, '2026-10-01T20:00:00Z', [member('Exa')]), rank: 1 },
    { run: run('b', 'cos', 170, '2026-10-20T20:00:00Z', [member('Sósa')]), rank: 2 },
    { run: run('c', 'cos', 160, '2026-10-20T20:00:00Z', [member('Exa', { realm: 'Tauri' })]), rank: 3 }
  ];

  it('picks out a character exactly, or searches names ignoring accents', () => {
    expect(filterRuns(ranked, 'Exa|Evermoon', 'sosa', 'best').map(entry => entry.rank)).toEqual([1]);
    expect(filterRuns(ranked, undefined, 'sosa', 'best').map(entry => entry.rank)).toEqual([2]);
    expect(filterRuns(ranked, undefined, '  ', 'best')).toBe(ranked);
  });

  it('orders by finish time for the latest runs, keeping rank order on a tie', () => {
    expect(filterRuns(ranked, undefined, '', 'latest').map(entry => entry.rank)).toEqual([2, 3, 1]);
  });
});

describe('scanStandingChanges', () => {
  const index: MythicPlusIndex = {
    version: 1,
    season: { id: 'legion-s1', name: 'Legion Season 1', raid: 'Emerald Nightmare', startDate: '2026-09-16' },
    dungeons: [],
    affixes: [],
    specs: [],
    previousGeneratedAt: '2026-10-07T09:30:00Z',
    players: [['Exkeito', 'Evermoon', '', 11, 4, 0], ['Napim', 'Tauri', '', 11, 4, 0]],
    standings: [[196, 1, 4.5, 2], [160, 2]]
  };

  it('maps each player who moved since the last scan to their change', () => {
    expect([...scanStandingChanges(index)]).toEqual([['Exkeito|Evermoon', { score: 4.5, rank: 2 }]]);
  });

  it('has nothing when the export has no complete earlier standings', () => {
    expect(scanStandingChanges({ ...index, previousGeneratedAt: undefined }).size).toBe(0);
    expect(scanStandingChanges({ ...index, standings: index.standings?.slice(1) }).size).toBe(0);
    expect(scanStandingChanges(undefined).size).toBe(0);
  });
});

describe('emptyLeaderboardMessage', () => {
  const base = { view: 'runs' as const, period: 'season' as const, query: '' };

  it('names the picked character first, then the search', () => {
    expect(emptyLeaderboardMessage({ ...base, character: { name: 'Napim', realm: 'Tauri' }, query: 'exa', dungeon: cos }))
      .toBe('No runs with Napim (Tauri) in Court of Stars.');
    expect(emptyLeaderboardMessage({ ...base, view: 'players', query: ' exa ' })).toBe('No players matching "exa".');
    expect(emptyLeaderboardMessage({ ...base, query: 'exa' })).toBe('No runs with a player matching "exa".');
  });

  it('describes the players filters', () => {
    const players = { ...base, view: 'players' as const };
    expect(emptyLeaderboardMessage({ ...players, classId: 10, spec: 'Brewmaster', realmName: 'Tauri' }))
      .toBe('No Brewmaster Monk on Tauri has a run yet.');
    expect(emptyLeaderboardMessage({ ...players, role: 'dps', dungeon: cos })).toBe('No DPS player has a run in Court of Stars yet.');
    expect(emptyLeaderboardMessage({ ...players, role: 'healer' })).toBe('No healer has a run yet.');
  });

  it('falls back to the period and the dungeon', () => {
    expect(emptyLeaderboardMessage({ ...base, period: 'week' })).toBe('No runs yet this week.');
    expect(emptyLeaderboardMessage({ ...base, period: 'week', dungeon: cos })).toBe('No Court of Stars runs yet this week.');
    expect(emptyLeaderboardMessage(base)).toBe('No runs recorded yet this season.');
    expect(emptyLeaderboardMessage({ ...base, dungeon: cos })).toBe('No Court of Stars runs recorded yet.');
  });
});
