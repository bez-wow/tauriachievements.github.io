import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { RaceBySpecComponent } from '../../shared/spec-charts/race-by-spec.component';
import { RaceSample } from '../../shared/spec-charts/race-popularity';
import { RaidDifficulty, RaidKillDetails, RaidLogsIndex } from './raid-logs.types';
import { RoleFilter, parseRoleFilter } from './raid-display';
import { defaultDifficulty } from './raid-logs';
import { ChartView, RaidSpecPopularityChartComponent, parseChartView } from './raid-spec-popularity-chart.component';
import { RaidLogsDataService } from './raid-logs-data.service';
import { Role } from '../../game/wow';
import { injectReplaceUrl } from '../../core/url-state';
import { LoadStateComponent } from '../../shared/load-state.component';
import { setPageHeader } from '../../core/page-header';

@Component({
  selector: 'app-raid-logs-stats-page',
  imports: [RaidSpecPopularityChartComponent, RaceBySpecComponent, LoadStateComponent],
  templateUrl: './raid-logs-stats-page.component.html',
  styleUrl: './raid-logs-stats-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaidLogsStatsPageComponent implements OnInit {
  private readonly data = inject(RaidLogsDataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly replaceUrl = injectReplaceUrl();

  readonly index = signal<RaidLogsIndex | undefined>(undefined);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly popularityKills = signal<readonly RaidKillDetails[]>([]);
  readonly popularityLoading = signal(false);
  readonly popularityError = signal<string | undefined>(undefined);
  readonly raceRoles: readonly Role[] = ['dps', 'tank', 'healer'];
  readonly rosterSlots = computed(() => this.popularityKills().flatMap(kill => kill.members.flatMap((member): RaceSample[] =>
    member.spec ? [{
      name: member.character.name,
      realm: member.character.realm,
      class: member.character.classId,
      spec: member.spec.name,
      role: member.spec.role,
      race: member.character.race
    }] : [])));
  readonly lastEdited = computed(() => this.index()?.generatedAt);

  private readonly requestedDifficulty = signal(this.route.snapshot.queryParamMap.get('difficulty') ?? this.data.lastDifficulty());
  readonly chartView = signal<ChartView>(parseChartView(this.route.snapshot.queryParamMap.get('view')));
  readonly chartRole = signal<RoleFilter>(parseRoleFilter(this.route.snapshot.queryParamMap.get('role')));

  readonly difficulty = computed(() => {
    const difficulties = this.index()?.difficulties ?? [];
    return difficulties.find(difficulty => difficulty.slug === this.requestedDifficulty() && difficulty.kills > 0)
      ?? defaultDifficulty(difficulties);
  });

  private popularityRequest = 0;

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
          const difficulty = this.difficulty();
          if (difficulty) {
            this.loadPopularity(difficulty);
          }
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
    const difficulty = this.difficulty();
    if (difficulty) {
      this.loadPopularity(difficulty);
    }
  }

  setChartView(view: ChartView): void {
    this.chartView.set(view);
    this.writeUrl();
  }

  setChartRole(role: RoleFilter): void {
    this.chartRole.set(role);
    this.writeUrl();
  }

  retryPopularity(): void {
    const difficulty = this.difficulty();
    if (difficulty) {
      this.loadPopularity(difficulty);
    }
  }

  private loadPopularity(difficulty: RaidDifficulty): void {
    const index = this.index();
    if (!index) {
      return;
    }

    const request = ++this.popularityRequest;
    this.popularityKills.set([]);
    this.popularityLoading.set(true);
    this.popularityError.set(undefined);

    this.data.difficultyKills(index, difficulty)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: kills => {
          if (request !== this.popularityRequest) {
            return;
          }
          this.popularityKills.set(kills);
          this.popularityLoading.set(false);
        },
        error: error => {
          if (request !== this.popularityRequest) {
            return;
          }
          console.error('Failed to load the raid rosters:', error);
          this.popularityError.set('The raid rosters could not be loaded.');
          this.popularityLoading.set(false);
        }
      });
  }

  private writeUrl(): void {
    this.replaceUrl({
      difficulty: this.difficulty()?.slug ?? null,
      view: this.chartView() === 'popularity' ? null : this.chartView(),
      role: this.chartRole() === 'all' ? null : this.chartRole()
    });
  }
}
