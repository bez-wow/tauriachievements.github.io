import { Faction, Player, PlayerSnapshot } from './character.model';

type ColumnName = keyof Player;

const FACTIONS: ReadonlySet<string> = new Set<Faction>(['Alliance', 'Horde', 'Neutral']);

// The file stores played time in whole minutes to keep it small; the app works in seconds.
const SECONDS_PER_MINUTE = 60;

/**
 * Reads a players file into `Player` objects by column name. Because the file names its own
 * columns, a column the build adds, drops or moves can never land in the wrong field; a
 * column this reader expects but the file lacks reads as 0 / '' and is reported once.
 */
export function readPlayerSnapshot(snapshot: PlayerSnapshot): Player[] {
  if (!snapshot || !Array.isArray(snapshot.c) || !Array.isArray(snapshot.p)) {
    return [];
  }

  const columnIndex = new Map(snapshot.c.map((name, index) => [name, index]));
  const missing: string[] = [];
  const column = (name: ColumnName): number => {
    const index = columnIndex.get(name);
    if (index === undefined) {
      missing.push(name);
      return -1;
    }

    return index;
  };

  const name = column('name');
  const race = column('race');
  const gender = column('gender');
  const playerClass = column('class');
  const realm = column('realm');
  const guild = column('guild');
  const faction = column('faction');
  const achievementPoints = column('achievementPoints');
  const honorableKills = column('honorableKills');
  const appearanceCount = column('appearanceCount');
  const achievementsTotal = column('achievementsTotal');
  const playedTime = column('playedTime');
  const ilvl = column('ilvl');
  const level10Day = column('level10Day');
  const isNewCharacter = column('isNewCharacter');
  const achievementPointsDelta = column('achievementPointsDelta');
  const achievementRankDelta = column('achievementRankDelta');
  const honorableKillsDelta = column('honorableKillsDelta');
  const honorableKillsRankDelta = column('honorableKillsRankDelta');
  const appearanceCountDelta = column('appearanceCountDelta');
  const appearanceRankDelta = column('appearanceRankDelta');
  const achievementsTotalDelta = column('achievementsTotalDelta');
  const achievementsTotalRankDelta = column('achievementsTotalRankDelta');
  const playedTimeDelta = column('playedTimeDelta');
  const playedTimeRankDelta = column('playedTimeRankDelta');

  if (missing.length > 0) {
    console.warn(`Player snapshot is missing columns: ${missing.join(', ')}`);
  }

  const players: Player[] = [];

  for (const row of snapshot.p) {
    const realmName = snapshot.r[numberAt(row, realm)];
    const playerName = stringAt(row, name);
    if (!playerName || !realmName) {
      continue;
    }

    players.push({
      name: playerName,
      race: numberAt(row, race),
      gender: numberAt(row, gender),
      class: numberAt(row, playerClass),
      realm: realmName,
      guild: stringAt(row, guild),
      faction: toFaction(snapshot.f[numberAt(row, faction)]),
      achievementPoints: numberAt(row, achievementPoints),
      honorableKills: numberAt(row, honorableKills),
      appearanceCount: numberAt(row, appearanceCount),
      achievementsTotal: numberAt(row, achievementsTotal),
      playedTime: numberAt(row, playedTime) * SECONDS_PER_MINUTE,
      ilvl: numberAt(row, ilvl),
      level10Day: numberAt(row, level10Day),
      isNewCharacter: numberAt(row, isNewCharacter) === 1,
      achievementPointsDelta: numberAt(row, achievementPointsDelta),
      achievementRankDelta: numberAt(row, achievementRankDelta),
      honorableKillsDelta: numberAt(row, honorableKillsDelta),
      honorableKillsRankDelta: numberAt(row, honorableKillsRankDelta),
      appearanceCountDelta: numberAt(row, appearanceCountDelta),
      appearanceRankDelta: numberAt(row, appearanceRankDelta),
      achievementsTotalDelta: numberAt(row, achievementsTotalDelta),
      achievementsTotalRankDelta: numberAt(row, achievementsTotalRankDelta),
      playedTimeDelta: numberAt(row, playedTimeDelta) * SECONDS_PER_MINUTE,
      playedTimeRankDelta: numberAt(row, playedTimeRankDelta)
    });
  }

  return players;
}

function numberAt(row: readonly (string | number)[], index: number): number {
  const value = index < 0 ? undefined : row[index];
  return typeof value === 'number' ? value : 0;
}

function stringAt(row: readonly (string | number)[], index: number): string {
  const value = index < 0 ? undefined : row[index];
  return typeof value === 'string' ? value : '';
}

function toFaction(value: string | undefined): Faction {
  return value !== undefined && FACTIONS.has(value) ? (value as Faction) : 'Neutral';
}
