export interface RatedBattlegroundCharacter {
  charname: string;
  race: number;
  class: number;
  gender: number;
  guildname: string;
  played_time: number;
  achievements: number;
  achievements_total: number;
  level: number;
  faction: number;
}

export interface RatedBattlegroundMember {
  guid: number;
  'character-minimal-data': RatedBattlegroundCharacter;
  realmid: number;
  realmName: string;
  side: number;
  killing_blows: number;
  deaths: number;
  damage_done: number;
  healing_done: number;
  damage_taken: number;
  healing_taken: number;
  bg_data0: number;
  bg_data1: number;
  bg_data2: number;
  bg_data3: number;
  bg_data4: number;
  personal_rating: number;
  personal_rating_change: number;
  mmr_rating: number;
  mmr_rating_change: number;
  israndom: boolean;
  honor: number;
  specid: number;
}

export interface RatedBattlegroundMatch {
  expansion: number;
  dataUrlPrefix: string;
  matchid: number;
  mapid: number;
  mapname: string;
  winner: number;
  bgtype: number;
  isranked: boolean;
  losermmravg: number;
  winnermmravg: number;
  loserpersonalavg: number;
  winnerpersonalavg: number;
  starttime: number;
  length: number;
  side0: number;
  side1: number;
  members: RatedBattlegroundMember[];
}

export type RatedLeaderboardMetric =
  | 'damage'
  | 'healing'
  | 'kills'
  | 'honor'
  | 'rating'
  | 'mmr'
  | 'games'
  | 'wins';

export interface RatedMapSummary {
  id: number;
  name: string;
  matches: number;
  share: number;
  averageDurationMs: number;
  shortestDurationMs: number;
  longestDurationMs: number;
  uniquePlayers: number;
}

export interface RatedActivityDay {
  date: string;
  label: string;
  matches: number;
  playerSlots: number;
  intensity: number;
}

export interface RatedPlayerSummary {
  key: string;
  guid: number;
  name: string;
  guild: string;
  realm: string;
  realmId: number;
  classId: number;
  race: number;
  gender: number;
  faction: number;
  level: number;
  specId: number;
  playedTimeSeconds: number;
  achievements: number;
  achievementsTotal: number;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  killingBlows: number;
  deaths: number;
  damageDone: number;
  healingDone: number;
  damageTaken: number;
  healingTaken: number;
  honor: number;
  netRatingChange: number;
  averageMmr: number;
  peakMmr: number;
}

export interface RatedBattlegroundAnalytics {
  matches: number;
  uniquePlayers: number;
  playerSlots: number;
  totalDurationMs: number;
  averageDurationMs: number;
  dateRangeLabel: string;
  expansionLabel: string;
  maps: RatedMapSummary[];
  activity: RatedActivityDay[];
  players: RatedPlayerSummary[];
}

export interface RatedTeamSummary {
  side: number;
  won: boolean;
  memberCount: number;
  averageMmr: number;
  averagePersonalRating: number;
  damageDone: number;
  healingDone: number;
  damageTaken: number;
  healingTaken: number;
  killingBlows: number;
  deaths: number;
  honor: number;
  members: RatedBattlegroundMember[];
}

export interface RatedObjectiveValue {
  label: string;
  value: number;
}

export interface RatedSpecDefinition {
  name: string;
  role: 'Tank' | 'Healer' | 'Damage';
}

export const CLASS_NAMES: Readonly<Record<number, string>> = {
  1: 'Warrior', 2: 'Paladin', 3: 'Hunter', 4: 'Rogue',
  5: 'Priest', 6: 'Death Knight', 7: 'Shaman', 8: 'Mage',
  9: 'Warlock', 10: 'Monk', 11: 'Druid', 12: 'Demon Hunter'
};

export const CLASS_COLORS: Readonly<Record<number, string>> = {
  1: '#c79c6e', 2: '#f58cba', 3: '#abd473', 4: '#fff569',
  5: '#ffffff', 6: '#c41f3b', 7: '#0070de', 8: '#69ccf0',
  9: '#9482c9', 10: '#00ff96', 11: '#ff7d0a', 12: '#a330c9'
};

const SPECIFICATIONS: Readonly<Record<number, RatedSpecDefinition>> = {
  62: { name: 'Arcane', role: 'Damage' }, 63: { name: 'Fire', role: 'Damage' }, 64: { name: 'Frost', role: 'Damage' },
  65: { name: 'Holy', role: 'Healer' }, 66: { name: 'Protection', role: 'Tank' }, 70: { name: 'Retribution', role: 'Damage' },
  71: { name: 'Arms', role: 'Damage' }, 72: { name: 'Fury', role: 'Damage' }, 73: { name: 'Protection', role: 'Tank' },
  102: { name: 'Balance', role: 'Damage' }, 103: { name: 'Feral', role: 'Damage' }, 104: { name: 'Guardian', role: 'Tank' }, 105: { name: 'Restoration', role: 'Healer' },
  250: { name: 'Blood', role: 'Tank' }, 251: { name: 'Frost', role: 'Damage' }, 252: { name: 'Unholy', role: 'Damage' },
  253: { name: 'Beast Mastery', role: 'Damage' }, 254: { name: 'Marksmanship', role: 'Damage' }, 255: { name: 'Survival', role: 'Damage' },
  256: { name: 'Discipline', role: 'Healer' }, 257: { name: 'Holy', role: 'Healer' }, 258: { name: 'Shadow', role: 'Damage' },
  259: { name: 'Assassination', role: 'Damage' }, 260: { name: 'Outlaw', role: 'Damage' }, 261: { name: 'Subtlety', role: 'Damage' },
  262: { name: 'Elemental', role: 'Damage' }, 263: { name: 'Enhancement', role: 'Damage' }, 264: { name: 'Restoration', role: 'Healer' },
  265: { name: 'Affliction', role: 'Damage' }, 266: { name: 'Demonology', role: 'Damage' }, 267: { name: 'Destruction', role: 'Damage' },
  268: { name: 'Brewmaster', role: 'Tank' }, 269: { name: 'Windwalker', role: 'Damage' }, 270: { name: 'Mistweaver', role: 'Healer' },
  577: { name: 'Havoc', role: 'Damage' }, 581: { name: 'Vengeance', role: 'Tank' }
};

const OBJECTIVE_LABELS: Readonly<Record<string, ReadonlyArray<string>>> = {
  'Warsong Gulch': ['Flags captured', 'Flags returned'],
  'Temple of Kotmogu': ['Orbs held', 'Victory points'],
  'Silvershard Mines': ['Mine carts captured'],
  'Deepwind Gorge': ['Bases assaulted', 'Bases defended', 'Carts captured', 'Carts returned']
};

export function normalizeRatedBattlegrounds(value: unknown): RatedBattlegroundMatch[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is RatedBattlegroundMatch => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }
      const match = entry as Partial<RatedBattlegroundMatch>;
      return Number(match.matchid) > 0
        && Number(match.starttime) > 0
        && typeof match.mapname === 'string'
        && Array.isArray(match.members)
        && match.isranked === true;
    })
    .sort((left, right) => left.starttime - right.starttime || left.matchid - right.matchid);
}

export function buildRatedBattlegroundAnalytics(
  matches: ReadonlyArray<RatedBattlegroundMatch>
): RatedBattlegroundAnalytics {
  const mapGroups = new Map<string, RatedBattlegroundMatch[]>();
  const dayGroups = new Map<string, RatedBattlegroundMatch[]>();
  const playerGroups = new Map<string, Array<{ member: RatedBattlegroundMember; match: RatedBattlegroundMatch }>>();

  for (const match of matches) {
    addToGroup(mapGroups, match.mapname, match);
    addToGroup(dayGroups, toLocalDateKey(match.starttime), match);

    for (const member of match.members) {
      addToGroup(playerGroups, playerKey(member), { member, match });
    }
  }

  const maps = [...mapGroups.entries()]
    .map(([name, mapMatches]): RatedMapSummary => {
      const durations = mapMatches.map(match => Math.max(0, match.length));
      const uniquePlayers = new Set(mapMatches.flatMap(match => match.members.map(playerKey))).size;
      return {
        id: mapMatches[0]?.mapid ?? 0,
        name,
        matches: mapMatches.length,
        share: matches.length ? mapMatches.length / matches.length : 0,
        averageDurationMs: average(durations),
        shortestDurationMs: durations.length ? Math.min(...durations) : 0,
        longestDurationMs: durations.length ? Math.max(...durations) : 0,
        uniquePlayers
      };
    })
    .sort((left, right) => right.matches - left.matches || left.name.localeCompare(right.name));

  const maxDailyMatches = Math.max(0, ...[...dayGroups.values()].map(dayMatches => dayMatches.length));
  const activity = [...dayGroups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, dayMatches]): RatedActivityDay => ({
      date,
      label: formatDateFromKey(date, { month: 'short', day: 'numeric' }),
      matches: dayMatches.length,
      playerSlots: dayMatches.reduce((total, match) => total + match.members.length, 0),
      intensity: maxDailyMatches ? dayMatches.length / maxDailyMatches : 0
    }));

  const players = [...playerGroups.entries()]
    .map(([key, appearances]) => buildPlayerSummary(key, appearances))
    .sort((left, right) => right.games - left.games || right.wins - left.wins || left.name.localeCompare(right.name));

  const totalDurationMs = matches.reduce((total, match) => total + Math.max(0, match.length), 0);
  const startDate = matches[0]?.starttime;
  const endDate = matches[matches.length - 1]?.starttime;
  const expansions = [...new Set(matches.map(match => match.expansion))];

  return {
    matches: matches.length,
    uniquePlayers: players.length,
    playerSlots: matches.reduce((total, match) => total + match.members.length, 0),
    totalDurationMs,
    averageDurationMs: matches.length ? totalDurationMs / matches.length : 0,
    dateRangeLabel: startDate && endDate
      ? `${formatUnixDate(startDate)} – ${formatUnixDate(endDate)}`
      : 'No recorded matches',
    expansionLabel: expansions.length === 1 && expansions[0] === 6 ? 'Legion' : 'Mixed expansions',
    maps,
    activity,
    players
  };
}

export function buildTeamSummary(match: RatedBattlegroundMatch, side: number): RatedTeamSummary {
  const members = match.members
    .filter(member => member.side === side)
    .sort((left, right) => right.damage_done - left.damage_done || left['character-minimal-data'].charname.localeCompare(right['character-minimal-data'].charname));
  const won = match.winner === side;

  return {
    side,
    won,
    memberCount: members.length,
    averageMmr: won ? match.winnermmravg : match.losermmravg,
    averagePersonalRating: won ? match.winnerpersonalavg : match.loserpersonalavg,
    damageDone: sum(members, member => member.damage_done),
    healingDone: sum(members, member => member.healing_done),
    damageTaken: sum(members, member => member.damage_taken),
    healingTaken: sum(members, member => member.healing_taken),
    killingBlows: sum(members, member => member.killing_blows),
    deaths: sum(members, member => member.deaths),
    honor: sum(members, member => member.honor),
    members
  };
}

export function getObjectives(match: RatedBattlegroundMatch, member: RatedBattlegroundMember): RatedObjectiveValue[] {
  const labels = OBJECTIVE_LABELS[match.mapname] ?? ['Objective 1', 'Objective 2', 'Objective 3', 'Objective 4', 'Objective 5'];
  const values = [member.bg_data0, member.bg_data1, member.bg_data2, member.bg_data3, member.bg_data4];
  return labels.map((label, index) => ({ label, value: values[index] ?? 0 }));
}

export function getSpec(specId: number): RatedSpecDefinition {
  return SPECIFICATIONS[specId] ?? { name: specId > 0 ? `Spec ${specId}` : 'Unknown spec', role: 'Damage' };
}

export function getClassName(classId: number): string {
  return CLASS_NAMES[classId] ?? `Class ${classId}`;
}

export function getClassColor(classId: number): string {
  return CLASS_COLORS[classId] ?? '#cbd5e1';
}

export function getFactionLabel(faction: number): string {
  return faction === 0 ? 'Alliance' : faction === 1 ? 'Horde' : 'Neutral';
}

export function metricValue(player: RatedPlayerSummary, metric: RatedLeaderboardMetric): number {
  switch (metric) {
    case 'damage': return player.damageDone;
    case 'healing': return player.healingDone;
    case 'kills': return player.killingBlows;
    case 'honor': return player.honor;
    case 'rating': return player.netRatingChange;
    case 'mmr': return player.peakMmr;
    case 'wins': return player.wins;
    default: return player.games;
  }
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:${remainder}` : `${minutes}:${remainder}`;
}

export function formatUnixDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(timestamp * 1000));
}

export function formatUnixDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(timestamp * 1000));
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatPlayedTime(seconds: number): string {
  const days = Math.floor(Math.max(0, seconds) / 86_400);
  return days > 0 ? `${days.toLocaleString()}d played` : `${Math.floor(Math.max(0, seconds) / 3600)}h played`;
}

function buildPlayerSummary(
  key: string,
  appearances: ReadonlyArray<{ member: RatedBattlegroundMember; match: RatedBattlegroundMatch }>
): RatedPlayerSummary {
  const latest = appearances[appearances.length - 1]!.member;
  const character = latest['character-minimal-data'];
  const wins = appearances.filter(({ member, match }) => member.side === match.winner).length;
  const mmrValues = appearances.map(({ member }) => member.mmr_rating);

  return {
    key,
    guid: latest.guid,
    name: character.charname,
    guild: character.guildname,
    realm: latest.realmName,
    realmId: latest.realmid,
    classId: character.class,
    race: character.race,
    gender: character.gender,
    faction: character.faction,
    level: character.level,
    specId: latest.specid,
    playedTimeSeconds: Math.max(...appearances.map(({ member }) => member['character-minimal-data'].played_time)),
    achievements: Math.max(...appearances.map(({ member }) => member['character-minimal-data'].achievements)),
    achievementsTotal: Math.max(...appearances.map(({ member }) => member['character-minimal-data'].achievements_total)),
    games: appearances.length,
    wins,
    losses: appearances.length - wins,
    winRate: appearances.length ? wins / appearances.length : 0,
    killingBlows: sumAppearances(appearances, member => member.killing_blows),
    deaths: sumAppearances(appearances, member => member.deaths),
    damageDone: sumAppearances(appearances, member => member.damage_done),
    healingDone: sumAppearances(appearances, member => member.healing_done),
    damageTaken: sumAppearances(appearances, member => member.damage_taken),
    healingTaken: sumAppearances(appearances, member => member.healing_taken),
    honor: sumAppearances(appearances, member => member.honor),
    netRatingChange: sumAppearances(appearances, member => member.personal_rating_change),
    averageMmr: average(mmrValues),
    peakMmr: Math.max(...mmrValues)
  };
}

function playerKey(member: RatedBattlegroundMember): string {
  return `${member.realmid}:${member.guid}`;
}

function addToGroup<T>(map: Map<string, T[]>, key: string, value: T): void {
  const group = map.get(key) ?? [];
  group.push(value);
  map.set(key, group);
}

function average(values: ReadonlyArray<number>): number {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function sum<T>(values: ReadonlyArray<T>, selector: (value: T) => number): number {
  return values.reduce((total, value) => total + (Number(selector(value)) || 0), 0);
}

function sumAppearances(
  appearances: ReadonlyArray<{ member: RatedBattlegroundMember }>,
  selector: (member: RatedBattlegroundMember) => number
): number {
  return sum(appearances, appearance => selector(appearance.member));
}

function toLocalDateKey(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

function formatDateFromKey(date: string, options: Intl.DateTimeFormatOptions): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, options).format(new Date(year, month - 1, day));
}
