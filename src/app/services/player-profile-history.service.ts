import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, combineLatest, map, of, shareReplay, switchMap } from 'rxjs';
import {
  PlayerProfileHistoryData,
  SerializedPlayerProfileBucket,
  SerializedPlayerProfileMeta,
  SerializedPlayerProfileRecord
} from '../player-profile.types';
import {
  DEFAULT_PLAYER_PROFILE_BUCKET_COUNT,
  getPlayerProfileBucketLabel,
  getPlayerProfileKey
} from '../player-profile.utils';

interface PlayerProfileMetaData {
  generatedAt?: Date;
  bucketCount: number;
  snapshots: Date[];
}

@Injectable({ providedIn: 'root' })
export class PlayerProfileHistoryService {
  private readonly http = inject(HttpClient);
  private readonly bucketCache = new Map<string, Observable<SerializedPlayerProfileBucket | null>>();
  private readonly meta$ = this.http.get<SerializedPlayerProfileMeta>('assets/data/player-profile.meta.json').pipe(
    map((payload) => this.deserializeMeta(payload)),
    catchError((error) => {
      console.warn('Failed to load player profile metadata:', error);
      return of(null);
    }),
    shareReplay({ bufferSize: 1, refCount: false })
  );

  getPlayerHistory(realm: string, name: string): Observable<PlayerProfileHistoryData | null> {
    const playerKey = getPlayerProfileKey(realm, name);

    return this.meta$.pipe(
      map((meta) => {
        if (!meta) {
          return null;
        }

        return {
          meta,
          bucketLabel: getPlayerProfileBucketLabel(playerKey, meta.bucketCount)
        };
      }),
      switchMap((value) => {
        if (!value) {
          return of(null);
        }

        return combineLatest([
          of(value.meta),
          this.getBucket(value.bucketLabel)
        ]);
      }),
      map((value) => {
        if (!value) {
          return null;
        }

        const [meta, bucket] = value;
        const record = bucket?.p.find((entry) => entry[0] === playerKey);
        if (!record) {
          return null;
        }

        return this.deserializeRecord(playerKey, record, meta);
      })
    );
  }

  private getBucket(bucketLabel: string): Observable<SerializedPlayerProfileBucket | null> {
    const cached = this.bucketCache.get(bucketLabel);
    if (cached) {
      return cached;
    }

    const bucket$ = this.http.get<SerializedPlayerProfileBucket>(
      `assets/data/player-profile-buckets/${bucketLabel}.json`
    ).pipe(
      catchError((error) => {
        console.warn(`Failed to load player profile bucket ${bucketLabel}:`, error);
        return of(null);
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    this.bucketCache.set(bucketLabel, bucket$);
    return bucket$;
  }

  private deserializeMeta(payload: SerializedPlayerProfileMeta): PlayerProfileMetaData | null {
    if (!payload || !Array.isArray(payload.s)) {
      return null;
    }

    const snapshots = payload.s
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()));

    return {
      generatedAt: this.parseOptionalDate(payload.g),
      bucketCount: Number.isFinite(payload.b) && payload.b > 0
        ? payload.b
        : DEFAULT_PLAYER_PROFILE_BUCKET_COUNT,
      snapshots
    };
  }

  private deserializeRecord(
    playerKey: string,
    record: SerializedPlayerProfileRecord,
    meta: PlayerProfileMetaData
  ): PlayerProfileHistoryData {
    const [
      _recordKey,
      firstSeenIndex,
      lastSeenIndex,
      bestAchievementRank,
      bestHonorableKillRank,
      achievementPointsSeries,
      honorableKillsSeries
    ] = record;
    const snapshots = meta.snapshots;

    return {
      playerKey,
      generatedAt: meta.generatedAt,
      snapshots,
      firstSeen: this.getSnapshotDate(snapshots, firstSeenIndex),
      lastSeen: this.getSnapshotDate(snapshots, lastSeenIndex),
      bestAchievementRank: bestAchievementRank > 0 ? bestAchievementRank : undefined,
      bestHonorableKillRank: bestHonorableKillRank > 0 ? bestHonorableKillRank : undefined,
      achievementPointsSeries: this.expandSeries(achievementPointsSeries, snapshots.length),
      honorableKillsSeries: this.expandSeries(honorableKillsSeries, snapshots.length),
      trackedSnapshotCount: this.countTrackedSnapshots(achievementPointsSeries)
    };
  }

  private expandSeries(values: number[], snapshotCount: number): Array<number | null> {
    const series = Array.from({ length: snapshotCount }, () => null as number | null);

    for (let index = 0; index < values.length - 1; index += 2) {
      const snapshotIndex = values[index];
      const value = values[index + 1];

      if (!Number.isFinite(snapshotIndex) || !Number.isFinite(value)) {
        continue;
      }

      const safeIndex = Math.floor(snapshotIndex);
      if (safeIndex < 0 || safeIndex >= snapshotCount) {
        continue;
      }

      series[safeIndex] = value;
    }

    return series;
  }

  private countTrackedSnapshots(values: number[]): number {
    return Math.floor(values.length / 2);
  }

  private getSnapshotDate(snapshots: Date[], index: number): Date | undefined {
    if (!Number.isFinite(index)) {
      return undefined;
    }

    return snapshots[Math.floor(index)];
  }

  private parseOptionalDate(value: string | undefined): Date | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
}
