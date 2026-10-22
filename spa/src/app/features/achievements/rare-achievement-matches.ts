import { getClassIconPath } from '../../game/classIconHelper';
import { getRaceIconPath } from '../../game/raceIconHelper';
import { raceFaction } from '../../game/wow';
import { SCARAB_LORD_ACHIEVEMENT_ID, buildRareAchievementCharacterKey } from '../../players/rare-achievement-groups';
import {
  GLADIATOR_MOUNT_IDS,
  GLADIATOR_TITLE_IDS,
  RATED_BATTLEGROUND_HERO_IDS,
  buildRareAchievementSummaryLabel
} from '../../players/rare-achievement-summary';
import {
  RareAchievementCharacter,
  RareAchievementOwnership,
  RareAchievementSummary
} from '../../players/rare-achievements.types';
import {
  AchievementFilterValue,
  ALL_GLADIATOR_MOUNTS_FILTER_VALUE,
  ALL_GLADIATOR_TITLES_FILTER_VALUE,
  ALL_RATED_BATTLEGROUND_TITLES_FILTER_VALUE,
  GLADIATOR_MOUNT_COUNT_RANKING_FILTER_VALUE,
  GLADIATOR_TITLE_COUNT_RANKING_FILTER_VALUE
} from './rare-achievements-filter-state';

export type CharacterFaction = 'Alliance' | 'Horde';

export type CountRankingMetric = 'gladiatorTitleCount' | 'gladiatorMountCount';

export interface RareAchievementMatchView {
  rank: number;
  name: string;
  realm: string;
  race: number;
  classId: number;
  guild: string;
  faction: CharacterFaction;
  gender: number;
  raceIcon: string;
  classIcon: string;
  obtainedAt: string | null | undefined;
  obtainedAtLabel: string;
  obtainedAtSortValue: number | undefined;
  gladiatorTitleCount: number;
  gladiatorMountCount: number;
  ratedBattlegroundHeroCount: number;
  realmFirstCount: number;
  hasScarabLord: boolean;
  rareAchievementSummaryLabel?: string;
}

export interface MatchFilters {
  realm: string | undefined;
  classId: number | undefined;
  search: string;
}

const obtainedAtFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
});

export function toAchievementId(value: string | number | undefined): AchievementFilterValue | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return value === ALL_GLADIATOR_TITLES_FILTER_VALUE
    || value === ALL_GLADIATOR_MOUNTS_FILTER_VALUE
    || value === ALL_RATED_BATTLEGROUND_TITLES_FILTER_VALUE
    || value === GLADIATOR_TITLE_COUNT_RANKING_FILTER_VALUE
    || value === GLADIATOR_MOUNT_COUNT_RANKING_FILTER_VALUE
    ? value
    : undefined;
}

export function countRankingMetricFor(
  achievementId: AchievementFilterValue | undefined
): CountRankingMetric | undefined {
  if (achievementId === GLADIATOR_TITLE_COUNT_RANKING_FILTER_VALUE) {
    return 'gladiatorTitleCount';
  }

  if (achievementId === GLADIATOR_MOUNT_COUNT_RANKING_FILTER_VALUE) {
    return 'gladiatorMountCount';
  }

  return undefined;
}

export function rankMatchingCharacters(
  characters: readonly RareAchievementCharacter[],
  achievementId: AchievementFilterValue,
  summaries: ReadonlyMap<string, RareAchievementSummary>,
  filters: MatchFilters
): RareAchievementMatchView[] {
  const normalizedSearchQuery = filters.search.trim().toLowerCase();

  return characters
    .map((character) => toMatchingCharacterView(character, achievementId, summaries))
    .filter((character): character is RareAchievementMatchView => character !== undefined)
    .filter((character) => matchesAdditionalFilters(character, filters.realm, filters.classId, normalizedSearchQuery))
    .sort((left, right) => compareCharacters(left, right, achievementId))
    .map((character, index) => ({
      ...character,
      rank: index + 1
    }));
}

export function findCharacterAchievement(
  character: RareAchievementCharacter,
  achievementId: AchievementFilterValue
): RareAchievementOwnership | undefined {
  if (
    achievementId === ALL_GLADIATOR_TITLES_FILTER_VALUE
    || achievementId === GLADIATOR_TITLE_COUNT_RANKING_FILTER_VALUE
  ) {
    return findMostRecentAchievement(character, GLADIATOR_TITLE_IDS);
  }

  if (
    achievementId === ALL_GLADIATOR_MOUNTS_FILTER_VALUE
    || achievementId === GLADIATOR_MOUNT_COUNT_RANKING_FILTER_VALUE
  ) {
    return findMostRecentAchievement(character, GLADIATOR_MOUNT_IDS);
  }

  if (achievementId === ALL_RATED_BATTLEGROUND_TITLES_FILTER_VALUE) {
    return findMostRecentAchievement(character, RATED_BATTLEGROUND_HERO_IDS);
  }

  return character.achievements.find((achievement) => achievement.id === achievementId);
}

export function parseDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toMatchingCharacterView(
  character: RareAchievementCharacter,
  achievementId: AchievementFilterValue,
  summaries: ReadonlyMap<string, RareAchievementSummary>
): RareAchievementMatchView | undefined {
  const achievement = findCharacterAchievement(character, achievementId);
  if (!achievement) {
    return undefined;
  }

  const rareAchievementSummary = summaries.get(buildRareAchievementCharacterKey(character.name, character.realm));
  const countRankingValue = rareAchievementSummary
    ? getCountRankingValue(rareAchievementSummary, achievementId)
    : undefined;

  if (countRankingMetricFor(achievementId) && (!countRankingValue || countRankingValue < 1)) {
    return undefined;
  }

  const obtainedAt = achievement?.obtainedAt;
  const obtainedAtSortValue = toTimestamp(obtainedAt);
  const faction: CharacterFaction = raceFaction(character.race) === 0 ? 'Alliance' : 'Horde';

  return {
    rank: 0,
    name: character.name,
    realm: character.realm,
    race: character.race,
    classId: character.class,
    guild: character.guild,
    faction,
    gender: character.gender,
    raceIcon: getRaceIconPath(character.race, character.gender),
    classIcon: getClassIconPath(character.class),
    obtainedAt,
    obtainedAtLabel: formatObtainedAt(obtainedAt),
    obtainedAtSortValue,
    gladiatorTitleCount: rareAchievementSummary?.gladiatorTitleCount ?? 0,
    gladiatorMountCount: rareAchievementSummary?.gladiatorMountCount ?? 0,
    ratedBattlegroundHeroCount: rareAchievementSummary?.ratedBattlegroundHeroCount ?? 0,
    realmFirstCount: rareAchievementSummary?.realmFirstCount ?? 0,
    hasScarabLord: character.achievements.some((ownedAchievement) =>
      ownedAchievement.id === SCARAB_LORD_ACHIEVEMENT_ID
    ),
    rareAchievementSummaryLabel: buildRareAchievementSummaryLabel(rareAchievementSummary)
  };
}

function findMostRecentAchievement(
  character: RareAchievementCharacter,
  trackedAchievementIds: ReadonlySet<number>
): RareAchievementOwnership | undefined {
  let latestAchievement: RareAchievementOwnership | undefined;
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  for (const achievement of character.achievements) {
    if (!trackedAchievementIds.has(achievement.id)) {
      continue;
    }

    const timestamp = toTimestamp(achievement.obtainedAt) ?? Number.NEGATIVE_INFINITY;
    if (!latestAchievement || timestamp > latestTimestamp) {
      latestAchievement = achievement;
      latestTimestamp = timestamp;
    }
  }

  return latestAchievement;
}

function matchesAdditionalFilters(
  character: RareAchievementMatchView,
  selectedRealm: string | undefined,
  selectedClassId: number | undefined,
  normalizedSearchQuery: string
): boolean {
  if (selectedRealm && character.realm !== selectedRealm) {
    return false;
  }

  if (selectedClassId !== undefined && character.classId !== selectedClassId) {
    return false;
  }

  if (!normalizedSearchQuery) {
    return true;
  }

  return character.name.toLowerCase().includes(normalizedSearchQuery)
    || character.guild.toLowerCase().includes(normalizedSearchQuery);
}

function compareCharacters(
  left: RareAchievementMatchView,
  right: RareAchievementMatchView,
  achievementId: AchievementFilterValue
): number {
  const leftCountRankingValue = getCountRankingValue(left, achievementId);
  const rightCountRankingValue = getCountRankingValue(right, achievementId);

  if (leftCountRankingValue !== undefined || rightCountRankingValue !== undefined) {
    if (leftCountRankingValue === undefined) {
      return 1;
    }

    if (rightCountRankingValue === undefined) {
      return -1;
    }

    if (leftCountRankingValue !== rightCountRankingValue) {
      return rightCountRankingValue - leftCountRankingValue;
    }
  }

  if (left.obtainedAtSortValue !== undefined || right.obtainedAtSortValue !== undefined) {
    if (left.obtainedAtSortValue === undefined) {
      return 1;
    }

    if (right.obtainedAtSortValue === undefined) {
      return -1;
    }

    if (left.obtainedAtSortValue !== right.obtainedAtSortValue) {
      return right.obtainedAtSortValue - left.obtainedAtSortValue;
    }
  }

  const realmResult = left.realm.localeCompare(right.realm);
  if (realmResult !== 0) {
    return realmResult;
  }

  return left.name.localeCompare(right.name);
}

function getCountRankingValue(
  source: Pick<RareAchievementSummary, 'gladiatorTitleCount' | 'gladiatorMountCount'>,
  achievementId: AchievementFilterValue
): number | undefined {
  const countRankingMetric = countRankingMetricFor(achievementId);

  if (countRankingMetric === 'gladiatorTitleCount') {
    return source.gladiatorTitleCount;
  }

  if (countRankingMetric === 'gladiatorMountCount') {
    return source.gladiatorMountCount;
  }

  return undefined;
}

function formatObtainedAt(value: string | null | undefined): string {
  const date = parseDate(value ?? undefined);
  return date ? obtainedAtFormatter.format(date) : 'Unknown';
}

function toTimestamp(value: string | null | undefined): number | undefined {
  const date = parseDate(value ?? undefined);
  return date?.getTime();
}
