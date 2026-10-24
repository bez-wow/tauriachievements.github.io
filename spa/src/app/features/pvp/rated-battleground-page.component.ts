import { DecimalPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { getClassIconPath } from '../../game/classIconHelper';
import { FilterDropdownCoordinatorService } from '../../shared/filter-dropdown-coordinator.service';
import { FilterDropdownComponent } from '../../shared/filter-dropdown.component';
import { FilterDropdownValue } from '../../shared/filter-dropdown.types';
import { PagerComponent } from '../../shared/pager.component';
import { pageCount, pageSlice } from '../../shared/pager';
import {
  RatedBattlegroundMatch,
  RatedLeaderboardMetric,
  RatedPlayerMatchHistoryEntry,
  RatedPlayerSummary,
  RatedTeamSummary,
  buildRatedBattlegroundAnalytics,
  buildTeamSummary,
  formatCompact,
  formatDuration,
  formatUnixDateTime,
  getClassColor,
  getClassName,
  getFactionLabel,
  getObjectives,
  getSpec,
  getWinningSide,
  metricValue
} from './rated-battleground-stats';
import { RatedBattlegroundsService } from './rated-battlegrounds.service';
import { RatedBattlegroundPlayerHistoryComponent } from './rated-battleground-player-history.component';
import {
  RatedBattlegroundContentView,
  RatedBattlegroundViewSwitcherComponent
} from './rated-battleground-view-switcher.component';
import { injectReplaceUrl, parsePage } from '../../core/url-state';
import { setPageHeader } from '../../core/page-header';

const METRIC_OPTIONS: ReadonlyArray<{ value: RatedLeaderboardMetric; label: string }> = [
  { value: 'rating', label: 'Net rating change' },
  { value: 'damage', label: 'Total damage' },
  { value: 'healing', label: 'Total healing' },
  { value: 'kills', label: 'Killing blows' },
  { value: 'honor', label: 'Honor earned' },
  { value: 'mmr', label: 'Peak MMR' },
  { value: 'games', label: 'Games played' },
  { value: 'wins', label: 'Wins' }
];

const METRIC_LABELS: Readonly<Record<RatedLeaderboardMetric, string>> = Object.fromEntries(
  METRIC_OPTIONS.map(option => [option.value, option.label])
) as Record<RatedLeaderboardMetric, string>;

const LEADERBOARD_PAGE_SIZE = 25;

@Component({
  selector: 'app-rated-battleground-page',
  templateUrl: './rated-battleground-page.component.html',
  styleUrls: ['./rated-battleground-page.component.scss'],
  imports: [
    FilterDropdownComponent,
    RatedBattlegroundPlayerHistoryComponent,
    RatedBattlegroundViewSwitcherComponent,
    PagerComponent,
    DecimalPipe,
    PercentPipe
  ],
  providers: [FilterDropdownCoordinatorService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RatedBattlegroundPageComponent implements OnInit {
  private readonly service = inject(RatedBattlegroundsService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly replaceUrl = injectReplaceUrl();

  readonly matches = signal<RatedBattlegroundMatch[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly selectedMap = signal('all');
  readonly selectedMetric = signal<RatedLeaderboardMetric>('rating');
  readonly selectedMatchId = signal<number | undefined>(undefined);
  readonly selectedPlayer = signal<RatedPlayerSummary | undefined>(undefined);
  readonly selectedView = signal<RatedBattlegroundContentView>('players');
  readonly leaderboardPage = signal(1);

  readonly metricOptions = METRIC_OPTIONS;
  readonly allAnalytics = computed(() => buildRatedBattlegroundAnalytics(this.matches()));
  readonly mapOptions = computed(() => [
    { value: 'all', label: 'All battlegrounds' },
    ...this.allAnalytics().maps.map(map => ({ value: map.name, label: map.name }))
  ]);
  readonly filteredMatches = computed(() => {
    const selectedMap = this.selectedMap();
    return this.matches().filter(match => selectedMap === 'all' || match.mapname === selectedMap);
  });
  readonly analytics = computed(() => buildRatedBattlegroundAnalytics(this.filteredMatches()));
  readonly rankedPlayers = computed(() => {
    const metric = this.selectedMetric();
    return this.analytics().players
      .sort((left, right) => metricValue(right, metric) - metricValue(left, metric)
        || right.wins - left.wins
        || left.name.localeCompare(right.name));
  });
  readonly leaderboardTotalPages = computed(() => pageCount(this.rankedPlayers().length, LEADERBOARD_PAGE_SIZE));
  readonly currentLeaderboardPage = computed(() => Math.min(this.leaderboardPage(), this.leaderboardTotalPages()));
  readonly paginatedPlayers = computed(() =>
    pageSlice(this.rankedPlayers(), this.currentLeaderboardPage(), LEADERBOARD_PAGE_SIZE));
  readonly matchArchive = computed(() => [...this.filteredMatches()].sort((left, right) => right.starttime - left.starttime));
  readonly selectedMatch = computed(() => {
    const archive = this.matchArchive();
    return archive.find(match => match.matchid === this.selectedMatchId()) ?? archive[0];
  });
  readonly selectedTeams = computed(() => {
    const match = this.selectedMatch();
    if (!match) {
      return [];
    }
    const winningSide = getWinningSide(match);
    return [buildTeamSummary(match, winningSide), buildTeamSummary(match, winningSide === 0 ? 1 : 0)];
  });
  readonly selectedPlayerHistory = computed<RatedPlayerMatchHistoryEntry[]>(() => {
    const player = this.selectedPlayer();
    if (!player) {
      return [];
    }

    return this.matches()
      .flatMap(match => match.members
        .filter(member => member.guid === player.guid && member.realmid === player.realmId)
        .map(member => ({ match, member, won: member.side === getWinningSide(match) })))
      .sort((left, right) => left.match.starttime - right.match.starttime || left.match.matchid - right.match.matchid);
  });
  readonly lastEdited = computed(() => {
    const latest = this.matches().at(-1)?.starttime;
    return latest ? new Date(latest * 1000) : undefined;
  });
  readonly hasData = computed(() => this.matches().length > 0);
  readonly showLoading = computed(() => this.isLoading() && !this.hasData());
  readonly showError = computed(() => !this.isLoading() && !!this.loadError() && !this.hasData());
  readonly showContent = computed(() => !this.showLoading() && !this.showError() && this.hasData());

  readonly getClassIconPath = getClassIconPath;
  readonly getClassColor = getClassColor;
  readonly getClassName = getClassName;
  readonly getFactionLabel = getFactionLabel;
  readonly getSpec = getSpec;
  readonly getObjectives = getObjectives;
  readonly getWinningSide = getWinningSide;
  readonly formatCompact = formatCompact;
  readonly formatDuration = formatDuration;
  readonly formatUnixDateTime = formatUnixDateTime;

  constructor() {
    setPageHeader(() => ({ lastEdited: this.lastEdited(), label: 'Latest match:' }));
  }

  ngOnInit(): void {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.selectedView.set(params.get('view') === 'matches' ? 'matches' : 'players');
        this.leaderboardPage.set(parsePage(params.get('page')));
      });
    this.loadMatches();
  }

  retryLoad(): void {
    this.loadMatches();
  }

  setMap(value: FilterDropdownValue): void {
    if (typeof value !== 'string' || !this.mapOptions().some(option => option.value === value)) {
      return;
    }
    this.selectedMap.set(value);
    this.selectedMatchId.set(undefined);
    this.leaderboardPage.set(1);
    this.writeUrl();
  }

  setMetric(value: FilterDropdownValue): void {
    if (typeof value !== 'string' || !METRIC_OPTIONS.some(option => option.value === value)) {
      return;
    }
    this.selectedMetric.set(value as RatedLeaderboardMetric);
    this.leaderboardPage.set(1);
    this.writeUrl();
  }

  setView(view: RatedBattlegroundContentView): void {
    this.selectedView.set(view);
    this.writeUrl();
  }

  setLeaderboardPage(page: number): void {
    this.leaderboardPage.set(page);
    this.writeUrl();
  }

  playerRank(index: number): number {
    return (this.currentLeaderboardPage() - 1) * LEADERBOARD_PAGE_SIZE + index + 1;
  }

  selectMatch(matchId: number): void {
    this.selectedMatchId.set(matchId);
  }

  openPlayerHistory(player: RatedPlayerSummary): void {
    this.selectedPlayer.set(player);
  }

  closePlayerHistory(): void {
    this.selectedPlayer.set(undefined);
  }

  metricLabel(): string {
    return METRIC_LABELS[this.selectedMetric()];
  }

  playerMetric(player: RatedPlayerSummary): string {
    const metric = this.selectedMetric();
    const value = metricValue(player, metric);
    if (metric === 'rating') {
      return `${value > 0 ? '+' : ''}${value.toLocaleString()}`;
    }
    if (metric === 'damage' || metric === 'healing') {
      return formatCompact(value);
    }
    return Math.round(value).toLocaleString();
  }

  teamName(team: RatedTeamSummary): string {
    return team.won ? 'Winning team' : 'Challenging team';
  }

  private loadMatches(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.service.getMatches().subscribe({
      next: matches => {
        this.matches.set(matches);
        this.selectedMatchId.set(matches.at(-1)?.matchid);
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        console.error('Failed to load rated battleground data:', error);
        this.matches.set([]);
        this.loadError.set('We could not load the rated battleground archive. Please try again.');
        this.isLoading.set(false);
      }
    });
  }

  private writeUrl(): void {
    const players = this.selectedView() === 'players';
    const page = this.leaderboardPage();
    this.replaceUrl({
      view: players ? null : 'matches',
      page: players && page > 1 ? page : null
    }, { merge: true });
  }
}
