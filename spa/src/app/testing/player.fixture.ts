import { Player } from '../models/character.model';

/** A complete Player with neutral values; specs override only the fields they care about. */
export function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    name: 'Anon',
    race: 1,
    gender: 0,
    class: 2,
    realm: 'Tauri',
    guild: 'Guild',
    faction: 'Alliance',
    achievementPoints: 0,
    honorableKills: 0,
    appearanceCount: 0,
    achievementsTotal: 0,
    playedTime: 0,
    ilvl: 0,
    level10Day: 0,
    isNewCharacter: false,
    achievementPointsDelta: 0,
    achievementRankDelta: 0,
    honorableKillsDelta: 0,
    honorableKillsRankDelta: 0,
    appearanceCountDelta: 0,
    appearanceRankDelta: 0,
    achievementsTotalDelta: 0,
    achievementsTotalRankDelta: 0,
    playedTimeDelta: 0,
    playedTimeRankDelta: 0,
    ...overrides
  };
}
