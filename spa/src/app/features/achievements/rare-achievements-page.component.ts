import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, forkJoin, map } from 'rxjs';
import { FilterDropdownCoordinatorService } from '../../shared/filter-dropdown-coordinator.service';
import { FilterDropdownComponent } from '../../shared/filter-dropdown.component';
import { FilterDropdownOption } from '../../shared/filter-dropdown.types';
import {
  GLADIATOR_MOUNT_OPTIONS,
  KEYSTONE_MASTER_OPTIONS,
  R1_GLADIATOR_OPTIONS,
  RATED_BATTLEGROUND_OPTIONS
} from '../../players/rare-achievement-groups';
import {
  AchievementFilterValue,
  ALL_GLADIATOR_MOUNTS_FILTER_VALUE,
  ALL_GLADIATOR_TITLES_FILTER_VALUE,
  ALL_RATED_BATTLEGROUND_TITLES_FILTER_VALUE,
  areRareAchievementsFilterStatesEqual,
  DEFAULT_RARE_ACHIEVEMENTS_FILTER_STATE,
  GLADIATOR_MOUNT_COUNT_RANKING_FILTER_VALUE,
  GLADIATOR_TITLE_COUNT_RANKING_FILTER_VALUE,
  parseRareAchievementsFilterState,
  RareAchievementsFilterState,
  toRareAchievementsQueryParams
} from './rare-achievements-filter-state';
import { RareAchievementsService } from '../../players/rare-achievements.service';
import { RareAchievementsDataset, RareAchievementSummary } from '../../players/rare-achievements.types';
import { getGuildArmoryUrl, getArmoryUrl } from '../../game/armory';
import { setPageHeader } from '../../core/page-header';
import { CLASS_OPTIONS, REALM_OPTIONS } from '../../players/player-filter-options';
import {
  RareAchievementMatchView,
  countRankingMetricFor,
  parseDate,
  rankMatchingCharacters,
  toAchievementId
} from './rare-achievement-matches';

type AchievementDropdownKey = 'r1Gladiators' | 'gladiatorMounts' | 'ratedBattlegroundHeroes' | 'keystoneMasters';

interface AchievementDropdownDefinition {
  key: AchievementDropdownKey;
  placeholderLabel: string;
  dropdownId: string;
  triggerId: string;
  ariaLabel: string;
  options: ReadonlyArray<FilterDropdownOption<AchievementFilterValue>>;
}

interface AchievementDropdownView extends AchievementDropdownDefinition {
  selectedValue: AchievementFilterValue | undefined;
  selectedLabel: string;
}

const REALM_FILTER_OPTIONS: ReadonlyArray<FilterDropdownOption<string | undefined>> =
  REALM_OPTIONS.map((option) => ({ value: option.value, label: option.label }));
const CLASS_FILTER_OPTIONS: ReadonlyArray<FilterDropdownOption<number | undefined>> = [
  { value: undefined, label: 'All Classes' },
  ...CLASS_OPTIONS.map((option) => ({
    value: option.id,
    label: option.name,
    icon: option.icon
  }))
];
const ACHIEVEMENT_DROPDOWN_DEFINITIONS: ReadonlyArray<AchievementDropdownDefinition> = [
  {
    key: 'r1Gladiators',
    placeholderLabel: 'Choose Season Gladiator title',
    dropdownId: 'rareAchievementR1Gladiators',
    triggerId: 'rareAchievementR1GladiatorsTrigger',
    ariaLabel: 'Choose a Season Gladiator title',
    options: [
      { value: ALL_GLADIATOR_TITLES_FILTER_VALUE, label: 'All Gladiator Titles' },
      { value: GLADIATOR_TITLE_COUNT_RANKING_FILTER_VALUE, label: 'Most Rank 1 Gladiator Titles' },
      ...R1_GLADIATOR_OPTIONS
    ]
  },
  {
    key: 'gladiatorMounts',
    placeholderLabel: 'Choose Gladiator mount',
    dropdownId: 'rareAchievementGladiatorMounts',
    triggerId: 'rareAchievementGladiatorMountsTrigger',
    ariaLabel: 'Choose a Gladiator mount',
    options: [
      { value: ALL_GLADIATOR_MOUNTS_FILTER_VALUE, label: 'All Gladiator Mounts' },
      { value: GLADIATOR_MOUNT_COUNT_RANKING_FILTER_VALUE, label: 'Most Gladiator Mounts' },
      ...GLADIATOR_MOUNT_OPTIONS
    ]
  },
  {
    key: 'ratedBattlegroundHeroes',
    placeholderLabel: 'Choose Rated Battleground title',
    dropdownId: 'rareAchievementRatedBattlegroundHeroes',
    triggerId: 'rareAchievementRatedBattlegroundHeroesTrigger',
    ariaLabel: 'Choose a Rated Battleground title',
    options: [
      { value: ALL_RATED_BATTLEGROUND_TITLES_FILTER_VALUE, label: 'All Rated Battleground Titles' },
      ...RATED_BATTLEGROUND_OPTIONS
    ]
  },
  {
    key: 'keystoneMasters',
    placeholderLabel: 'Choose Keystone Master achievement',
    dropdownId: 'rareAchievementKeystoneMasters',
    triggerId: 'rareAchievementKeystoneMastersTrigger',
    ariaLabel: 'Choose a Keystone Master achievement',
    options: KEYSTONE_MASTER_OPTIONS
  }
];
const GROUPED_ACHIEVEMENT_LABELS = new Map<AchievementFilterValue, string>([
  [ALL_GLADIATOR_TITLES_FILTER_VALUE, 'All Gladiator Titles'],
  [ALL_GLADIATOR_MOUNTS_FILTER_VALUE, 'All Gladiator Mounts'],
  [ALL_RATED_BATTLEGROUND_TITLES_FILTER_VALUE, 'All Rated Battleground Titles'],
  [GLADIATOR_TITLE_COUNT_RANKING_FILTER_VALUE, 'Most Rank 1 Gladiator Titles'],
  [GLADIATOR_MOUNT_COUNT_RANKING_FILTER_VALUE, 'Most Gladiator Mounts'],
  ...ACHIEVEMENT_DROPDOWN_DEFINITIONS.flatMap((dropdown) =>
    dropdown.options.map((option) => [option.value, option.label] as const)
  )
]);

@Component({
  selector: 'app-rare-achievements-page',
  templateUrl: './rare-achievements-page.component.html',
  styleUrls: ['./rare-achievements-page.component.scss'],
  imports: [FilterDropdownComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [FilterDropdownCoordinatorService]
})
export class RareAchievementsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly rareAchievementsService = inject(RareAchievementsService);
  private readonly dropdownCoordinator = inject(FilterDropdownCoordinatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchInput$ = new Subject<string>();

  readonly dataset = signal<RareAchievementsDataset | null>(null);
  private readonly summaries = signal<ReadonlyMap<string, RareAchievementSummary>>(new Map());
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly selectedAchievementId = signal<AchievementFilterValue | undefined>(
    DEFAULT_RARE_ACHIEVEMENTS_FILTER_STATE.achievementId
  );
  readonly selectedRealm = signal<string | undefined>(undefined);
  readonly selectedClassId = signal<number | undefined>(undefined);
  readonly searchQuery = signal('');
  readonly lastEdited = signal<Date | undefined>(undefined);
  readonly realmFilterOptions = REALM_FILTER_OPTIONS;
  readonly classFilterOptions = CLASS_FILTER_OPTIONS;
  readonly achievementDropdowns = computed<ReadonlyArray<AchievementDropdownView>>(() => {
    const selectedAchievementId = this.selectedAchievementId();

    return ACHIEVEMENT_DROPDOWN_DEFINITIONS.map((dropdown) => {
      const selectedOption = dropdown.options.find((option) => option.value === selectedAchievementId);

      return {
        ...dropdown,
        selectedValue: selectedOption?.value,
        selectedLabel: selectedOption?.label ?? dropdown.placeholderLabel
      };
    });
  });
  readonly selectedAchievementLabel = computed(() => {
    const achievementId = this.selectedAchievementId();
    return achievementId === undefined
      ? 'Select rare achievement'
      : GROUPED_ACHIEVEMENT_LABELS.get(achievementId) ?? 'Select rare achievement';
  });
  readonly selectedRealmLabel = computed(() =>
    REALM_FILTER_OPTIONS.find((option) => option.value === this.selectedRealm())?.label ?? 'All Realms'
  );
  readonly selectedClassLabel = computed(() =>
    CLASS_FILTER_OPTIONS.find((option) => option.value === this.selectedClassId())?.label ?? 'All Classes'
  );
  readonly selectedClassIcon = computed(() =>
    CLASS_OPTIONS.find((option) => option.id === this.selectedClassId())?.icon
  );
  readonly countRankingMetric = computed(() => countRankingMetricFor(this.selectedAchievementId()));
  readonly isCountRanking = computed(() => this.countRankingMetric() !== undefined);
  readonly metricColumnLabel = computed(() => {
    switch (this.countRankingMetric()) {
      case 'gladiatorTitleCount':
        return 'R1 Titles';
      case 'gladiatorMountCount':
        return 'Mounts';
      default:
        return 'Obtained';
    }
  });
  readonly matchingCharacters = computed<ReadonlyArray<RareAchievementMatchView>>(() => {
    const achievementId = this.selectedAchievementId();
    return achievementId === undefined
      ? []
      : rankMatchingCharacters(this.dataset()?.characters ?? [], achievementId, this.summaries(), {
        realm: this.selectedRealm(),
        classId: this.selectedClassId(),
        search: this.searchQuery()
      });
  });
  readonly matchCount = computed(() => this.matchingCharacters().length);
  readonly hasSelection = computed(() => this.selectedAchievementId() !== undefined);
  readonly hasMatches = computed(() => this.matchCount() > 0);
  readonly showSelectionPrompt = computed(() => !this.isLoading() && !this.loadError() && !this.hasSelection());
  readonly showEmptyState = computed(() => !this.isLoading() && !this.loadError() && this.hasSelection() && !this.hasMatches());
  readonly emptyStateMessage = computed(() => `No tracked characters currently match ${this.selectedAchievementLabel()}.`);

  readonly getArmoryUrl = getArmoryUrl;
  readonly getGuildArmoryUrl = getGuildArmoryUrl;

  constructor() {
    setPageHeader(() => ({ lastEdited: this.lastEdited() }));
  }

  ngOnInit(): void {
    const initialFilterState = parseRareAchievementsFilterState(this.route.snapshot.queryParamMap);
    this.applyFilterState(initialFilterState);

    this.searchInput$.pipe(
      map((value) => value.trim()),
      debounceTime(250),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      const nextState = {
        ...this.getFilterState(),
        search: this.searchQuery().trim()
      };

      this.applyFilterState(nextState);
      this.navigateToFilterState(nextState, true);
    });

    this.route.queryParamMap.pipe(
      map((params) => parseRareAchievementsFilterState(params)),
      distinctUntilChanged(areRareAchievementsFilterStatesEqual),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((state) => {
      this.applyFilterState(state);
    });

    this.loadRareAchievements();
  }

  onAchievementSelection(value: string | number | undefined): void {
    this.dropdownCoordinator.closeAll();
    this.updateFilterState({
      achievementId: toAchievementId(value) ?? DEFAULT_RARE_ACHIEVEMENTS_FILTER_STATE.achievementId
    });
  }

  onRealmSelection(value: string | number | undefined): void {
    this.dropdownCoordinator.closeAll();
    this.updateFilterState({
      realm: typeof value === 'string' ? value : undefined
    });
  }

  onClassSelection(value: string | number | undefined): void {
    this.dropdownCoordinator.closeAll();
    this.updateFilterState({
      classId: typeof value === 'number' && Number.isFinite(value) ? value : undefined
    });
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const search = input.value;
    this.searchQuery.set(search);
    this.searchInput$.next(search);
  }

  resetFilter(): void {
    this.dropdownCoordinator.closeAll();
    this.updateFilterState(DEFAULT_RARE_ACHIEVEMENTS_FILTER_STATE);
  }

  retryLoad(): void {
    this.loadRareAchievements();
  }

  getCharacterLinkTitle(character: RareAchievementMatchView): string {
    return character.rareAchievementSummaryLabel
      ? character.rareAchievementSummaryLabel
      : `Open ${character.name} on Tauri armory`;
  }

  onImageError(event: Event): void {
    const image = event.target as HTMLImageElement | null;
    console.error('Failed to load image:', image?.src ?? 'unknown image');
  }

  private loadRareAchievements(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);

    forkJoin({
      dataset: this.rareAchievementsService.getRareAchievements(),
      summaries: this.rareAchievementsService.getRareAchievementIndicators()
    }).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: ({ dataset, summaries }) => {
        this.dataset.set(dataset);
        this.summaries.set(summaries);
        this.lastEdited.set(parseDate(dataset.generatedAt));
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        console.error('Failed to load rare achievements:', error);
        this.dataset.set(null);
        this.lastEdited.set(undefined);
        this.loadError.set('We could not load the rare achievement data right now. Please try again in a moment.');
        this.isLoading.set(false);
      }
    });
  }

  private getFilterState(): RareAchievementsFilterState {
    return {
      achievementId: this.selectedAchievementId() ?? DEFAULT_RARE_ACHIEVEMENTS_FILTER_STATE.achievementId,
      realm: this.selectedRealm(),
      classId: this.selectedClassId(),
      search: this.searchQuery()
    };
  }

  private updateFilterState(
    patch: Partial<RareAchievementsFilterState>,
    replaceUrl: boolean = false
  ): void {
    const nextState = {
      ...this.getFilterState(),
      ...patch
    };

    this.applyFilterState(nextState);
    this.navigateToFilterState(nextState, replaceUrl);
  }

  private applyFilterState(state: RareAchievementsFilterState): void {
    this.selectedAchievementId.set(state.achievementId);
    this.selectedRealm.set(state.realm);
    this.selectedClassId.set(state.classId);
    this.searchQuery.set(state.search);
  }

  private navigateToFilterState(state: RareAchievementsFilterState, replaceUrl: boolean): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: toRareAchievementsQueryParams(state),
      replaceUrl
    });
  }
}
