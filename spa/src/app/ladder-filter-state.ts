import { ParamMap, Params } from '@angular/router';
import {
  CLASS_OPTIONS,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  FACTION_OPTIONS,
  PAGE_SIZE_OPTIONS,
  REALM_OPTIONS,
  SORT_OPTIONS
} from './ladder-options';
import { LadderFilterState, LadderSort } from './ladder.types';

const VALID_SORTS = new Set<LadderSort>(SORT_OPTIONS.map((option) => option.value));
const VALID_REALMS = new Set<string>(
  REALM_OPTIONS
    .map((option) => option.value)
    .filter((value): value is string => value !== undefined)
);
const VALID_FACTIONS = new Set<string>(
  FACTION_OPTIONS
    .map((option) => option.value)
    .filter((value): value is string => value !== undefined)
);
const VALID_CLASSES = new Set<number>(CLASS_OPTIONS.map((option) => option.id));
const VALID_PAGE_SIZES = new Set<number>(PAGE_SIZE_OPTIONS);

export const DEFAULT_LADDER_FILTER_STATE: LadderFilterState = {
  sort: DEFAULT_SORT,
  realm: undefined,
  faction: undefined,
  playerClass: undefined,
  pageSize: DEFAULT_PAGE_SIZE,
  search: ''
};

export function parseLadderFilterState(params: ParamMap): LadderFilterState {
  const sortParam = params.get('sort');
  const realmParam = params.get('realm') ?? undefined;
  const factionParam = params.get('faction') ?? undefined;
  const classParam = params.get('class');
  const pageSizeParam = Number(params.get('pageSize'));
  const parsedClass = classParam === null ? undefined : Number(classParam);
  const playerClass = typeof parsedClass === 'number'
    && Number.isFinite(parsedClass)
    && VALID_CLASSES.has(parsedClass)
    ? parsedClass
    : undefined;

  return {
    sort: isLadderSort(sortParam) ? sortParam : DEFAULT_LADDER_FILTER_STATE.sort,
    realm: realmParam && VALID_REALMS.has(realmParam) ? realmParam : undefined,
    faction: factionParam && VALID_FACTIONS.has(factionParam) ? factionParam : undefined,
    playerClass,
    pageSize: VALID_PAGE_SIZES.has(pageSizeParam) ? pageSizeParam : DEFAULT_LADDER_FILTER_STATE.pageSize,
    search: params.get('search') ?? DEFAULT_LADDER_FILTER_STATE.search
  };
}

export function areLadderFilterStatesEqual(previous: LadderFilterState, current: LadderFilterState): boolean {
  return previous.sort === current.sort
    && previous.realm === current.realm
    && previous.faction === current.faction
    && previous.playerClass === current.playerClass
    && previous.pageSize === current.pageSize
    && previous.search === current.search;
}

/**
 * Whether answering this view needs every player, or whether the head snapshot is enough.
 *
 * The head holds the top slice of the achievement-point ranking, so it can only serve the
 * unfiltered, unsearched achievement-point view. Every other case reads outside it:
 * another sort orders players the head never selected on, a search can match anyone on the
 * server, and a realm/faction/class filter re-ranks within its cohort, which needs the whole
 * cohort to be correct.
 *
 * Page size is not a factor - the largest option is 1000, far inside the head slice.
 */
export function requiresCompleteLadderDataset(state: LadderFilterState): boolean {
  return state.sort !== 'achievementPoints'
    || state.realm !== undefined
    || state.faction !== undefined
    || state.playerClass !== undefined
    || state.search.trim().length > 0;
}

export function toLadderQueryParams(state: LadderFilterState): Params {
  const normalizedSearch = state.search.trim();

  return {
    sort: state.sort === DEFAULT_LADDER_FILTER_STATE.sort ? null : state.sort,
    realm: state.realm ?? null,
    faction: state.faction ?? null,
    class: state.playerClass ?? null,
    pageSize: state.pageSize === DEFAULT_LADDER_FILTER_STATE.pageSize ? null : state.pageSize,
    search: normalizedSearch || null
  };
}

function isLadderSort(value: string | null): value is LadderSort {
  return value !== null && VALID_SORTS.has(value as LadderSort);
}
