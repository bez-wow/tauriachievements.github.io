import { RaidBossFile, RaidLogsIndexFile } from './raid-logs.types';
import { decodeBossFile, decodeIndex } from './raid-logs';

export const indexFile: RaidLogsIndexFile = {
  version: 1,
  generatedAt: '2026-10-12T16:00:00Z',
  raid: { id: 1520, slug: 'emerald-nightmare', name: 'The Emerald Nightmare' },
  difficulties: [
    { id: 17, slug: 'lfr', name: 'Looking For Raid', shortName: 'LFR', kills: 0 },
    { id: 15, slug: 'heroic', name: 'Heroic', shortName: 'HC', kills: 3 },
    { id: 16, slug: 'mythic', name: 'Mythic', shortName: 'M', kills: 2 }
  ],
  bosses: [
    { id: 1853, slug: 'nythendra', name: 'Nythendra' },
    { id: 1873, slug: 'ilgynoth', name: "Il'gynoth, The Heart of Corruption" }
  ],
  specs: [
    { id: 63, class: 8, name: 'Fire', role: 'dps' },
    { id: 64, class: 8, name: 'Frost', role: 'dps' },
    { id: 65, class: 2, name: 'Holy', role: 'healer' },
    { id: 66, class: 2, name: 'Protection', role: 'tank' }
  ],
  guilds: [
    ['Miracle', 'Evermoon', 1, 3676],
    ['Outlaws', 'Tauri', 0, 602],
    ['', 'Evermoon', 1, 8489]
  ],
  logs: [
    ['Tauri', 10, 0, 16, 1_000, 300_000, 0, 1, 2, 3, 20],
    ['Tauri', 11, 0, 16, 2_000, 280_000, 1, 0, 0, 1, 20],
    ['Tauri', 12, 1, 15, 3_000, 400_000, 1, 0, 0, 0, 20],
    ['Tauri', 13, 0, 15, 4_000, 200_000, 2, 1, 0, 0, 20],
    ['WoD', 10, 0, 15, 5_000, 250_000, -1, 1, 0, 0, 14]
  ],
  previousGeneratedAt: '2026-10-11T16:00:00Z',
  newLogs: [['WoD', 10]],
  top: [{ boss: 'nythendra', difficulty: 'mythic', dps: ['Sósa', 'Evermoon', 8, 64, 700_303, 'Tauri', 10], hps: null }],
  items: [[139236, 'Grubby Silver Ring', 4, 'inv_70_raid_ring1b']]
};

export const index = decodeIndex(indexFile);
export const [nythendra] = index.bosses;
export const mythic = index.difficulties[2];

export const bossFile: RaidBossFile = {
  version: 1,
  boss: 'nythendra',
  difficulty: 'mythic',
  guilds: [['Miracle', 'Evermoon', 1, 3676], ['Outlaws', 'Tauri', 0, 602]],
  players: [
    ['Sósa', 'Evermoon', 8, 10, 0, 'Competence Optional'],
    ['Kael', 'Tauri', 8, 1, 0, ''],
    ['Light', 'Evermoon', 2, 10, 1, 'Miracle']
  ],
  logs: [
    ['Tauri', 10, 1_000, 300_000, 0, 1, 2, 3, 1, [
      [0, 64, 870, 150_000_000, 0, 0, 0, 1, 0, 0],
      [1, 63, 871, 120_000_000, 0, 0, 0, 1, 0, 0],
      [2, 65, 872, 3_000_000, 90_000_000, 30_000_000, 5, 1, 0, 4]
    ], [139236]],
    ['Tauri', 11, 2_000, 280_000, 1, 0, 0, 1, 0, [
      [0, 63, 875, 140_000_000, 0, 0, 0, 1, 0, 0],
      [1, 63, 876, 168_000_000, 0, 0, 0, 1, 0, 0],
      [2, 66, 877, 56_000_000, 1_000_000, 0, 0, 1, 0, 0]
    ], []]
  ]
};

export const kills = decodeBossFile(bossFile, nythendra, mythic, index.specs);
