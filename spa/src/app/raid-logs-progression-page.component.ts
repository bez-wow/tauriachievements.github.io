import { CommonModule, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { getLocalTimeZoneLabel } from '../utils/time-zone-label';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { FilterDropdownCoordinatorService } from './filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from './filter-dropdown.types';
import { RaidDifficultySwitchComponent } from './raid-difficulty-switch.component';
import {
  GuildProgress,
  RAID_REALMS,
  RaidBoss,
  RaidKill,
  RaidLogsIndex,
  bossesInKillOrder,
  defaultDifficulty,
  filterProgression,
  guildKey,
  guildProgression,
  raidGuildLink,
  realmSlug
} from './raid-logs';
import { RaidLogsDataService } from './services/raid-logs-data.service';
import { UpdateBarComponent } from './update-bar.component';

/** The faction dropdown's values, as `?faction=` has them, and the faction ids they stand for. */
const FACTIONS: ReadonlyArray<{ slug: string; id: number; label: string }> = [
  { slug: 'horde', id: 1, label: 'Horde' },
  { slug: 'alliance', id: 0, label: 'Alliance' }
];

/**
 * /raid-logs/guilds: every guild with a kill on one difficulty (`?difficulty=`), most bosses down
 * first, optionally only one faction's (`?faction=`) or one realm's (`?realm=`), ranked among
 * themselves. Reads only the index.
 */
@Component({
  selector: 'app-raid-logs-progression-page',
  standalone: true,
  imports: [CommonModule, RouterLink, UpdateBarComponent, BackToTopButtonComponent, RaidDifficultySwitchComponent, FilterDropdownComponent],
  templateUrl: './raid-logs-progression-page.component.html',
  styleUrl: './raid-logs-progression-page.component.scss',
  // The faction and realm dropdowns need it (NG0201 without it).
  providers: [FilterDropdownCoordinatorService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaidLogsProgressionPageComponent implements OnInit {
  private readonly data = inject(RaidLogsDataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  readonly index = signal<RaidLogsIndex | undefined>(undefined);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly lastEdited = computed(() => this.index()?.generatedAt);
  readonly lastEditedTimeZoneLabel = computed(() => getLocalTimeZoneLabel(this.lastEdited()));

  private readonly query = this.route.snapshot.queryParamMap;
  private readonly requestedDifficulty = signal(this.query.get('difficulty') ?? this.data.lastDifficulty());
  readonly factionFilter = signal(FACTIONS.find(faction => faction.slug === this.query.get('faction'))?.slug);
  readonly realmFilter = signal(RAID_REALMS.map(realmSlug).find(realm => realm === this.query.get('realm')));
  readonly hasFilters = computed(() => this.factionFilter() !== undefined || this.realmFilter() !== undefined);

  readonly factionOptions: ReadonlyArray<FilterDropdownOption> = [
    { value: undefined, label: 'All factions' },
    ...FACTIONS.map(faction => ({ value: faction.slug, label: faction.label }))
  ];
  readonly realmOptions: ReadonlyArray<FilterDropdownOption> = [
    { value: undefined, label: 'All realms' },
    ...RAID_REALMS.map(realm => ({ value: realmSlug(realm), label: realm }))
  ];
  readonly factionWidthLabels = this.factionOptions.map(option => option.label);
  readonly realmWidthLabels = this.realmOptions.map(option => option.label);

  /** The progress squares' order: the order raiders kill the bosses. */
  readonly pipBosses = computed(() => bossesInKillOrder(this.index()?.bosses ?? []));

  readonly difficulty = computed(() => {
    const difficulties = this.index()?.difficulties ?? [];
    return difficulties.find(difficulty => difficulty.slug === this.requestedDifficulty() && difficulty.kills > 0)
      ?? defaultDifficulty(difficulties);
  });

  readonly progression = computed<GuildProgress[]>(() => {
    const difficulty = this.difficulty();
    const kills = (this.index()?.kills ?? []).filter(kill => kill.difficulty === difficulty);
    return guildProgression(kills, difficulty?.id ?? 0, this.index()?.bosses.length ?? 0);
  });

  readonly shownProgression = computed(() => filterProgression(this.progression(), {
    faction: FACTIONS.find(faction => faction.slug === this.factionFilter())?.id,
    realm: this.realmFilter()
  }));

  readonly guildLink = raidGuildLink;

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

  /** Clears faction and realm; the difficulty stays. */
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

  /** The tooltip of a progress pip: the boss, and when the guild first killed it. */
  pipTitle(boss: RaidBoss, kill: RaidKill | undefined): string {
    return kill ? `${boss.shortName}: first kill ${new Date(kill.killedAt).toLocaleDateString('en-GB')}` : `${boss.shortName}: not killed yet`;
  }

  trackGuild(index: number, row: GuildProgress): string {
    return guildKey(row.guild);
  }

  /** The switch and the dropdowns keep the scroll position: no navigation, only the address bar changes. */
  private writeUrl(): void {
    const url = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: {
        difficulty: this.difficulty()?.slug ?? null,
        faction: this.factionFilter() ?? null,
        realm: this.realmFilter() ?? null
      }
    });
    this.location.replaceState(this.router.serializeUrl(url));
  }
}
