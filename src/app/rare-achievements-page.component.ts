import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { FilterDropdownCoordinatorService } from './filter-dropdown-coordinator.service';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { FilterDropdownOption } from './filter-dropdown.types';
import { CLASS_OPTIONS, REALM_OPTIONS } from './ladder-options';
import {
  GLADIATOR_MOUNT_OPTIONS,
  REALM_FIRST_OPTIONS,
  R1_GLADIATOR_OPTIONS,
  RATED_BATTLEGROUND_OPTIONS
} from './rare-achievement-groups';
import {
  buildRareAchievementNamesById,
  buildRareAchievementSummaryLabel,
  GLADIATOR_MOUNT_IDS,
  GLADIATOR_TITLE_IDS,
  summarizeRareAchievements
} from './rare-achievement-summary';
import { RareAchievementsService } from './rare-achievements.service';
import {
  RareAchievementCharacter,
  RareAchievementOwnership,
  RareAchievementsDataset,
  RareAchievementSummary
} from './rare-achievements.types';
import { UpdateBarComponent } from './update-bar.component';
import { getGuildArmoryUrl, getArmoryUrl } from '../utils/armory';
import { getClassIconPath } from '../utils/classIconHelper';
import { getRaceIconPath } from '../utils/raceIconHelper';

type CharacterFaction = 'Alliance' | 'Horde';
type AchievementDropdownKey = 'r1Gladiators' | 'gladiatorMounts' | 'ratedBattlegroundHeroes';
type AdditionalFilterDropdownKey = 'realm' | 'class';
type AggregateAchievementFilterValue = 'allGladiatorTitles' | 'allGladiatorMounts';
type AchievementFilterValue = number | AggregateAchievementFilterValue;

interface RareAchievementMatchView {
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
  rareAchievementSummaryLabel?: string;
}

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

const ALL_GLADIATOR_TITLES_FILTER_VALUE = 'allGladiatorTitles';
const ALL_GLADIATOR_MOUNTS_FILTER_VALUE = 'allGladiatorMounts';
const DEFAULT_SELECTED_ACHIEVEMENT_ID = ALL_GLADIATOR_TITLES_FILTER_VALUE;
const ALLIANCE_RACE_IDS = new Set<number>([1, 3, 4, 7, 11, 22, 25]);
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
      ...GLADIATOR_MOUNT_OPTIONS
    ]
  },
  {
    key: 'ratedBattlegroundHeroes',
    placeholderLabel: 'Choose Rated Battleground title',
    dropdownId: 'rareAchievementRatedBattlegroundHeroes',
    triggerId: 'rareAchievementRatedBattlegroundHeroesTrigger',
    ariaLabel: 'Choose a Rated Battleground title',
    options: RATED_BATTLEGROUND_OPTIONS
  }
];
const GROUPED_ACHIEVEMENT_LABELS = new Map<AchievementFilterValue, string>([
  [ALL_GLADIATOR_TITLES_FILTER_VALUE, 'All Gladiator Titles'],
  [ALL_GLADIATOR_MOUNTS_FILTER_VALUE, 'All Gladiator Mounts'],
  ...ACHIEVEMENT_DROPDOWN_DEFINITIONS.flatMap((dropdown) =>
    dropdown.options.map((option) => [option.value, option.label] as const)
  )
]);

@Component({
  selector: 'app-rare-achievements-page',
  templateUrl: './rare-achievements-page.component.html',
  styleUrls: ['./rare-achievements-page.component.scss'],
  standalone: true,
  imports: [CommonModule, UpdateBarComponent, BackToTopButtonComponent, FilterDropdownComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [FilterDropdownCoordinatorService]
})
export class RareAchievementsPageComponent implements OnInit {
  private readonly rareAchievementsService = inject(RareAchievementsService);
  private readonly dropdownCoordinator = inject(FilterDropdownCoordinatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly obtainedAtFormatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  readonly dataset = signal<RareAchievementsDataset | null>(null);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly selectedAchievementId = signal<AchievementFilterValue | undefined>(DEFAULT_SELECTED_ACHIEVEMENT_ID);
  readonly selectedRealm = signal<string | undefined>(undefined);
  readonly selectedClassId = signal<number | undefined>(undefined);
  readonly searchQuery = signal('');
  readonly lastEdited = signal<Date | undefined>(undefined);
  readonly lastEditedTimeZoneLabel = signal('Local time');
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
  readonly achievementNamesById = computed(() =>
    buildRareAchievementNamesById(this.dataset()?.achievements ?? [])
  );
  readonly matchingCharacters = computed<ReadonlyArray<RareAchievementMatchView>>(() => {
    const achievementId = this.selectedAchievementId();
    if (achievementId === undefined) {
      return [];
    }

    const selectedRealm = this.selectedRealm();
    const selectedClassId = this.selectedClassId();
    const normalizedSearchQuery = this.searchQuery().trim().toLowerCase();
    const achievementNamesById = this.achievementNamesById();

    return (this.dataset()?.characters ?? [])
      .map((character) => this.toMatchingCharacterView(character, achievementId, achievementNamesById))
      .filter((character): character is RareAchievementMatchView => character !== undefined)
      .filter((character) => this.matchesAdditionalFilters(character, selectedRealm, selectedClassId, normalizedSearchQuery))
      .sort((left, right) => this.compareCharacters(left, right))
      .map((character, index) => ({
        ...character,
        rank: index + 1
      }));
  });
  readonly matchCount = computed(() => this.matchingCharacters().length);
  readonly hasSelection = computed(() => this.selectedAchievementId() !== undefined);
  readonly hasMatches = computed(() => this.matchCount() > 0);
  readonly showSelectionPrompt = computed(() => !this.isLoading() && !this.loadError() && !this.hasSelection());
  readonly showEmptyState = computed(() => !this.isLoading() && !this.loadError() && this.hasSelection() && !this.hasMatches());
  readonly emptyStateMessage = computed(() => `No tracked characters currently have ${this.selectedAchievementLabel()}.`);

  readonly getArmoryUrl = getArmoryUrl;
  readonly getGuildArmoryUrl = getGuildArmoryUrl;

  ngOnInit(): void {
    this.loadRareAchievements();
  }

  onAchievementSelection(value: string | number | undefined): void {
    this.dropdownCoordinator.closeAll();
    this.selectedAchievementId.set(this.toAchievementId(value));
  }

  onRealmSelection(value: string | number | undefined): void {
    this.dropdownCoordinator.closeAll();
    this.selectedRealm.set(typeof value === 'string' ? value : undefined);
  }

  onClassSelection(value: string | number | undefined): void {
    this.dropdownCoordinator.closeAll();
    this.selectedClassId.set(typeof value === 'number' && Number.isFinite(value) ? value : undefined);
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  resetFilter(): void {
    this.dropdownCoordinator.closeAll();
    this.selectedAchievementId.set(DEFAULT_SELECTED_ACHIEVEMENT_ID);
    this.selectedRealm.set(undefined);
    this.selectedClassId.set(undefined);
    this.searchQuery.set('');
  }

  retryLoad(): void {
    this.loadRareAchievements();
  }

  trackAchievementDropdown(_index: number, dropdown: AchievementDropdownView): AchievementDropdownKey {
    return dropdown.key;
  }

  trackAdditionalFilterDropdown(_index: number, dropdownKey: AdditionalFilterDropdownKey): AdditionalFilterDropdownKey {
    return dropdownKey;
  }

  trackCharacter(_index: number, character: RareAchievementMatchView): string {
    return `${character.realm}::${character.name}`;
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

    this.rareAchievementsService.getRareAchievements().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (dataset) => {
        this.dataset.set(dataset);
        this.lastEdited.set(this.parseDate(dataset.generatedAt));
        this.lastEditedTimeZoneLabel.set(this.getTimeZoneLabel(this.lastEdited()));
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        console.error('Failed to load rare achievements:', error);
        this.dataset.set(null);
        this.lastEdited.set(undefined);
        this.lastEditedTimeZoneLabel.set('Local time');
        this.loadError.set('We could not load the rare achievement data right now. Please try again in a moment.');
        this.isLoading.set(false);
      }
    });
  }

  private toAchievementId(value: string | number | undefined): AchievementFilterValue | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    return value === ALL_GLADIATOR_TITLES_FILTER_VALUE || value === ALL_GLADIATOR_MOUNTS_FILTER_VALUE
      ? value
      : undefined;
  }

  private toMatchingCharacterView(
    character: RareAchievementCharacter,
    achievementId: AchievementFilterValue,
    achievementNamesById: ReadonlyMap<number, string>
  ): RareAchievementMatchView | undefined {
    const achievement = this.findCharacterAchievement(character, achievementId);
    if (!achievement) {
      return undefined;
    }

    const rareAchievementSummary = summarizeRareAchievements(character, achievementNamesById);
    const obtainedAt = achievement?.obtainedAt;
    const obtainedAtSortValue = this.toTimestamp(obtainedAt);
    const faction = this.getFactionForRace(character.race);

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
      obtainedAtLabel: this.formatObtainedAt(obtainedAt),
      obtainedAtSortValue,
      gladiatorTitleCount: rareAchievementSummary?.gladiatorTitleCount ?? 0,
      gladiatorMountCount: rareAchievementSummary?.gladiatorMountCount ?? 0,
      ratedBattlegroundHeroCount: rareAchievementSummary?.ratedBattlegroundHeroCount ?? 0,
      realmFirstCount: rareAchievementSummary?.realmFirstCount ?? 0,
      rareAchievementSummaryLabel: buildRareAchievementSummaryLabel(rareAchievementSummary)
    };
  }

  private findCharacterAchievement(
    character: RareAchievementCharacter,
    achievementId: AchievementFilterValue
  ): RareAchievementOwnership | undefined {
    if (achievementId === ALL_GLADIATOR_TITLES_FILTER_VALUE) {
      return this.findMostRecentAchievement(character, GLADIATOR_TITLE_IDS);
    }

    if (achievementId === ALL_GLADIATOR_MOUNTS_FILTER_VALUE) {
      return this.findMostRecentAchievement(character, GLADIATOR_MOUNT_IDS);
    }

    return character.achievements.find((achievement) => achievement.id === achievementId);
  }

  private findMostRecentAchievement(
    character: RareAchievementCharacter,
    trackedAchievementIds: ReadonlySet<number>
  ): RareAchievementOwnership | undefined {
    let latestAchievement: RareAchievementOwnership | undefined;
    let latestTimestamp = Number.NEGATIVE_INFINITY;

    for (const achievement of character.achievements) {
      if (!trackedAchievementIds.has(achievement.id)) {
        continue;
      }

      const timestamp = this.toTimestamp(achievement.obtainedAt) ?? Number.NEGATIVE_INFINITY;
      if (!latestAchievement || timestamp > latestTimestamp) {
        latestAchievement = achievement;
        latestTimestamp = timestamp;
      }
    }

    return latestAchievement;
  }

  private matchesAdditionalFilters(
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

  private compareCharacters(left: RareAchievementMatchView, right: RareAchievementMatchView): number {
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

  private parseDate(value: string | undefined): Date | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private getTimeZoneLabel(date: Date | undefined): string {
    if (!date) {
      return 'Local time';
    }

    try {
      const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(date);
      return parts.find((part) => part.type === 'timeZoneName')?.value ?? 'Local time';
    } catch {
      return 'Local time';
    }
  }

  private formatObtainedAt(value: string | null | undefined): string {
    const date = this.parseDate(value ?? undefined);
    return date ? this.obtainedAtFormatter.format(date) : 'Unknown';
  }

  private toTimestamp(value: string | null | undefined): number | undefined {
    const date = this.parseDate(value ?? undefined);
    return date?.getTime();
  }

  private getFactionForRace(race: number): CharacterFaction {
    return ALLIANCE_RACE_IDS.has(race) ? 'Alliance' : 'Horde';
  }
}
