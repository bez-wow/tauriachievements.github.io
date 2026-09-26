import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { getArmoryUrl, getGuildArmoryUrl } from '../utils/armory';
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
  RatedPlayerSummary,
  RatedTeamSummary,
  buildRatedBattlegroundAnalytics,
  buildTeamSummary,
  formatCompact,
  formatDuration,
  formatPlayedTime,
  formatUnixDateTime,
  getClassColor,
  getClassName,
  getFactionLabel,
  getObjectives,
  getSpec,
  metricValue
} from './rated-battleground-stats';
import { RatedBattlegroundsService } from './rated-battlegrounds.service';
import { UpdateBarComponent } from './update-bar.component';

const METRIC_OPTIONS: ReadonlyArray<{ value: RatedLeaderboardMetric; label: string }> = [
  { value: 'damage', label: 'Total damage' },
  { value: 'healing', label: 'Total healing' },
  { value: 'kills', label: 'Killing blows' },
  { value: 'honor', label: 'Honor earned' },
  { value: 'rating', label: 'Net rating change' },
  { value: 'mmr', label: 'Peak MMR' },
  { value: 'games', label: 'Games played' },
  { value: 'wins', label: 'Wins' }
];

const METRIC_LABELS: Readonly<Record<RatedLeaderboardMetric, string>> = Object.fromEntries(
  METRIC_OPTIONS.map(option => [option.value, option.label])
) as Record<RatedLeaderboardMetric, string>;

@Component({
  selector: 'app-rated-battleground-page',
  templateUrl: './rated-battleground-page.component.html',
  styleUrls: ['./rated-battleground-page.component.scss'],
  standalone: true,
  imports: [CommonModule, UpdateBarComponent, BackToTopButtonComponent, FilterDropdownComponent],
  providers: [FilterDropdownCoordinatorService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RatedBattlegroundPageComponent implements OnInit {
  private readonly service = inject(RatedBattlegroundsService);

  readonly matches = signal<RatedBattlegroundMatch[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly selectedMap = signal('all');
  readonly selectedMetric = signal<RatedLeaderboardMetric>('damage');
  readonly playerSearch = signal('');
  readonly selectedMatchId = signal<number | undefined>(undefined);

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
    const search = this.playerSearch().trim().toLocaleLowerCase();
    const metric = this.selectedMetric();
    return this.analytics().players
      .filter(player => !search || [player.name, player.guild, player.realm, getClassName(player.classId), getSpec(player.specId).name]
        .some(value => value.toLocaleLowerCase().includes(search)))
      .sort((left, right) => metricValue(right, metric) - metricValue(left, metric)
        || right.wins - left.wins
        || left.name.localeCompare(right.name));
  });
  readonly matchArchive = computed(() => [...this.filteredMatches()].sort((left, right) => right.starttime - left.starttime));
  readonly selectedMatch = computed(() => {
    const archive = this.matchArchive();
    return archive.find(match => match.matchid === this.selectedMatchId()) ?? archive[0];
  });
  readonly selectedTeams = computed(() => {
    const match = this.selectedMatch();
    return match ? [buildTeamSummary(match, match.winner), buildTeamSummary(match, match.winner === 0 ? 1 : 0)] : [];
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
  readonly formatCompact = formatCompact;
  readonly formatDuration = formatDuration;
  readonly formatPlayedTime = formatPlayedTime;
  readonly formatUnixDateTime = formatUnixDateTime;

  ngOnInit(): void {
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
  }

  setMetric(value: FilterDropdownValue): void {
    if (typeof value !== 'string' || !METRIC_OPTIONS.some(option => option.value === value)) {
      return;
    }
    this.selectedMetric.set(value as RatedLeaderboardMetric);
  }

  setPlayerSearch(value: string): void {
    this.playerSearch.set(value);
  }

  selectMatch(matchId: number): void {
    this.selectedMatchId.set(matchId);
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

  playerArmoryUrl(player: RatedPlayerSummary): string {
    return getArmoryUrl(player.name, player.realm);
  }

  memberArmoryUrl(member: RatedBattlegroundMember): string {
    return getArmoryUrl(member['character-minimal-data'].charname, member.realmName);
  }

  guildArmoryUrl(member: RatedBattlegroundMember): string {
    return getGuildArmoryUrl(member['character-minimal-data'].guildname, member.realmName);
  }

  raceIcon(member: RatedBattlegroundMember): string {
    const character = member['character-minimal-data'];
    return `assets/race-icons/${character.race}-${character.gender}.gif`;
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
