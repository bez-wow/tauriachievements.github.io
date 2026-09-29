import { CommonModule, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { getClassIconPath } from '../utils/classIconHelper';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { FilterDropdownCoordinatorService } from './filter-dropdown-coordinator.service';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { FilterDropdownValue } from './filter-dropdown.types';
import {
  RatedBattlegroundMatch,
  RatedBattlegroundMember,
  RatedLeaderboardMetric,
  RatedMapSummary,
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
import { UpdateBarComponent } from './update-bar.component';

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
  standalone: true,
  imports: [
    CommonModule,
    UpdateBarComponent,
    BackToTopButtonComponent,
    FilterDropdownComponent,
    RatedBattlegroundPlayerHistoryComponent,
    RatedBattlegroundViewSwitcherComponent
  ],
  providers: [FilterDropdownCoordinatorService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RatedBattlegroundPageComponent implements OnInit {
  @ViewChild('leaderboardPanel') private leaderboardPanel?: ElementRef<HTMLElement>;

  private readonly service = inject(RatedBattlegroundsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);

  readonly matches = signal<RatedBattlegroundMatch[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly selectedMap = signal('all');
  readonly selectedMetric = signal<RatedLeaderboardMetric>('rating');
  readonly selectedMatchId = signal<number | undefined>(undefined);
  readonly selectedPlayer = signal<RatedPlayerSummary | undefined>(undefined);
  readonly selectedView = signal<RatedBattlegroundContentView>('players');
  readonly leaderboardPage = signal(1);
  readonly leaderboardPageSize = LEADERBOARD_PAGE_SIZE;

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
  readonly leaderboardTotalPages = computed(() => Math.max(1, Math.ceil(this.rankedPlayers().length / LEADERBOARD_PAGE_SIZE)));
  readonly paginatedPlayers = computed(() => {
    const page = Math.min(this.leaderboardPage(), this.leaderboardTotalPages());
    const start = (page - 1) * LEADERBOARD_PAGE_SIZE;
    return this.rankedPlayers().slice(start, start + LEADERBOARD_PAGE_SIZE);
  });
  readonly leaderboardRangeStart = computed(() => this.rankedPlayers().length
    ? (this.leaderboardPage() - 1) * LEADERBOARD_PAGE_SIZE + 1
    : 0);
  readonly leaderboardRangeEnd = computed(() => Math.min(
    this.leaderboardPage() * LEADERBOARD_PAGE_SIZE,
    this.rankedPlayers().length
  ));
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

  ngOnInit(): void {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.selectedView.set(params.get('view') === 'matches' ? 'matches' : 'players');
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
  }

  setMetric(value: FilterDropdownValue): void {
    if (typeof value !== 'string' || !METRIC_OPTIONS.some(option => option.value === value)) {
      return;
    }
    this.selectedMetric.set(value as RatedLeaderboardMetric);
    this.leaderboardPage.set(1);
  }

  setView(view: RatedBattlegroundContentView): void {
    this.selectedView.set(view);
    const viewUrl = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: { view: view === 'matches' ? 'matches' : null },
      queryParamsHandling: 'merge'
    });
    this.location.replaceState(this.router.serializeUrl(viewUrl));
  }

  setLeaderboardPage(page: number): void {
    const targetPage = Math.min(Math.max(1, page), this.leaderboardTotalPages());
    if (targetPage === this.leaderboardPage()) {
      return;
    }
    this.leaderboardPage.set(targetPage);
    requestAnimationFrame(() => this.leaderboardPanel?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  playerRank(index: number): number {
    return (this.leaderboardPage() - 1) * LEADERBOARD_PAGE_SIZE + index + 1;
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

  memberTrackKey(_index: number, member: RatedBattlegroundMember): string {
    return `${member.realmid}:${member.guid}`;
  }

  playerTrackKey(_index: number, player: RatedPlayerSummary): string {
    return player.key;
  }

  mapTrackKey(_index: number, map: RatedMapSummary): string {
    return map.name;
  }

  matchTrackKey(_index: number, match: RatedBattlegroundMatch): number {
    return match.matchid;
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
}
