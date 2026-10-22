import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getClassColor } from '../../game/class-colors';
import { RaidDifficultySwitchComponent } from './raid-difficulty-switch.component';
import { RaidBoss, RaidKill, RaidLogsIndex, RaidPerformer } from './raid-logs.types';
import { defaultDifficulty, encounterKey, logKey } from './raid-logs';
import { fastestKills, latestKills } from './raid-progression';
import { formatAgo, formatFightTime, formatPerSecond, raidBossLink, raidLogLink } from './raid-display';
import { RevealDirective } from '../../shared/motion/reveal.directive';
import { RaidLogsDataService } from './raid-logs-data.service';
import { injectReplaceUrl } from '../../core/url-state';
import { LoadStateComponent } from '../../shared/load-state.component';
import { setPageHeader } from '../../core/page-header';

interface BossCard {
  boss: RaidBoss;
  kills: number;
  fastest?: RaidKill;
  dps?: RaidPerformer;
  hps?: RaidPerformer;
}

const RECENT_KILLS = 12;

@Component({
  selector: 'app-raid-logs-page',
  imports: [RouterLink, RaidDifficultySwitchComponent, RevealDirective, DatePipe, DecimalPipe, LoadStateComponent],
  templateUrl: './raid-logs-page.component.html',
  styleUrl: './raid-logs-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaidLogsPageComponent implements OnInit {
  readonly logKey = logKey;

  private readonly data = inject(RaidLogsDataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly replaceUrl = injectReplaceUrl();

  readonly index = signal<RaidLogsIndex | undefined>(undefined);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly now = signal(Date.now());
  readonly lastEdited = computed(() => this.index()?.generatedAt);

  private readonly requestedDifficulty = signal(this.route.snapshot.queryParamMap.get('difficulty') ?? this.data.lastDifficulty());

  readonly difficulty = computed(() => {
    const difficulties = this.index()?.difficulties ?? [];
    return difficulties.find(difficulty => difficulty.slug === this.requestedDifficulty() && difficulty.kills > 0)
      ?? defaultDifficulty(difficulties);
  });

  readonly kills = computed(() => {
    const difficulty = this.difficulty();
    return (this.index()?.kills ?? []).filter(kill => kill.difficulty === difficulty);
  });

  readonly bossCards = computed<BossCard[]>(() => {
    const index = this.index();
    const difficulty = this.difficulty();
    if (!index || !difficulty) {
      return [];
    }

    return index.bosses.map(boss => {
      const kills = this.kills().filter(kill => kill.boss === boss);
      const top = index.top.get(encounterKey(boss.slug, difficulty.slug));
      return { boss, kills: kills.length, fastest: fastestKills(kills)[0], dps: top?.dps, hps: top?.hps };
    });
  });

  readonly recentKills = computed(() => latestKills(this.kills()).slice(0, RECENT_KILLS));

  readonly bossLink = raidBossLink;
  readonly logLink = raidLogLink;
  readonly formatFightTime = formatFightTime;
  readonly formatPerSecond = formatPerSecond;

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
          this.now.set(Date.now());
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

  classColor(classId: number): string {
    return getClassColor(classId) ?? '#e0e0e0';
  }

  ago(kill: RaidKill): string {
    return formatAgo(kill.killedAt, this.now());
  }

  private writeUrl(): void {
    this.replaceUrl({ difficulty: this.difficulty()?.slug ?? null });
  }
}
