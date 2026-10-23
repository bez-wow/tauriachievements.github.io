import { DatePipe, DecimalPipe, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, LOCALE_ID, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FilterDropdownComponent } from '../../shared/filter-dropdown.component';
import { FilterDropdownCoordinatorService } from '../../shared/filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from '../../shared/filter-dropdown.types';
import { RaidDifficultySwitchComponent } from './raid-difficulty-switch.component';
import { GuildProgress, ProgressChange, filterProgression, guildProgression, progressionChanges } from './raid-progression';
import { RaidBoss, RaidKill, RaidLogsIndex } from './raid-logs.types';
import { bossesInKillOrder, defaultDifficulty, guildKey, logKey } from './raid-logs';
import { raidGuildLink } from './raid-display';
import { RaidLogsDataService } from './raid-logs-data.service';
import { REALMS, realmSlug } from '../../game/wow';
import { injectReplaceUrl } from '../../core/url-state';
import { LoadStateComponent } from '../../shared/load-state.component';
import { setPageHeader } from '../../core/page-header';

const FACTIONS: ReadonlyArray<{ slug: string; id: number; label: string }> = [
  { slug: 'horde', id: 1, label: 'Horde' },
  { slug: 'alliance', id: 0, label: 'Alliance' }
];

@Component({
  selector: 'app-raid-logs-progression-page',
  imports: [RouterLink, RaidDifficultySwitchComponent, FilterDropdownComponent, DatePipe, DecimalPipe, LoadStateComponent],
  templateUrl: './raid-logs-progression-page.component.html',
  styleUrl: './raid-logs-progression-page.component.scss',
  providers: [FilterDropdownCoordinatorService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaidLogsProgressionPageComponent implements OnInit {
  readonly guildKey = guildKey;

  private readonly data = inject(RaidLogsDataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly replaceUrl = injectReplaceUrl();

  readonly index = signal<RaidLogsIndex | undefined>(undefined);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly lastEdited = computed(() => this.index()?.generatedAt);

  private readonly query = this.route.snapshot.queryParamMap;
  private readonly requestedDifficulty = signal(this.query.get('difficulty') ?? this.data.lastDifficulty());
  readonly factionFilter = signal(FACTIONS.find(faction => faction.slug === this.query.get('faction'))?.slug);
  readonly realmFilter = signal(REALMS.map(realmSlug).find(realm => realm === this.query.get('realm')));
  readonly hasFilters = computed(() => this.factionFilter() !== undefined || this.realmFilter() !== undefined);

  readonly factionOptions: ReadonlyArray<FilterDropdownOption> = [
    { value: undefined, label: 'All factions' },
    ...FACTIONS.map(faction => ({ value: faction.slug, label: faction.label }))
  ];
  readonly realmOptions: ReadonlyArray<FilterDropdownOption> = [
    { value: undefined, label: 'All realms' },
    ...REALMS.map(realm => ({ value: realmSlug(realm), label: realm }))
  ];
  readonly factionWidthLabels = this.factionOptions.map(option => option.label);
  readonly realmWidthLabels = this.realmOptions.map(option => option.label);

  readonly pipBosses = computed(() => bossesInKillOrder(this.index()?.bosses ?? []));

  readonly difficulty = computed(() => {
    const difficulties = this.index()?.difficulties ?? [];
    return difficulties.find(difficulty => difficulty.slug === this.requestedDifficulty() && difficulty.kills > 0)
      ?? defaultDifficulty(difficulties);
  });

  private readonly difficultyKills = computed(() => {
    const difficulty = this.difficulty();
    return (this.index()?.kills ?? []).filter(kill => kill.difficulty === difficulty);
  });

  readonly progression = computed<GuildProgress[]>(() =>
    guildProgression(this.difficultyKills(), this.difficulty()?.id ?? 0, this.index()?.bosses.length ?? 0));

  private readonly changes = computed(() => {
    const newLogs = this.index()?.newLogs;
    if (!newLogs?.size) {
      return new Map<string, ProgressChange>();
    }
    const previousKills = this.difficultyKills().filter(kill => !newLogs.has(logKey(kill)));
    const previous = guildProgression(previousKills, this.difficulty()?.id ?? 0, this.index()?.bosses.length ?? 0);
    return progressionChanges(this.progression(), previous);
  });

  private readonly since = computed(() => {
    const previousGeneratedAt = this.index()?.previousGeneratedAt;
    return previousGeneratedAt ? `since the scan of ${formatDate(previousGeneratedAt, 'd MMM, HH:mm', this.locale)}` : 'since the last scan';
  });

  readonly shownProgression = computed(() => filterProgression(this.progression(), {
    faction: FACTIONS.find(faction => faction.slug === this.factionFilter())?.id,
    realm: this.realmFilter()
  }));

  readonly guildLink = raidGuildLink;

  constructor() {
    setPageHeader(() => ({ lastEdited: this.lastEdited() }));
  }

  ngOnInit(): void {
    this.data.lastDifficulty.set(this.requestedDifficulty());
    this.loadData();
  }

  loadData(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.data.index()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: index => {
          this.index.set(index);
          this.isLoading.set(false);
        },
        error: error => {
          console.error('Failed to load the raid logs:', error);
          this.loadError.set('The raid logs could not be loaded.');
          this.isLoading.set(false);
        }
      });
  }

  setDifficulty(slug: string): void {
    if (slug === this.difficulty()?.slug) {
      return;
    }

    this.requestedDifficulty.set(slug);
    this.data.lastDifficulty.set(slug);
    this.writeUrl();
  }

  resetFilters(): void {
    this.factionFilter.set(undefined);
    this.realmFilter.set(undefined);
    this.writeUrl();
  }

  setFactionFilter(value: FilterDropdownValue): void {
    this.factionFilter.set(typeof value === 'string' ? value : undefined);
    this.writeUrl();
  }

  setRealmFilter(value: FilterDropdownValue): void {
    this.realmFilter.set(typeof value === 'string' ? value : undefined);
    this.writeUrl();
  }

  change(row: GuildProgress): ProgressChange | undefined {
    return this.changes().get(guildKey(row.guild));
  }

  newLabel(difficulty: string): string {
    return `New on ${difficulty} ${this.since()}`;
  }

  gainLabel(change: ProgressChange): string {
    const bosses = this.pipBosses().filter(boss => change.bosses.has(boss.index)).map(boss => boss.shortName);
    return `Killed ${new Intl.ListFormat('en-GB').format(bosses)} ${this.since()}`;
  }

  pipTitle(boss: RaidBoss, kill: RaidKill | undefined, fresh: boolean): string {
    if (!kill) {
      return `${boss.shortName}: not killed yet`;
    }
    const title = `${boss.shortName}: first kill ${new Date(kill.killedAt).toLocaleDateString('en-GB')}`;
    return fresh ? `${title}, new ${this.since()}` : title;
  }

  private writeUrl(): void {
    this.replaceUrl({
      difficulty: this.difficulty()?.slug ?? null,
      faction: this.factionFilter() ?? null,
      realm: this.realmFilter() ?? null
    });
  }
}
