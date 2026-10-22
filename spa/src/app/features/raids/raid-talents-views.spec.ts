import { describe, expect, it } from 'vitest';
import { RaidBoss, RaidSpec } from './raid-logs.types';
import { BossTalentShares, TalentBuild, TalentChoice, TalentPicks, TalentSample, TalentSwaps } from './raid-talents';
import {
  heatColor,
  talentBuildRows,
  talentHeatRows,
  talentInsights,
  talentMetaTitle,
  talentStats,
  talentSwapExplanation,
  talentTierViews
} from './raid-talents-views';

const talent = (id: number) => ({ id, name: `Talent ${id}`, icon: `icon_${id}` });
const ursoc: RaidBoss = { id: 1, slug: 'ursoc', name: 'Ursoc', shortName: 'Ursoc', index: 1, portrait: '' };
const fire: RaidSpec = { id: 63, classId: 8, name: 'Fire', role: 'dps' };
const tiers = [[talent(1), talent(2)], [talent(3), talent(4)]];

function choice(column: number, id: number, count: number, share: number, topShare: number): TalentChoice {
  return { column, talent: talent(id), count, share, topCount: 0, topShare };
}

const favoured = choice(0, 1, 6, .6, .8);
const settled = choice(0, 3, 9, .9, .9);
const picks: TalentPicks = {
  picks: 10,
  topPicks: 5,
  characters: 8,
  tiers: [
    { tier: 0, level: 15, none: 0, choices: [favoured, choice(1, 2, 4, .4, .2)], leader: favoured },
    { tier: 1, level: 30, none: 0, choices: [settled, choice(1, 4, 1, .1, .1)], leader: settled }
  ]
};
const swaps: TalentSwaps = { characters: 6, changed: 3, tiers: [1, 3] };
const fewSwaps: TalentSwaps = { characters: 4, changed: 1, tiers: [1, 0] };

const build = (talents: string, share: number): TalentBuild =>
  ({ talents, count: 0, share, topCount: 0, topShare: 0, characters: 0, best: {} as TalentSample });

const ursocShares: BossTalentShares = {
  boss: ursoc,
  picks: 20,
  shares: [[.7, .3], [.5, .5]],
  elsewhere: [[.2, .8], [.5, .5]],
  elsewherePicks: 40
};

describe('talentMetaTitle', () => {
  it('names the difficulty and the boss, or every boss', () => {
    expect(talentMetaTitle('Heroic', undefined)).toBe('Talent meta · Heroic · All bosses');
    expect(talentMetaTitle('Mythic', 'Ursoc')).toBe('Talent meta · Mythic · Ursoc');
  });
});

describe('talentStats', () => {
  it('counts characters, agreement, builds and top players', () => {
    expect(talentStats(picks, { picks: 10, builds: [build('01', .5), build('11', .3)] }, undefined)).toEqual([
      { label: 'Characters', value: '8', note: '10 boss kills counted' },
      { label: 'Agreement', value: '75%', note: 'Mixed' },
      { label: 'Builds seen', value: '2', note: 'most played: 50%' },
      { label: 'Top 10%', value: '5', note: 'best of each boss ranking' }
    ]);
  });

  it('speaks of the picked boss', () => {
    expect(talentStats(picks, { picks: 0, builds: [] }, ursoc).map(tile => tile.note))
      .toEqual(['killed Ursoc', 'Mixed', '-', 'best of the Ursoc ranking']);
  });
});

describe('talentTierViews', () => {
  it('marks the leader and the top players\' edge, with how many changed each level', () => {
    const views = talentTierViews(picks, swaps);

    expect(views.map(view => view.swapNote)).toEqual(['17% changed it', '50% changed it']);
    expect(views[0].choices.map(view => [view.isLeader, view.edge, view.edgeTone])).toEqual([
      [true, '+20', 'up'],
      [false, '−20', 'down']
    ]);
    expect(views[1].choices.map(view => view.edge)).toEqual([undefined, undefined]);
  });

  it('shows no edges below five top players and no swap notes below five characters', () => {
    expect(talentTierViews({ ...picks, topPicks: 4 }, swaps)[0].choices[0].edge).toBeUndefined();
    expect(talentTierViews(picks, fewSwaps)[0].swapNote).toBeUndefined();
  });
});

describe('talentSwapExplanation', () => {
  it('explains "changed it" for all bosses or the picked one', () => {
    expect(talentSwapExplanation(fewSwaps, undefined)).toBe('');
    expect(talentSwapExplanation(swaps, undefined))
      .toBe('"Changed it": of the 6 who killed two or more bosses, those who didn\'t play the same talent on all of them.');
    expect(talentSwapExplanation(swaps, ursoc))
      .toBe('"Changed it": of the 6 who also killed another boss, those who played something else on Ursoc than they usually do.');
  });
});

describe('talentInsights', () => {
  const sources = { picks, spec: fire, boss: undefined, bossShares: [ursocShares], tiers, swaps };

  it('finds what top players favour and avoid, the closest and most agreed levels, and swaps', () => {
    const insights = talentInsights(sources);

    expect(insights.map(insight => insight.id)).toEqual(['favoured', 'avoided', 'contested', 'settled', 'swaps']);
    expect(insights[0].text).toBe('80% of the top 10% take it at level 15, against 60% of everyone.');
    expect(insights[1].text).toBe('Only 20% of the top 10% take it, against 40% of everyone.');
    expect(insights[2].text).toBe('Talent 1 60% · Talent 2 40%');
    expect(insights[3].text).toBe('90% of Fire Mages take it at level 30.');
    expect(insights[4].text)
      .toBe('who killed two or more bosses didn\'t play one build on all of them. Level 30 changes the most (50%).');
  });

  it('adds what stands out on the picked boss', () => {
    const insights = talentInsights({ ...sources, boss: ursoc });

    expect(insights.find(insight => insight.id === 'boss')).toMatchObject({
      label: 'Picked for Ursoc',
      title: 'Talent 1',
      text: '70% take it on Ursoc, against 20% on the other bosses.'
    });
    expect(insights.find(insight => insight.id === 'swaps')?.label).toBe('Changed for Ursoc');
  });

  it('has nothing to say without a spec or picks', () => {
    expect(talentInsights({ ...sources, spec: undefined })).toEqual([]);
    expect(talentInsights({ ...sources, picks: { ...picks, picks: 0 } })).toEqual([]);
  });
});

describe('talentBuildRows', () => {
  it('ranks the ten most played builds against the most played one', () => {
    const rows = talentBuildRows([build('01', .5), build('10', .25)], tiers);

    expect(rows.map(row => [row.rank, row.meter])).toEqual([[1, 1], [2, .5]]);
    expect(rows[0].picked.map(picked => picked?.id)).toEqual([1, 4]);
    expect(talentBuildRows(Array.from({ length: 12 }, () => build('00', .1)), tiers)).toHaveLength(10);
  });
});

describe('talentHeatRows', () => {
  const empty: BossTalentShares = { ...ursocShares, picks: 0, shares: [], elsewhere: [] };

  it('lays out a row per talent with a cell per boss, flagging the notable picks', () => {
    const rows = talentHeatRows([ursocShares, empty], tiers, [15, 30]);

    expect(rows.map(row => [row.key, row.level, row.first, row.tierSize])).toEqual([
      ['0|0', 15, true, 2], ['0|1', 15, false, 2], ['1|0', 30, true, 2], ['1|1', 30, false, 2]
    ]);
    expect(rows[0].cells[0]).toEqual({
      share: .7,
      label: '70%',
      notable: true,
      thin: false,
      tip: 'Talent 1 on Ursoc',
      tipNote: '70% of 20 · 20% on the other bosses'
    });
    expect(rows[1].cells[0].notable).toBe(false);
    expect(rows[0].cells[1]).toMatchObject({ label: '-', thin: true, tipNote: 'Nobody played the spec here' });
  });
});

describe('heatColor', () => {
  it('shades from faint to strong gold with the share', () => {
    expect(heatColor(0)).toBe('rgba(247, 181, 0, 0.040)');
    expect(heatColor(1)).toBe('rgba(247, 181, 0, 0.540)');
  });
});
