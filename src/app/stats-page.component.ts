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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
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
import { DataSyncService } from './services/data-sync.service';
import { LadderLastUpdatedService } from './services/ladder-last-updated.service';
import { Player } from './models/character.model';
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

const AP_BREAKS = [0, 1000, 3000, 6000, 10000, 15000, 20000, Infinity];
const AP_LABELS = ['<1k', '1k–3k', '3k–6k', '6k–10k', '10k–15k', '15k–20k', '20k+'];

const HK_BREAKS = [0, 1000, 5000, 10000, 25000, 50000, 100000, Infinity];
const HK_LABELS = ['<1k', '1k–5k', '5k–10k', '10k–25k', '25k–50k', '50k–100k', '100k+'];

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

export function computeStats(players: Player[]): ServerStats {
  if (!players.length) {
    return emptyStats();
  }

  const factionMap = new Map<string, number>();
  const classMap = new Map<number, number>();
  const raceMap = new Map<number, number>();
  const guildMap = new Map<string, number>();
  const realmMap = new Map<string, number>();

  let totalAP = 0;
  let maxAP = 0;
  let totalHK = 0;
  let maxHK = 0;
  let guildedCount = 0;

  const apBuckets = new Array<number>(AP_LABELS.length).fill(0);
  const hkBuckets = new Array<number>(HK_LABELS.length).fill(0);

  for (const p of players) {
    factionMap.set(p.faction, (factionMap.get(p.faction) ?? 0) + 1);
    classMap.set(p.class, (classMap.get(p.class) ?? 0) + 1);
    raceMap.set(p.race, (raceMap.get(p.race) ?? 0) + 1);
    realmMap.set(p.realm, (realmMap.get(p.realm) ?? 0) + 1);

    if (p.guild) {
      guildedCount++;
      const key = `${p.guild} (${p.realm})`;
      guildMap.set(key, (guildMap.get(key) ?? 0) + 1);
    }

    totalAP += p.achievementPoints;
    if (p.achievementPoints > maxAP) maxAP = p.achievementPoints;
    totalHK += p.honorableKills;
    if (p.honorableKills > maxHK) maxHK = p.honorableKills;

    for (let i = AP_BREAKS.length - 2; i >= 0; i--) {
      if (p.achievementPoints >= AP_BREAKS[i]) {
        apBuckets[i]++;
        break;
      }
    }

    for (let i = HK_BREAKS.length - 2; i >= 0; i--) {
      if (p.honorableKills >= HK_BREAKS[i]) {
        hkBuckets[i]++;
        break;
      }
    }
  }

  const sortedClasses = [...classMap.entries()].sort((a, b) => b[1] - a[1]);
  const sortedRaces = [...raceMap.entries()].sort((a, b) => b[1] - a[1]);
  const sortedGuilds = [...guildMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const sortedRealms = [...realmMap.entries()].sort((a, b) => b[1] - a[1]);

  const factionOrder = ['Horde', 'Alliance', 'Neutral'];
  const sortedFactions = factionOrder
    .filter((f) => factionMap.has(f))
    .concat([...factionMap.keys()].filter((f) => !factionOrder.includes(f)));

  return {
    totalPlayers: players.length,
    guildedPlayers: guildedCount,
    uniqueGuilds: guildMap.size,
    avgAchievementPoints: Math.round(totalAP / players.length),
    maxAchievementPoints: maxAP,
    avgHonorableKills: Math.round(totalHK / players.length),
    maxHonorableKills: maxHK,
    factionLabels: sortedFactions,
    factionCounts: sortedFactions.map((f) => factionMap.get(f) ?? 0),
    classLabels: sortedClasses.map(([id]) => CLASS_NAMES[id] ?? `Class ${id}`),
    classCounts: sortedClasses.map(([, c]) => c),
    classColors: sortedClasses.map(([id]) => CLASS_COLORS[id] ?? '#888'),
    raceLabels: sortedRaces.map(([id]) => RACE_NAMES[id] ?? `Race ${id}`),
    raceCounts: sortedRaces.map(([, c]) => c),
    guildLabels: sortedGuilds.map(([name]) => name),
    guildCounts: sortedGuilds.map(([, c]) => c),
    apBucketLabels: AP_LABELS,
    apBucketCounts: apBuckets,
    hkBucketLabels: HK_LABELS,
    hkBucketCounts: hkBuckets,
    realmLabels: sortedRealms.map(([r]) => r),
    realmCounts: sortedRealms.map(([, c]) => c)
  };
}

function emptyStats(): ServerStats {
  return {
    totalPlayers: 0, guildedPlayers: 0, uniqueGuilds: 0,
    avgAchievementPoints: 0, maxAchievementPoints: 0,
    avgHonorableKills: 0, maxHonorableKills: 0,
    factionLabels: [], factionCounts: [],
    classLabels: [], classCounts: [], classColors: [],
    raceLabels: [], raceCounts: [],
    guildLabels: [], guildCounts: [],
    apBucketLabels: AP_LABELS, apBucketCounts: new Array<number>(AP_LABELS.length).fill(0),
    hkBucketLabels: HK_LABELS, hkBucketCounts: new Array<number>(HK_LABELS.length).fill(0),
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
  private readonly dataSyncService = inject(DataSyncService);
  private readonly ladderLastUpdatedService = inject(LadderLastUpdatedService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly chartInstances = new Map<string, Chart>();
  private renderPending = false;
  private viewReady = signal(false);

  readonly lastEdited = signal<Date | undefined>(undefined);
  readonly lastEditedTimeZoneLabel = signal('Local time');
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);

  private readonly players = toSignal(this.dataSyncService.getPlayers(), { initialValue: [] as Player[] });

  readonly stats = computed(() => computeStats(this.players()));
  readonly hasData = computed(() => this.players().length > 0);
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
    this.loadError.set(undefined);
    this.isLoading.set(true);
    void this.dataSyncService.ensureCompleteData().then(() => {
      this.isLoading.set(false);
    }).catch((err: unknown) => {
      console.error('Stats sync failed:', err);
      this.loadError.set('Could not load statistics. Please try again.');
      this.isLoading.set(false);
    });
  }

  private async initData(): Promise<void> {
    if (this.dataSyncService.getCurrentPlayers().length > 0) {
      this.isLoading.set(false);
      return;
    }

    try {
      await this.dataSyncService.ensureCompleteData();
      this.isLoading.set(false);
    } catch (err) {
      console.error('Failed to load stats data:', err);
      this.loadError.set('Could not load statistics. Please try again.');
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
