import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import {
  LadderHistoryData,
  LadderHistoryMoverView,
  SerializedLadderHistoryMover,
  SerializedLadderHistorySnapshot
} from '../ladder-history.types';
import { splitLadderHistoryPlayerKey } from '../ladder-history.mapper';

@Injectable({ providedIn: 'root' })
export class LadderHistoryService {
  private readonly http = inject(HttpClient);
  private readonly history$ = this.http.get<SerializedLadderHistorySnapshot>('assets/data/players.history.snapshot.json').pipe(
    map((snapshot) => this.deserializeSnapshot(snapshot)),
    catchError((error) => {
      console.warn('Failed to load ladder history snapshot:', error);
      return of(null);
    }),
    shareReplay({ bufferSize: 1, refCount: false })
  );

  getHistory(): Observable<LadderHistoryData | null> {
    return this.history$;
  }

  private deserializeSnapshot(snapshot: SerializedLadderHistorySnapshot): LadderHistoryData | null {
    if (!snapshot || !Array.isArray(snapshot.s)) {
      return null;
    }

    const snapshots = snapshot.s
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()));

    return {
      generatedAt: this.parseOptionalDate(snapshot.g),
      snapshots,
      trackedPlayerCount: snapshot.c ?? 0,
      movers: {
        achievementPoints: (snapshot.m?.a ?? []).map((mover) => this.deserializeMover(mover)),
        honorableKills: (snapshot.m?.h ?? []).map((mover) => this.deserializeMover(mover)),
        appearanceCount: (snapshot.m?.p ?? []).map((mover) => this.deserializeMover(mover))
      }
    };
  }

  private deserializeMover(mover: SerializedLadderHistoryMover): LadderHistoryMoverView {
    const [
      playerKey,
      rankDelta,
      previousRank,
      currentRank,
      achievementPointsDelta,
      honorableKillsDelta,
      previousAchievementPoints,
      currentAchievementPoints,
      previousHonorableKills,
      currentHonorableKills,
      race,
      gender,
      classId,
      guild,
      appearanceCountDelta = 0,
      previousAppearanceCount = 0,
      currentAppearanceCount = 0
    ] = mover;
    const { name, realm } = splitLadderHistoryPlayerKey(playerKey);

    return {
      playerKey,
      name,
      realm,
      guild: guild ?? '',
      race,
      gender,
      classId,
      rankDelta,
      previousRank,
      currentRank,
      achievementPointsDelta,
      honorableKillsDelta,
      previousAchievementPoints,
      currentAchievementPoints,
      previousHonorableKills,
      currentHonorableKills,
      appearanceCountDelta,
      previousAppearanceCount,
      currentAppearanceCount
    };
  }

  private parseOptionalDate(value: string | undefined): Date | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
}
