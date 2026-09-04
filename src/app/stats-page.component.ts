import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  afterNextRender,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  type ChartConfiguration,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { LadderLastUpdatedService } from './services/ladder-last-updated.service';
import { ServerStatsService, ServerStatsSnapshot } from './services/server-stats.service';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { UpdateBarComponent } from './update-bar.component';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, DoughnutController, ArcElement, Tooltip, Legend);
Chart.defaults.color = '#9fa6b4';
Chart.defaults.font.family = "'Arial', sans-serif";

const CLASS_NAMES: Record<number, string> = {
  1: 'Warrior', 2: 'Paladin', 3: 'Hunter', 4: 'Rogue',
  5: 'Priest', 6: 'Death Knight', 7: 'Shaman', 8: 'Mage',
  9: 'Warlock', 10: 'Monk', 11: 'Druid', 12: 'Demon Hunter'
};

const CLASS_COLORS: Record<number, string> = {
  1: '#C69B3A', 2: '#F48CBA', 3: '#AAD372', 4: '#FFF468',
  5: '#E8E8E8', 6: '#C41E3A', 7: '#0070DD', 8: '#68CCEF',
  9: '#9482C9', 10: '#00FF98', 11: '#FF7C0A', 12: '#A330C9'
};

const RACE_NAMES: Record<number, string> = {
  1: 'Human', 2: 'Orc', 3: 'Dwarf', 4: 'Night Elf',
  5: 'Undead', 6: 'Tauren', 7: 'Gnome', 8: 'Troll',
  9: 'Goblin', 10: 'Blood Elf', 11: 'Draenei', 22: 'Worgen',
  24: 'Pandaren', 25: 'Pandaren (H)', 26: 'Pandaren (A)'
};

const UNKNOWN_CLASS_COLOR = '#888';

export interface ServerStats {
  totalPlayers: number;
  guildedPlayers: number;
  uniqueGuilds: number;
  avgAchievementPoints: number;
  maxAchievementPoints: number;
  avgHonorableKills: number;
  maxHonorableKills: number;
  factionLabels: string[];
  factionCounts: number[];
  classLabels: string[];
  classCounts: number[];
  classColors: string[];
  raceLabels: string[];
  raceCounts: number[];
  guildLabels: string[];
  guildCounts: number[];
  apBucketLabels: string[];
  apBucketCounts: number[];
  hkBucketLabels: string[];
  hkBucketCounts: number[];
  realmLabels: string[];
  realmCounts: number[];
}

/**
 * Maps the precomputed aggregates onto the shape the template and charts consume,
 * attaching the class and race names and the class colors that live in this layer.
 */
export function toServerStats(snapshot: ServerStatsSnapshot): ServerStats {
  return {
    totalPlayers: snapshot.totalPlayers,
    guildedPlayers: snapshot.guildedPlayers,
    uniqueGuilds: snapshot.uniqueGuilds,
    avgAchievementPoints: snapshot.avgAchievementPoints,
    maxAchievementPoints: snapshot.maxAchievementPoints,
    avgHonorableKills: snapshot.avgHonorableKills,
    maxHonorableKills: snapshot.maxHonorableKills,
    factionLabels: snapshot.factions.map((faction) => faction.name),
    factionCounts: snapshot.factions.map((faction) => faction.count),
    classLabels: snapshot.classes.map((entry) => CLASS_NAMES[entry.id] ?? `Class ${entry.id}`),
    classCounts: snapshot.classes.map((entry) => entry.count),
    classColors: snapshot.classes.map((entry) => CLASS_COLORS[entry.id] ?? UNKNOWN_CLASS_COLOR),
    raceLabels: snapshot.races.map((entry) => RACE_NAMES[entry.id] ?? `Race ${entry.id}`),
    raceCounts: snapshot.races.map((entry) => entry.count),
    guildLabels: snapshot.guilds.map((guild) => guild.name),
    guildCounts: snapshot.guilds.map((guild) => guild.count),
    apBucketLabels: snapshot.apBucketLabels,
    apBucketCounts: snapshot.apBucketCounts,
    hkBucketLabels: snapshot.hkBucketLabels,
    hkBucketCounts: snapshot.hkBucketCounts,
    realmLabels: snapshot.realms.map((realm) => realm.name),
    realmCounts: snapshot.realms.map((realm) => realm.count)
  };
}

export function emptyStats(): ServerStats {
  return {
    totalPlayers: 0, guildedPlayers: 0, uniqueGuilds: 0,
    avgAchievementPoints: 0, maxAchievementPoints: 0,
    avgHonorableKills: 0, maxHonorableKills: 0,
    factionLabels: [], factionCounts: [],
    classLabels: [], classCounts: [], classColors: [],
    raceLabels: [], raceCounts: [],
    guildLabels: [], guildCounts: [],
    apBucketLabels: [], apBucketCounts: [],
    hkBucketLabels: [], hkBucketCounts: [],
    realmLabels: [], realmCounts: []
  };
}

@Component({
  selector: 'app-stats-page',
  templateUrl: './stats-page.component.html',
  styleUrls: ['./stats-page.component.scss'],
  standalone: true,
  imports: [CommonModule, UpdateBarComponent, BackToTopButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatsPageComponent {
  private readonly serverStatsService = inject(ServerStatsService);
  private readonly ladderLastUpdatedService = inject(LadderLastUpdatedService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly chartInstances = new Map<string, Chart>();
  private renderPending = false;
  private viewReady = signal(false);

  readonly lastEdited = signal<Date | undefined>(undefined);
  readonly lastEditedTimeZoneLabel = signal('Local time');
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);

  readonly stats = signal<ServerStats>(emptyStats());
  readonly hasData = computed(() => this.stats().totalPlayers > 0);
  readonly showLoading = computed(() => this.isLoading() && !this.hasData());
  readonly showError = computed(() => !this.isLoading() && !!this.loadError() && !this.hasData());
  readonly showContent = computed(() => this.hasData());

  @ViewChild('factionCanvas') factionCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('classCanvas') classCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('raceCanvas') raceCanvasRef?: ElementRef<HTMLCanvasElement>;

  constructor() {
    this.destroyRef.onDestroy(() => this.destroyAllCharts());
    this.loadLastUpdated();
    void this.initData();

    afterNextRender(() => {
      this.viewReady.set(true);
    });

    effect(() => {
      const stats = this.stats();
      const ready = this.viewReady();
      if (!ready || !stats.totalPlayers) return;

      if (!this.renderPending) {
        this.renderPending = true;
        setTimeout(() => {
          this.renderPending = false;
          this.renderCharts(this.stats());
        }, 0);
      }
    });
  }

  syncData(): void {
    void this.initData();
  }

  private async initData(): Promise<void> {
    this.loadError.set(undefined);
    this.isLoading.set(true);

    try {
      this.stats.set(toServerStats(await firstValueFrom(this.serverStatsService.getServerStats())));
    } catch (err) {
      console.error('Failed to load server statistics:', err);
      this.loadError.set('Could not load statistics. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private loadLastUpdated(): void {
    this.ladderLastUpdatedService.getLastUpdated().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((lastUpdated) => {
      if (!lastUpdated) return;
      this.lastEdited.set(lastUpdated.date);
      this.lastEditedTimeZoneLabel.set(lastUpdated.timeZoneLabel);
    });
  }

  private renderCharts(stats: ServerStats): void {
    this.renderFactionChart(stats);
    this.renderClassChart(stats);
    this.renderRaceChart(stats);
  }

  private renderFactionChart(stats: ServerStats): void {
    const canvas = this.factionCanvasRef?.nativeElement;
    if (!canvas) return;

    const colors = stats.factionLabels.map((f) =>
      f === 'Horde' ? '#c41e3a' : f === 'Alliance' ? '#1a4dcc' : '#666'
    );
    const borderColors = stats.factionLabels.map((f) =>
      f === 'Horde' ? '#e83a5a' : f === 'Alliance' ? '#4472e8' : '#999'
    );

    this.upsertChart('faction', canvas, {
      type: 'doughnut',
      data: {
        labels: stats.factionLabels,
        datasets: [{
          data: stats.factionCounts,
          backgroundColor: colors,
          borderColor: borderColors,
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#e0e0e0', font: { size: 12 }, padding: 20, boxWidth: 14 }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const data = ctx.dataset.data as number[];
                const total = data.reduce((a, b) => a + b, 0);
                const pct = ((ctx.parsed / total) * 100).toFixed(1);
                return ` ${ctx.label}: ${ctx.parsed.toLocaleString()} (${pct}%)`;
              }
            }
          }
        }
      }
    } as ChartConfiguration<'doughnut'>);
  }

  private renderClassChart(stats: ServerStats): void {
    const canvas = this.classCanvasRef?.nativeElement;
    if (!canvas) return;

    this.upsertChart('class', canvas, {
      type: 'bar',
      plugins: [ChartDataLabels],
      data: {
        labels: stats.classLabels,
        datasets: [{
          label: 'Players',
          data: stats.classCounts,
          backgroundColor: stats.classColors.map((c) => c + '40'),
          borderColor: stats.classColors,
          borderWidth: 1.5,
          borderRadius: 3
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 64 } },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
          datalabels: {
            anchor: 'end',
            align: 'end',
            offset: 4,
            color: '#c8cdd8',
            font: { size: 11, weight: 'bold' },
            formatter: (value: number) => value.toLocaleString()
          }
        },
        scales: {
          x: {
            ticks: { color: '#9fa6b4', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            ticks: { color: '#d4d8e2', font: { size: 11 } },
            grid: { display: false }
          }
        }
      }
    } as ChartConfiguration<'bar'>);
  }

  private renderRaceChart(stats: ServerStats): void {
    const canvas = this.raceCanvasRef?.nativeElement;
    if (!canvas) return;

    this.upsertChart('race', canvas, {
      type: 'bar',
      plugins: [ChartDataLabels],
      data: {
        labels: stats.raceLabels,
        datasets: [{
          label: 'Players',
          data: stats.raceCounts,
          backgroundColor: 'rgba(247, 181, 0, 0.2)',
          borderColor: '#f7b500',
          borderWidth: 1.5,
          borderRadius: 3
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 64 } },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
          datalabels: {
            anchor: 'end',
            align: 'end',
            offset: 4,
            color: '#c8cdd8',
            font: { size: 11, weight: 'bold' },
            formatter: (value: number) => value.toLocaleString()
          }
        },
        scales: {
          x: {
            ticks: { color: '#9fa6b4', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            ticks: { color: '#d4d8e2', font: { size: 11 } },
            grid: { display: false }
          }
        }
      }
    } as ChartConfiguration<'bar'>);
  }

  private upsertChart(key: string, canvas: HTMLCanvasElement, config: ChartConfiguration): void {
    const existing = this.chartInstances.get(key);
    if (existing) {
      existing.data = config.data;
      existing.update('none');
    } else {
      this.chartInstances.set(key, new Chart(canvas, config));
    }
  }

  private destroyAllCharts(): void {
    for (const chart of this.chartInstances.values()) {
      chart.destroy();
    }
    this.chartInstances.clear();
  }
}
