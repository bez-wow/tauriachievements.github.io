import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { getArmoryUrl } from '../utils/armory';
import { getLocalTimeZoneLabel } from '../utils/time-zone-label';
import {
  ARENA_BRACKETS,
  ARENA_TITLES,
  ArenaBracket,
  ArenaPlayer,
  ArenaPlayerRow,
  ArenaSortKey,
  REWARD_MIN_WINS,
  SortDirection,
  TitleCutoff,
  formatTitleShare,
  getArenaGamesFile,
  getTitle,
  getTitleCutoffs,
  parseArenaBracket,
  sortArenaRows,
  toArenaRows
} from './arena-games';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { GlideDirective } from './glide.directive';
import { DataFileService } from './services/data-file.service';
import { getClassColor } from './class-colors';
import { UpdateBarComponent } from './update-bar.component';

/** A character counts as active, and is listed, once they have played this many rated games in the bracket. */
const MIN_GAMES = 50;

interface SortColumn {
  readonly key: ArenaSortKey;
  readonly label: string;
  /** The header on phones, where the full labels do not fit. */
  readonly shortLabel: string;
}

const SORT_COLUMNS: readonly SortColumn[] = [
  { key: 'games', label: 'Games', shortLabel: 'Games' },
  { key: 'wins', label: 'Wins', shortLabel: 'W' },
  { key: 'losses', label: 'Losses', shortLabel: 'L' },
  { key: 'winRate', label: 'Win rate', shortLabel: 'Win%' },
  { key: 'rating', label: 'Rating', shortLabel: 'Rating' }
];

/** Written by BattlegroundCollector (RatedArenaGameCounter); players are sorted by games, most first. */
interface RatedArenaGames {
  seasonStart: string;
  lastMatchId: number;
  lastMatchStart: string | null;
  matchCount: number;
  players: ReadonlyArray<ArenaPlayer>;
}

@Component({
  selector: 'app-arena-games-page',
  templateUrl: './arena-games-page.component.html',
  styleUrls: ['./arena-games-page.component.scss'],
  standalone: true,
  imports: [CommonModule, BackToTopButtonComponent, GlideDirective, UpdateBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArenaGamesPageComponent implements OnInit {
  private readonly dataFiles = inject(DataFileService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private loading?: Subscription;

  readonly minGames = MIN_GAMES;
  readonly minWins = REWARD_MIN_WINS;
  readonly sortColumns = SORT_COLUMNS;
  readonly brackets = ARENA_BRACKETS;
  readonly bracket = signal<ArenaBracket | undefined>(undefined);
  readonly dataset = signal<RatedArenaGames | undefined>(undefined);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  // Rating first, so the title lines show straight away.
  readonly sortKey = signal<ArenaSortKey>('rating');
  readonly sortDirection = signal<SortDirection>('desc');

  private readonly rows = computed(() => toArenaRows(this.dataset()?.players ?? [], MIN_GAMES));
  readonly players = computed(() => sortArenaRows(this.rows(), this.sortKey(), this.sortDirection()));
  readonly eligibleCount = computed(() => this.rows().filter(row => row.wins >= REWARD_MIN_WINS).length);
  /** This bracket's titles and where each one's line falls. */
  readonly cutoffs = computed(() => getTitleCutoffs(this.rows(), ARENA_TITLES[this.bracket() ?? '2v2']));
  private readonly titles = computed(() => {
    const cutoffs = this.cutoffs();
    return new Map(this.rows().map(row => [row, getTitle(row.rating, cutoffs)]));
  });
  /** How many players hold each title. */
  readonly titleCounts = computed(() => {
    const counts = new Map<TitleCutoff, number>();
    for (const cutoff of this.titles().values()) {
      if (cutoff) {
        counts.set(cutoff, (counts.get(cutoff) ?? 0) + 1);
      }
    }
    return counts;
  });
  readonly untitledCount = computed(() =>
    [...this.titles().values()].filter(cutoff => !cutoff).length
  );
  /**
   * The group headings, by the index of the row each goes above: the first row and every row
   * whose title differs from the one before, with null for the players without a title. Every
   * player then sits under the heading of the title they hold. Only in the rating sort, either
   * way round; any other sort mixes the titles.
   */
  readonly titleGroups = computed(() => {
    const groups = new Map<number, TitleCutoff | null>();
    const rows = this.players();
    if (this.sortKey() !== 'rating') {
      return groups;
    }

    rows.forEach((row, index) => {
      const title = this.titleOf(row) ?? null;
      if (index === 0 || title !== (this.titleOf(rows[index - 1]) ?? null)) {
        groups.set(index, title);
      }
    });
    return groups;
  });
  /** The start of the latest counted game, shown in local time in the update bar. */
  readonly lastEdited = computed(() => {
    const latest = this.dataset()?.lastMatchStart;
    return latest ? new Date(latest) : undefined;
  });
  readonly lastEditedTimeZoneLabel = computed(() => getLocalTimeZoneLabel(this.lastEdited()));

  readonly getArmoryUrl = getArmoryUrl;
  readonly formatTitleShare = formatTitleShare;

  ngOnInit(): void {
    // The bracket lives in the address (?bracket=3v3), so a link opens the same table.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const bracket = parseArenaBracket(params.get('bracket'));
        if (bracket !== this.bracket()) {
          this.bracket.set(bracket);
          this.loadData();
        }
      });
  }

  selectBracket(bracket: ArenaBracket): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { bracket: bracket === '2v2' ? null : bracket },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  retryLoad(): void {
    this.loadData();
  }

  /** A new column sorts most first; clicking the sorted column again flips it. */
  sortBy(key: ArenaSortKey): void {
    if (this.sortKey() === key) {
      this.sortDirection.update(direction => direction === 'desc' ? 'asc' : 'desc');
      return;
    }

    this.sortKey.set(key);
    this.sortDirection.set('desc');
  }

  ariaSort(key: ArenaSortKey): string | null {
    if (this.sortKey() !== key) {
      return null;
    }

    return this.sortDirection() === 'desc' ? 'descending' : 'ascending';
  }

  /** The active players times the title's share, before rounding up: at most three decimals. */
  exactSpots(cutoff: TitleCutoff): number {
    return (this.rows().length * cutoff.title.topPerMille) / 1000;
  }

  titleOf(player: ArenaPlayerRow): TitleCutoff | undefined {
    return this.titles().get(player);
  }

  /** A group heading carries its title's colour, or the muted one for the players without a title. */
  groupClasses(index: number): string {
    const group = this.titleGroups().get(index);
    return group ? `tier-${group.title.slug}` : 'is-untitled';
  }

  isRewardEligible(player: ArenaPlayerRow): boolean {
    return player.wins >= REWARD_MIN_WINS;
  }

  trackPlayer(_index: number, player: ArenaPlayerRow): string {
    return `${player.realm}::${player.guid}`;
  }

  getPlayerClassColor(player: ArenaPlayerRow): string {
    return getClassColor(player.class) ?? '#e0e0e0';
  }

  private loadData(): void {
    const bracket = this.bracket() ?? '2v2';
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.dataset.set(undefined);

    // A quick switch back and forth must not let the slower file land last.
    this.loading?.unsubscribe();
    this.loading = this.dataFiles.getJson<RatedArenaGames>(getArenaGamesFile(bracket))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: dataset => {
          this.dataset.set(dataset);
          this.isLoading.set(false);
        },
        error: error => {
          console.error(`Failed to load rated ${bracket} arena games:`, error);
          this.loadError.set('The arena data could not be loaded. Please try again.');
          this.isLoading.set(false);
        }
      });
  }
}
