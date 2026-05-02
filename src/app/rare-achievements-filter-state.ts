import { ParamMap, Params } from '@angular/router';
import { CLASS_OPTIONS, REALM_OPTIONS } from './ladder-options';
import {
  GLADIATOR_MOUNT_OPTIONS,
  R1_GLADIATOR_OPTIONS,
  RATED_BATTLEGROUND_OPTIONS
} from './rare-achievement-groups';

export const ALL_GLADIATOR_TITLES_FILTER_VALUE = 'allGladiatorTitles';
export const ALL_GLADIATOR_MOUNTS_FILTER_VALUE = 'allGladiatorMounts';
export const ALL_RATED_BATTLEGROUND_TITLES_FILTER_VALUE = 'allRatedBattlegroundTitles';
export const GLADIATOR_TITLE_COUNT_RANKING_FILTER_VALUE = 'gladiatorTitleCountRanking';
export const GLADIATOR_MOUNT_COUNT_RANKING_FILTER_VALUE = 'gladiatorMountCountRanking';

export type AggregateAchievementFilterValue =
  | typeof ALL_GLADIATOR_TITLES_FILTER_VALUE
  | typeof ALL_GLADIATOR_MOUNTS_FILTER_VALUE
  | typeof ALL_RATED_BATTLEGROUND_TITLES_FILTER_VALUE
  | typeof GLADIATOR_TITLE_COUNT_RANKING_FILTER_VALUE
  | typeof GLADIATOR_MOUNT_COUNT_RANKING_FILTER_VALUE;
export type AchievementFilterValue = number | AggregateAchievementFilterValue;

export interface RareAchievementsFilterState {
  achievementId: AchievementFilterValue;
  realm: string | undefined;
  classId: number | undefined;
  search: string;
}

const VALID_REALMS = new Set<string>(
  REALM_OPTIONS
    .map((option) => option.value)
    .filter((value): value is string => value !== undefined)
);
const VALID_CLASSES = new Set<number>(CLASS_OPTIONS.map((option) => option.id));
const VALID_NUMERIC_ACHIEVEMENT_IDS = new Set<number>([
  ...R1_GLADIATOR_OPTIONS.map((option) => option.value),
  ...GLADIATOR_MOUNT_OPTIONS.map((option) => option.value),
  ...RATED_BATTLEGROUND_OPTIONS.map((option) => option.value)
]);

export const DEFAULT_RARE_ACHIEVEMENTS_FILTER_STATE: RareAchievementsFilterState = {
  achievementId: GLADIATOR_TITLE_COUNT_RANKING_FILTER_VALUE,
  realm: undefined,
  classId: undefined,
  search: ''
};

export function parseRareAchievementsFilterState(params: ParamMap): RareAchievementsFilterState {
  const realmParam = params.get('realm') ?? undefined;
  const classParam = params.get('class');
  const achievementParam = params.get('achievement');
  const parsedClassId = classParam === null ? undefined : Number(classParam);

  return {
    achievementId: parseAchievementFilterValue(achievementParam),
    realm: realmParam && VALID_REALMS.has(realmParam) ? realmParam : undefined,
    classId: typeof parsedClassId === 'number'
      && Number.isFinite(parsedClassId)
      && VALID_CLASSES.has(parsedClassId)
      ? parsedClassId
      : undefined,
    search: params.get('search') ?? DEFAULT_RARE_ACHIEVEMENTS_FILTER_STATE.search
  };
}

export function areRareAchievementsFilterStatesEqual(
  previous: RareAchievementsFilterState,
  current: RareAchievementsFilterState
): boolean {
  return previous.achievementId === current.achievementId
    && previous.realm === current.realm
    && previous.classId === current.classId
    && previous.search === current.search;
}

export function toRareAchievementsQueryParams(state: RareAchievementsFilterState): Params {
  const normalizedSearch = state.search.trim();

  return {
    achievement: state.achievementId === DEFAULT_RARE_ACHIEVEMENTS_FILTER_STATE.achievementId
      ? null
      : state.achievementId,
    realm: state.realm ?? null,
    class: state.classId ?? null,
    search: normalizedSearch || null
  };
}

function parseAchievementFilterValue(value: string | null): AchievementFilterValue {
  if (
    value === ALL_GLADIATOR_TITLES_FILTER_VALUE
    || value === ALL_GLADIATOR_MOUNTS_FILTER_VALUE
    || value === ALL_RATED_BATTLEGROUND_TITLES_FILTER_VALUE
    || value === GLADIATOR_TITLE_COUNT_RANKING_FILTER_VALUE
    || value === GLADIATOR_MOUNT_COUNT_RANKING_FILTER_VALUE
  ) {
    return value;
  }

  if (value !== null) {
    const parsedNumericValue = Number(value);
    if (Number.isFinite(parsedNumericValue) && VALID_NUMERIC_ACHIEVEMENT_IDS.has(parsedNumericValue)) {
      return parsedNumericValue;
    }
  }

  return DEFAULT_RARE_ACHIEVEMENTS_FILTER_STATE.achievementId;
}
