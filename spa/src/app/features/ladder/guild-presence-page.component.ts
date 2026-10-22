import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FilterDropdownCoordinatorService } from '../../shared/filter-dropdown-coordinator.service';
import { FilterDropdownComponent } from '../../shared/filter-dropdown.component';
import {
  DEFAULT_GUILD_DISPLAY_LIMIT,
  DEFAULT_GUILD_SOURCE_LIMIT,
  GUILD_DISPLAY_LIMIT_OPTIONS,
  GUILD_SOURCE_LIMIT_OPTIONS
} from './guild-presence-options';
import { GuildPresencePageStore } from './guild-presence-page.store';
import { getGuildArmoryUrl } from '../../game/armory';
import { setPageHeader } from '../../core/page-header';
import { LadderSelectOption } from '../../players/player-filter-options';

@Component({
  selector: 'app-guild-presence-page',
  templateUrl: './guild-presence-page.component.html',
  styleUrls: ['./guild-presence-page.component.scss'],
  imports: [FilterDropdownComponent, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [GuildPresencePageStore, FilterDropdownCoordinatorService]
})
export class GuildPresencePageComponent implements OnInit {
  private readonly guildPresencePageStore = inject(GuildPresencePageStore);
  private readonly dropdownCoordinator = inject(FilterDropdownCoordinatorService);

  readonly sourceLimitOptions = GUILD_SOURCE_LIMIT_OPTIONS;
  readonly displayLimitOptions = GUILD_DISPLAY_LIMIT_OPTIONS;
  readonly sourceLimit = signal(DEFAULT_GUILD_SOURCE_LIMIT);
  readonly displayLimit = signal(DEFAULT_GUILD_DISPLAY_LIMIT);
  readonly selectedSourceLimitLabel = computed(() => this.getSelectedLabel(this.sourceLimitOptions, this.sourceLimit(), 'Top 1000'));
  readonly selectedDisplayLimitLabel = computed(() => this.getSelectedLabel(this.displayLimitOptions, this.displayLimit(), 'Top 10'));

  readonly guildPresence = this.guildPresencePageStore.guildPresence;
  readonly isLoading = this.guildPresencePageStore.isLoading;
  readonly syncMessage = this.guildPresencePageStore.syncMessage;
  readonly loadError = this.guildPresencePageStore.loadError;
  readonly lastEdited = this.guildPresencePageStore.lastEdited;
  readonly hasSourcePlayers = this.guildPresencePageStore.hasSourcePlayers;
  readonly allAchievementGuilds = computed(() => this.guildPresence()?.achievementGuilds ?? []);
  readonly allHonorableKillGuilds = computed(() => this.guildPresence()?.honorableKillGuilds ?? []);
  readonly achievementGuilds = computed(() => this.allAchievementGuilds().slice(0, this.displayLimit()));
  readonly honorableKillGuilds = computed(() => this.allHonorableKillGuilds().slice(0, this.displayLimit()));
  readonly achievementLeaderboardSize = computed(() => this.guildPresence()?.achievementLeaderboardSize ?? 0);
  readonly honorableKillLeaderboardSize = computed(() => this.guildPresence()?.honorableKillLeaderboardSize ?? 0);
  readonly showLoadingState = computed(() => this.isLoading() && !this.hasSourcePlayers());
  readonly showErrorState = computed(() => !this.isLoading() && !!this.loadError() && !this.hasSourcePlayers());
  readonly hasGuildRankings = computed(() => this.achievementGuilds().length > 0 || this.honorableKillGuilds().length > 0);
  readonly showEmptyState = computed(() => !this.showLoadingState() && !this.showErrorState() && !this.hasGuildRankings());
  readonly showRefreshingBanner = computed(() => this.isLoading() && this.hasSourcePlayers());
  readonly showErrorBanner = computed(() => !!this.loadError() && this.hasSourcePlayers());

  readonly getGuildArmoryUrl = getGuildArmoryUrl;

  constructor() {
    setPageHeader(() => ({ lastEdited: this.lastEdited() }));
  }

  ngOnInit(): void {
    this.guildPresencePageStore.initialize();
  }

  syncData(): void {
    void this.guildPresencePageStore.syncData();
  }

  onSourceLimitSelection(value: string | number | undefined): void {
    const nextValue = this.toPositiveNumber(value, DEFAULT_GUILD_SOURCE_LIMIT);
    this.dropdownCoordinator.closeAll();
    this.sourceLimit.set(nextValue);
    this.guildPresencePageStore.setSourceLimit(nextValue);
  }

  onDisplayLimitSelection(value: string | number | undefined): void {
    const nextValue = this.toPositiveNumber(value, DEFAULT_GUILD_DISPLAY_LIMIT);
    this.dropdownCoordinator.closeAll();
    this.displayLimit.set(nextValue);
  }

  resetFilters(): void {
    this.dropdownCoordinator.closeAll();
    this.sourceLimit.set(DEFAULT_GUILD_SOURCE_LIMIT);
    this.displayLimit.set(DEFAULT_GUILD_DISPLAY_LIMIT);
    this.guildPresencePageStore.setSourceLimit(DEFAULT_GUILD_SOURCE_LIMIT);
  }

  private getSelectedLabel(
    options: ReadonlyArray<LadderSelectOption<number>>,
    selectedValue: number,
    fallback: string
  ): string {
    return options.find((option) => option.value === selectedValue)?.label ?? fallback;
  }

  private toPositiveNumber(value: string | number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : fallback;
  }
}
