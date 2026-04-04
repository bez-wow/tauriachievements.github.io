import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom, map, distinctUntilChanged } from 'rxjs';
import { getArmoryUrl, getGuildArmoryUrl } from '../utils/armory';
import { getClassIconPath } from '../utils/classIconHelper';
import { getRaceIconPath } from '../utils/raceIconHelper';
import { LadderPlayerProfileSummary, LadderService } from './ladder.service';
import { PlayerProfileHistoryData } from './player-profile.types';
import { DataSyncService } from './services/data-sync.service';
import { LadderLastUpdatedService } from './services/ladder-last-updated.service';
import { PlayerProfileHistoryService } from './services/player-profile-history.service';
import { UpdateBarComponent } from './update-bar.component';

interface TrendPoint {
  x: number;
  y: number;
  value: number;
  label: string;
}

interface TrendChartModel {
  hasData: boolean;
  path: string;
  areaPath: string;
  points: TrendPoint[];
  startLabel: string;
  endLabel: string;
  minValue?: number;
  maxValue?: number;
  latestValue?: number;
  netChange?: number;
}

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric'
});

@Component({
  selector: 'app-player-profile-page',
  templateUrl: './player-profile-page.component.html',
  styleUrls: ['./player-profile-page.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterLink, UpdateBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlayerProfilePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ladderService = inject(LadderService);
  private readonly dataSyncService = inject(DataSyncService);
  private readonly ladderLastUpdatedService = inject(LadderLastUpdatedService);
  private readonly playerProfileHistoryService = inject(PlayerProfileHistoryService);

  readonly requestedRealm = signal('');
  readonly requestedName = signal('');
  readonly profile = signal<LadderPlayerProfileSummary | null>(null);
  readonly history = signal<PlayerProfileHistoryData | null>(null);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly historyError = signal<string | undefined>(undefined);
  readonly lastEdited = signal<Date | undefined>(undefined);
  readonly lastEditedTimeZoneLabel = signal('Local time');

  readonly title = computed(() => this.profile()?.name || this.requestedName() || 'Player profile');
  readonly subtitle = computed(() => {
    const profile = this.profile();
    if (!profile) {
      return this.requestedRealm();
    }

    return [profile.realm, profile.faction].filter(Boolean).join(' | ');
  });
  readonly armoryUrl = computed(() => {
    const profile = this.profile();
    return profile ? getArmoryUrl(profile.name, profile.realm) : '';
  });
  readonly guildArmoryUrl = computed(() => {
    const profile = this.profile();
    return profile?.guild ? getGuildArmoryUrl(profile.guild, profile.realm) : '';
  });
  readonly achievementTrend = computed(() => {
    const history = this.history();
    return buildTrendChart(history?.achievementPointsSeries ?? [], history?.snapshots ?? []);
  });
  readonly honorableKillTrend = computed(() => {
    const history = this.history();
    return buildTrendChart(history?.honorableKillsSeries ?? [], history?.snapshots ?? []);
  });
  readonly achievementSevenDayGain = computed(() => this.getWindowGain(this.history()?.achievementPointsSeries, 7));
  readonly honorableKillSevenDayGain = computed(() => this.getWindowGain(this.history()?.honorableKillsSeries, 7));
  readonly trackedWindowGainAchievement = computed(() => this.achievementTrend().netChange ?? null);
  readonly trackedWindowGainHonorableKills = computed(() => this.honorableKillTrend().netChange ?? null);

  readonly getClassIconPath = getClassIconPath;
  readonly getRaceIconPath = getRaceIconPath;

  ngOnInit(): void {
    this.route.paramMap.pipe(
      map((params) => ({
        realm: params.get('realm') ?? '',
        name: params.get('name') ?? ''
      })),
      distinctUntilChanged((left, right) => left.realm === right.realm && left.name === right.name),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(({ realm, name }) => {
      void this.loadProfile(realm, name);
    });

    this.ladderLastUpdatedService.getLastUpdated().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((lastUpdated) => {
      if (!lastUpdated) {
        return;
      }

      this.lastEdited.set(lastUpdated.date);
      this.lastEditedTimeZoneLabel.set(lastUpdated.timeZoneLabel);
    });
  }

  formatSignedValue(value: number): string {
    if (value > 0) {
      return `+${value.toLocaleString()}`;
    }

    if (value < 0) {
      return value.toLocaleString();
    }

    return '0';
  }

  formatOptionalSignedValue(value: number | null | undefined, fallback: string = 'Not enough data'): string {
    if (value === null || value === undefined) {
      return fallback;
    }

    return this.formatSignedValue(value);
  }

  getDeltaClass(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return 'unknown';
    }

    if (value > 0) {
      return 'positive';
    }

    if (value < 0) {
      return 'negative';
    }

    return 'neutral';
  }

  formatRankLabel(rank: number | undefined): string {
    return rank && rank > 0 ? `#${rank.toLocaleString()}` : 'Unavailable';
  }

  getRankMovementCopy(value: number): string {
    if (value > 0) {
      return `Climbed ${value.toLocaleString()}`;
    }

    if (value < 0) {
      return `Dropped ${Math.abs(value).toLocaleString()}`;
    }

    return 'No movement';
  }

  onImageError(event: Event): void {
    const image = event.target as HTMLImageElement | null;
    console.error('Failed to load image:', image?.src ?? 'unknown image');
  }

  private async loadProfile(realm: string, name: string): Promise<void> {
    this.requestedRealm.set(realm);
    this.requestedName.set(name);
    this.profile.set(null);
    this.history.set(null);
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.historyError.set(undefined);

    if (!realm || !name) {
      this.loadError.set('This player link is missing the realm or character name.');
      this.isLoading.set(false);
      return;
    }

    try {
      if (this.dataSyncService.getCurrentPlayers().length === 0) {
        await this.dataSyncService.syncData();
      }

      const [profile, history] = await Promise.all([
        firstValueFrom(this.ladderService.getPlayerProfileSummary(realm, name)),
        firstValueFrom(this.playerProfileHistoryService.getPlayerHistory(realm, name))
      ]);

      if (!profile) {
        this.loadError.set('This character was not found in the current ladder snapshot.');
        this.isLoading.set(false);
        return;
      }

      this.profile.set(profile);
      this.history.set(history);

      if (!history) {
        this.historyError.set('Historical tracking is not available for this player yet.');
      }
    } catch (error) {
      console.error('Failed to load player profile:', error);
      this.loadError.set('We could not load this player profile right now. Please try again in a moment.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private getWindowGain(series: Array<number | null> | undefined, days: number): number | null {
    const history = this.history();
    if (!history || !series || series.length === 0) {
      return null;
    }

    const latestIndex = findLatestDefinedIndex(series);
    if (latestIndex === -1) {
      return null;
    }

    const latestValue = series[latestIndex];
    if (latestValue === null) {
      return null;
    }

    const latestSnapshot = history.snapshots[latestIndex];
    if (!latestSnapshot) {
      return null;
    }

    const cutoff = latestSnapshot.getTime() - days * 24 * 60 * 60 * 1000;

    for (let index = latestIndex - 1; index >= 0; index--) {
      const value = series[index];
      const snapshot = history.snapshots[index];

      if (value === null || !snapshot) {
        continue;
      }

      if (snapshot.getTime() <= cutoff) {
        return latestValue - value;
      }
    }

    return null;
  }
}

function buildTrendChart(series: Array<number | null>, snapshots: Date[]): TrendChartModel {
  const validPoints = series
    .map((value, index) => value === null
      ? null
      : {
          index,
          value,
          label: snapshots[index] ? shortDateFormatter.format(snapshots[index]) : `Snapshot ${index + 1}`
        })
    .filter((value): value is { index: number; value: number; label: string } => value !== null);

  if (validPoints.length === 0) {
    return {
      hasData: false,
      path: '',
      areaPath: '',
      points: [],
      startLabel: '',
      endLabel: ''
    };
  }

  const width = 100;
  const height = 44;
  const paddingX = 6;
  const paddingY = 5;
  const baselineY = height - paddingY;
  const minValue = Math.min(...validPoints.map((point) => point.value));
  const maxValue = Math.max(...validPoints.map((point) => point.value));
  const range = maxValue - minValue || 1;
  const denominator = Math.max(1, snapshots.length - 1);

  const points = validPoints.map((point) => {
    const x = paddingX + ((width - paddingX * 2) * point.index / denominator);
    const normalized = (point.value - minValue) / range;
    const y = baselineY - normalized * (height - paddingY * 2);

    return {
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      value: point.value,
      label: point.label
    };
  });

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const areaPath = [
    `M ${firstPoint.x} ${baselineY}`,
    path.replace(/^M /, 'L '),
    `L ${lastPoint.x} ${baselineY}`,
    'Z'
  ].join(' ');

  return {
    hasData: true,
    path,
    areaPath,
    points,
    startLabel: points[0].label,
    endLabel: points[points.length - 1].label,
    minValue,
    maxValue,
    latestValue: lastPoint.value,
    netChange: lastPoint.value - firstPoint.value
  };
}

function findLatestDefinedIndex(series: Array<number | null>): number {
  for (let index = series.length - 1; index >= 0; index--) {
    if (series[index] !== null) {
      return index;
    }
  }

  return -1;
}
