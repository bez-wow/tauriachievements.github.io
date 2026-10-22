import { describe, expect, it } from 'vitest';
import {
  RatedBattlegroundMatch,
  RatedBattlegroundMember,
  buildRatedBattlegroundAnalytics,
  buildTeamSummary,
  getObjectives,
  normalizeRatedBattlegrounds
} from './rated-battleground-stats';

function member(overrides: Partial<RatedBattlegroundMember> = {}): RatedBattlegroundMember {
  return {
    guid: 1,
    'character-minimal-data': {
      charname: 'Player', race: 1, class: 1, gender: 0, guildname: 'Guild',
      played_time: 86_400, achievements: 100, achievements_total: 200, level: 110, faction: 0
    },
    realmid: 9,
    realmName: '[EN] Evermoon',
    side: 0,
    killing_blows: 2,
    deaths: 1,
    damage_done: 100,
    healing_done: 50,
    damage_taken: 75,
    healing_taken: 40,
    bg_data0: 1,
    bg_data1: 2,
    bg_data2: 0,
    bg_data3: 0,
    bg_data4: 0,
    personal_rating: 1000,
    personal_rating_change: 10,
    mmr_rating: 1500,
    mmr_rating_change: 20,
    israndom: false,
    honor: 30,
    specid: 71,
    ...overrides
  };
}

function match(overrides: Partial<RatedBattlegroundMatch> = {}): RatedBattlegroundMatch {
  return {
    expansion: 6,
    dataUrlPrefix: 'legion-',
    matchid: 10,
    mapid: 489,
    mapname: 'Warsong Gulch',
    winner: 1,
    bgtype: 0,
    isranked: true,
    losermmravg: 1400,
    winnermmravg: 1500,
    loserpersonalavg: 900,
    winnerpersonalavg: 1000,
    starttime: 1_789_600_000,
    length: 600_000,
    side0: 1,
    side1: 1,
    members: [member(), member({ guid: 2, side: 1 })],
    ...overrides
  };
}

describe('normalizeRatedBattlegrounds', () => {
  it('keeps complete ranked matches and orders them chronologically', () => {
    const later = match({ matchid: 12, starttime: 1_789_600_500 });
    const earlier = match({ matchid: 11, starttime: 1_789_600_100 });
    const unranked = match({ matchid: 13, isranked: false });

    expect(normalizeRatedBattlegrounds([later, unranked, earlier]).map(entry => entry.matchid))
      .toEqual([11, 12]);
  });
});

describe('buildRatedBattlegroundAnalytics', () => {
  it('aggregates repeat players, records, throughput, maps and durations', () => {
    const first = match();
    const second = match({
      matchid: 11,
      mapid: 998,
      mapname: 'Temple of Kotmogu',
      winner: 0,
      starttime: first.starttime + 86_400,
      length: 900_000,
      members: [member({ damage_done: 300 }), member({ guid: 3, side: 1 })]
    });

    const analytics = buildRatedBattlegroundAnalytics([first, second]);
    const repeatPlayer = analytics.players.find(player => player.guid === 1);

    expect(analytics.matches).toBe(2);
    expect(analytics.uniquePlayers).toBe(3);
    expect(analytics.maps).toHaveLength(2);
    expect(analytics.activity).toHaveLength(2);
    expect(analytics.averageDurationMs).toBe(750_000);
    expect(repeatPlayer).toMatchObject({ games: 2, wins: 1, losses: 1, damageDone: 400 });
  });
});

describe('match details', () => {
  it('maps winner-specific averages and named objective columns', () => {
    const source = match();
    const winner = buildTeamSummary(source, 0);
    const loser = buildTeamSummary(source, 1);

    expect(winner).toMatchObject({ won: true, averageMmr: 1500, averagePersonalRating: 1000 });
    expect(loser).toMatchObject({ won: false, averageMmr: 1400, averagePersonalRating: 900 });
    expect(getObjectives(source, source.members[0])).toEqual([
      { label: 'Flags captured', value: 1 },
      { label: 'Flags returned', value: 2 }
    ]);
  });
});
