import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { getArmoryUrl } from '../../game/armory';
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
import { GlideDirective } from '../../shared/motion/glide.directive';
import { DataFileService } from '../../core/data-file.service';
import { getClassColor } from '../../game/class-colors';
import { setPageHeader } from '../../core/page-header';

const MIN_GAMES = 50;

interface SortColumn {
  readonly key: ArenaSortKey;
  readonly label: string;
  readonly shortLabel: string;
}

const SORT_COLUMNS: readonly SortColumn[] = [
  { key: 'games', label: 'Games', shortLabel: 'Games' },
  { key: 'wins', label: 'Wins', shortLabel: 'W' },
  { key: 'losses', label: 'Losses', shortLabel: 'L' },
  { key: 'winRate', label: 'Win rate', shortLabel: 'Win%' },
  { key: 'rating', label: 'Rating', shortLabel: 'Rating' }
];

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
  imports: [GlideDirective, DatePipe, DecimalPipe, PercentPipe],
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
  readonly sortKey = signal<ArenaSortKey>('rating');
  readonly sortDirection = signal<SortDirection>('desc');

  private readonly rows = computed(() => toArenaRows(this.dataset()?.players ?? [], MIN_GAMES));
  readonly players = computed(() => sortArenaRows(this.rows(), this.sortKey(), this.sortDirection()));
  readonly eligibleCount = computed(() => this.rows().filter(row => row.wins >= REWARD_MIN_WINS).length);
  readonly cutoffs = computed(() => getTitleCutoffs(this.rows(), ARENA_TITLES[this.bracket() ?? '2v2']));
  readonly hasSeasonGladiator = computed(() =>
    this.cutoffs().some(cutoff => cutoff.title.slug === 'season-gladiator')
  );
  private readonly titles = computed(() => {
    const cutoffs = this.cutoffs();
    return new Map(this.rows().map(row => [row, getTitle(row.rating, cutoffs)]));
  });
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
  readonly lastEdited = computed(() => {
    const latest = this.dataset()?.lastMatchStart;
    return latest ? new Date(latest) : undefined;
  });

  readonly getArmoryUrl = getArmoryUrl;
  readonly formatTitleShare = formatTitleShare;

  constructor() {
    setPageHeader(() => ({ lastEdited: this.lastEdited(), label: 'Latest game:' }));
  }

  ngOnInit(): void {
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

  exactSpots(cutoff: TitleCutoff): number {
    return (this.rows().length * cutoff.title.topPerMille) / 1000;
  }

  tiesHint(cutoff: TitleCutoff): string {
    return `${cutoff.ties} more ${cutoff.ties === 1 ? 'holder' : 'holders'}: players on the same rating share one spot`;
  }

  titleOf(player: ArenaPlayerRow): TitleCutoff | undefined {
    return this.titles().get(player);
  }

  groupClasses(index: number): string {
    const group = this.titleGroups().get(index);
    return group ? `tier-${group.title.slug}` : 'is-untitled';
  }

  isRewardEligible(player: ArenaPlayerRow): boolean {
    return player.wins >= REWARD_MIN_WINS;
  }

  getPlayerClassColor(player: ArenaPlayerRow): string {
    return getClassColor(player.class) ?? '#e0e0e0';
  }

  private loadData(): void {
    const bracket = this.bracket() ?? '2v2';
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.dataset.set(undefined);

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
