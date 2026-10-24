import { describe, expect, it } from 'vitest';
import {
  decodeBossFile,
  decodeGenders,
  decodeIndex,
  decodeTalentTooltips,
  decodeTalents,
  formerCharactersOf,
  memberTalents,
  bossShortName,
  bossesInKillOrder,
  defaultDifficulty
} from './raid-logs';
import { indexFile, index, nythendra, mythic, bossFile, kills } from './raid-logs.fixture';

describe('bossShortName', () => {
  it('cuts the name at its first comma, except for the bosses with a shorter name of their own', () => {
    expect(bossShortName({ slug: 'ilgynoth', name: "Il'gynoth, The Heart of Corruption" })).toBe("Il'gynoth");
    expect(bossShortName({ slug: 'ursoc', name: 'Ursoc' })).toBe('Ursoc');
    expect(bossShortName({ slug: 'elerethe-renferal', name: 'Elerethe Renferal' })).toBe('Elerethe');
    expect(bossShortName({ slug: 'dragons-of-nightmare', name: 'Dragons of Nightmare' })).toBe('Dragons');
  });
});

describe('decodeIndex', () => {
  it('reads kills, guilds, the top performers and the loot', () => {
    expect(index.generatedAt?.toISOString()).toBe('2026-10-12T16:00:00.000Z');
    expect(index.bosses.map(boss => boss.shortName)).toEqual(['Nythendra', "Il'gynoth"]);
    expect(index.kills).toHaveLength(5);
    expect(index.kills[0]).toMatchObject({ realm: 'Tauri', logId: 10, killedAt: 1_000_000, fightMs: 300_000, wipes: 2, deaths: 3 });
    expect(index.kills[0].guild?.name).toBe('Miracle');
    expect(index.kills[4].guild).toBeUndefined();
    expect(index.top.get('nythendra|mythic')?.dps).toMatchObject({ name: 'Sósa', perSecond: 700_303, logId: 10 });
    expect(index.top.get('nythendra|mythic')?.dps?.spec?.name).toBe('Frost');
    expect(index.items.get(139236)?.name).toBe('Grubby Silver Ring');
  });

  it('reads the kills added since the previous export, by logKey', () => {
    expect(index.previousGeneratedAt?.toISOString()).toBe('2026-10-11T16:00:00.000Z');
    expect([...index.newLogs]).toEqual(['wod/10']);

    const first = decodeIndex({ ...indexFile, previousGeneratedAt: undefined, newLogs: undefined });
    expect(first.previousGeneratedAt).toBeUndefined();
    expect(first.newLogs.size).toBe(0);
  });

  it('gives specs the Legion spec icons', () => {
    expect(index.specs.get(64)?.icon).toContain('legion-static.tauri.hu');
  });

  it('finds the earlier classes of a name, by realm slug and name in any case', () => {
    const withFormer = decodeIndex({ ...indexFile, formerCharacters: [['Chalz', 'Evermoon', 5, [8, 9]]] });
    expect(formerCharactersOf(withFormer, 'evermoon', 'Chalz')).toEqual({ classId: 5, formerClassIds: [8, 9] });
    expect(formerCharactersOf(withFormer, 'evermoon', 'chalz')?.classId).toBe(5);
    expect(formerCharactersOf(withFormer, 'tauri', 'Chalz')).toBeUndefined();
    expect(index.formerCharacters.size).toBe(0);
  });
});

describe('decodeBossFile', () => {
  it('works out damage and healing (with absorbs) per second', () => {
    const [first] = kills;
    expect(first.members).toHaveLength(3);
    expect(first.members[0].dps).toBe(500_000);
    expect(first.members[2].hps).toBe(400_000);
    expect(first.items).toEqual([139236]);
    expect(first.guild?.name).toBe('Miracle');
  });

  it('shares one character object between the kills', () => {
    expect(kills[0].members[0].character).toBe(kills[1].members[0].character);
  });

  it('marks the row of a former character with the name', () => {
    const [kill] = decodeBossFile({
      ...bossFile,
      players: [...bossFile.players.slice(0, 2), ['Light', 'Evermoon', 2, 10, 1, 'Miracle', 1]]
    }, nythendra, mythic, index.specs);
    expect(kill.members.map(member => member.character.former)).toEqual([false, false, true]);
  });

  it('reads no talents or trinkets from a version 1 file', () => {
    expect(kills[0].members[0]).toMatchObject({ talents: '', trinkets: [] });
  });

  it('reads talents and the trinkets worn, from the trinket table', () => {
    const [kill] = decodeBossFile({
      ...bossFile,
      version: 2,
      trinkets: [
        [127842, 835, 'Infernal Alchemist Stone', 4, 'inv_alchemy_70_trinket'],
        [133644, 820, 'Memento of Angerboda', 3, 'inv_jewelry_trinket_05']
      ],
      logs: [['Tauri', 10, 1_000, 300_000, 0, 1, 2, 3, 1, [
        [0, 64, 870, 150_000_000, 0, 0, 0, 1, 0, 0, '1022.20', [0, 1]],
        [1, 63, 871, 120_000_000, 0, 0, 0, 1, 0, 0, '', [1]]
      ], []]]
    }, nythendra, mythic, index.specs);

    const [frost, fire] = kill.members;
    expect(frost.talents).toBe('1022.20');
    expect(frost.trinkets.map(trinket => `${trinket.name} ${trinket.itemLevel}`)).toEqual(['Infernal Alchemist Stone 835', 'Memento of Angerboda 820']);
    expect(fire.trinkets[0]).toBe(frost.trinkets[1]);
  });
});

describe('memberTalents', () => {
  const table = decodeTalents({
    version: 2,
    specs: [[64, [
      [[205022, 'Ray of Frost', 'ray'], [205024, 'Lonely Winter', 'winter'], [205020, 'Bone Chilling', 'bone']],
      [[212653, 'Shimmer', 'shimmer'], [108839, 'Ice Floes', 'floes'], null]
    ]]]
  });
  const frost = index.specs.get(64);

  it('names the talent picked on each tier, nothing for an empty tier or a missing choice', () => {
    expect(memberTalents({ spec: frost, talents: '1.' }, table).map(talent => talent?.name)).toEqual(['Lonely Winter', undefined]);
    expect(memberTalents({ spec: frost, talents: '22' }, table).map(talent => talent?.name)).toEqual(['Bone Chilling', undefined]);
    expect(memberTalents({ spec: frost, talents: '01' }, table)[1]).toEqual({ id: 108839, name: 'Ice Floes', icon: 'floes' });
  });

  it('has nothing without talents or a table for the spec', () => {
    expect(memberTalents({ spec: frost, talents: '' }, table)).toEqual([]);
    expect(memberTalents({ spec: index.specs.get(63), talents: '01' }, table)).toEqual([]);
    expect(memberTalents({ spec: undefined, talents: '01' }, table)).toEqual([]);
  });
});

describe('decodeTalentTooltips', () => {
  it('joins the details into one line and keeps the description by spell', () => {
    const tooltips = decodeTalentTooltips({
      version: 1,
      spells: [
        [123986, ['40 yd range', '1 sec cast', '30 sec cooldown'], 'Hurls a torrent of Chi energy.'],
        [202297, [], '']
      ]
    });

    expect(tooltips.get(123986)).toEqual({ details: '40 yd range · 1 sec cast · 30 sec cooldown', description: 'Hurls a torrent of Chi energy.' });
    expect(tooltips.get(202297)).toEqual({ details: '', description: '' });
    expect(tooltips.get(1)).toBeUndefined();
  });
});

describe('decodeGenders', () => {
  it('keys the corrected genders like characterKey', () => {
    const genders = decodeGenders({ v: 1, female: { Evermoon: ['Sósa'], WoD: ['Ama'] }, male: { Tauri: ['Kael'] } });
    expect([...genders.entries()]).toEqual([['tauri/Kael', 0], ['evermoon/Sósa', 1], ['wod/Ama', 1]]);
  });
});

describe('bossesInKillOrder', () => {
  it('puts the bosses in the order raiders kill them', () => {
    const slugs = ['nythendra', 'ilgynoth', 'elerethe-renferal', 'ursoc', 'dragons-of-nightmare', 'cenarius', 'xavius', 'new-boss'];
    const bosses = slugs.map((slug, bossIndex) => ({ slug, index: bossIndex }));
    expect(bossesInKillOrder(bosses).map(boss => boss.slug)).toEqual(
      ['nythendra', 'ursoc', 'dragons-of-nightmare', 'elerethe-renferal', 'ilgynoth', 'cenarius', 'xavius', 'new-boss']);
  });
});

describe('defaultDifficulty', () => {
  it('opens on the hardest difficulty with a kill', () => {
    expect(defaultDifficulty(index.difficulties)?.slug).toBe('mythic');
    expect(defaultDifficulty(index.difficulties.map(difficulty => ({ ...difficulty, kills: difficulty.id === 15 ? 1 : 0 })))?.slug).toBe('heroic');
  });
});
