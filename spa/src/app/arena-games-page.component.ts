import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { getArmoryUrl } from '../utils/armory';
import { getLocalTimeZoneLabel } from '../utils/time-zone-label';
import {
  ArenaPlayer,
  ArenaPlayerRow,
  ArenaSortKey,
  REWARD_MIN_WINS,
  SortDirection,
  getGladiatorCutoff,
  sortArenaRows,
  toArenaRows
} from './arena-games';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { DataFileService } from './services/data-file.service';
import { getClassColor } from './class-colors';
import { UpdateBarComponent } from './update-bar.component';

/** A character counts as active, and is listed, once they have played this many rated 2v2 games. */
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
  imports: [CommonModule, BackToTopButtonComponent, UpdateBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArenaGamesPageComponent implements OnInit {
  private readonly dataFiles = inject(DataFileService);
  private readonly destroyRef = inject(DestroyRef);

  readonly minGames = MIN_GAMES;
  readonly minWins = REWARD_MIN_WINS;
  readonly sortColumns = SORT_COLUMNS;
  readonly dataset = signal<RatedArenaGames | undefined>(undefined);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  // Rating first, so the Gladiator cutoff line shows straight away.
  readonly sortKey = signal<ArenaSortKey>('rating');
  readonly sortDirection = signal<SortDirection>('desc');

  private readonly rows = computed(() => toArenaRows(this.dataset()?.players ?? [], MIN_GAMES));
  readonly players = computed(() => sortArenaRows(this.rows(), this.sortKey(), this.sortDirection()));
  readonly eligibleCount = computed(() => this.rows().filter(row => row.wins >= REWARD_MIN_WINS).length);
  readonly cutoff = computed(() => getGladiatorCutoff(this.rows()));
  /**
   * The row the Gladiator line goes under: where the rating sort crosses the cutoff, either
   * way round. -1 when the table is sorted by anything else, as the line would mean nothing.
   */
  readonly cutoffLineAfter = computed(() => {
    const cutoff = this.cutoff();
    const rows = this.players();
    if (!cutoff || this.sortKey() !== 'rating') {
      return -1;
    }

    return rows.findIndex((row, index) =>
      index + 1 < rows.length && (row.rating >= cutoff.rating) !== (rows[index + 1].rating >= cutoff.rating)
    );
  });
  /** The start of the latest counted game, shown in local time in the update bar. */
  readonly lastEdited = computed(() => {
    const latest = this.dataset()?.lastMatchStart;
    return latest ? new Date(latest) : undefined;
  });
  readonly lastEditedTimeZoneLabel = computed(() => getLocalTimeZoneLabel(this.lastEdited()));

  readonly getArmoryUrl = getArmoryUrl;

  ngOnInit(): void {
    this.loadData();
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

  isInsideCutoff(player: ArenaPlayerRow): boolean {
    const cutoff = this.cutoff();
    return !!cutoff && player.rating >= cutoff.rating;
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
    this.isLoading.set(true);
    this.loadError.set(undefined);

    this.dataFiles.getJson<RatedArenaGames>('rated-2v2-arena-games.json')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: dataset => {
          this.dataset.set(dataset);
          this.isLoading.set(false);
        },
        error: error => {
          console.error('Failed to load rated 2v2 arena games:', error);
          this.loadError.set('The arena data could not be loaded. Please try again.');
          this.isLoading.set(false);
        }
      });
  }
}
