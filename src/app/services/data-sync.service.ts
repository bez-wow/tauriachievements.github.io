import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { Player, PlayerSnapshot, SerializedPlayerRecord } from '../models/character.model';

export interface SyncProgress {
  isLoading: boolean;
  current: number;
  total: number;
  message: string;
}

const HEAD_SNAPSHOT_URL = 'assets/data/players.head.snapshot.json';
const FULL_SNAPSHOT_URL = 'assets/data/players.snapshot.json';

@Injectable({ providedIn: 'root' })
export class DataSyncService {
  private players$ = new BehaviorSubject<Player[]>([]);
  private isComplete$ = new BehaviorSubject<boolean>(false);
  private totalPlayerCount$ = new BehaviorSubject<number>(0);
  private syncProgress$ = new BehaviorSubject<SyncProgress>({
    isLoading: false,
    current: 0,
    total: 0,
    message: ''
  });

  // Both stages are deduped by holding onto the in-flight promise: several components
  // ask for data on the same navigation, and without this each one starts its own fetch.
  private headSync?: Promise<void>;
  private completeSync?: Promise<void>;

  constructor(private http: HttpClient) {
    this.clearObsoleteCacheStorage();
  }

  getPlayers(): Observable<Player[]> {
    return this.players$.asObservable();
  }

  getSyncProgress(): Observable<SyncProgress> {
    return this.syncProgress$.asObservable();
  }

  getCurrentPlayers(): Player[] {
    return this.players$.value;
  }

  /** True once every player on the server is loaded, false while only the head slice is. */
  isDatasetComplete(): Observable<boolean> {
    return this.isComplete$.asObservable();
  }

  isCurrentDatasetComplete(): boolean {
    return this.isComplete$.value;
  }

  /** Total players on the server, which exceeds `getCurrentPlayers().length` until the full set lands. */
  getTotalPlayerCount(): Observable<number> {
    return this.totalPlayerCount$.asObservable();
  }

  /**
   * Loads the smallest dataset that can answer the ladder's default view. Callers that
   * need every player - search, aggregates, arbitrary lookups - must use
   * {@link ensureCompleteData} instead.
   */
  async syncData(): Promise<void> {
    if (this.isComplete$.value) {
      return;
    }

    this.headSync ??= this.runSync(HEAD_SNAPSHOT_URL, false)
      .catch((error: unknown) => {
        this.headSync = undefined;
        throw error;
      });

    return this.headSync;
  }

  /** Loads every player, upgrading in place if only the head slice is present. */
  async ensureCompleteData(): Promise<void> {
    this.completeSync ??= this.runSync(FULL_SNAPSHOT_URL, true)
      .catch((error: unknown) => {
        this.completeSync = undefined;
        throw error;
      });

    return this.completeSync;
  }

  private async runSync(url: string, isComplete: boolean): Promise<void> {
    const alreadyLoaded = this.players$.value.length;

    try {
      this.updateProgress(true, 0, this.totalPlayerCount$.value, 'Loading ladder data...');
      const { players, totalPlayerCount } = await this.loadPlayersFromSnapshot(url);

      // A slower head response must never overwrite the full set that beat it home.
      if (!isComplete && this.isComplete$.value) {
        return;
      }

      this.totalPlayerCount$.next(totalPlayerCount);
      this.players$.next(players);
      this.isComplete$.next(isComplete);

      this.updateProgress(false, players.length, totalPlayerCount, `Sync complete! ${players.length} players loaded.`);
    } catch (error) {
      // An upgrade that fails leaves the head data on screen, so this is only fatal
      // when there was nothing to show in the first place.
      this.updateProgress(false, alreadyLoaded, this.totalPlayerCount$.value, alreadyLoaded > 0 ? '' : 'Sync failed. See console for details.');
      throw error;
    }
  }

  private async loadPlayersFromSnapshot(url: string): Promise<{ players: Player[]; totalPlayerCount: number }> {
    const snapshot = await firstValueFrom(this.http.get<PlayerSnapshot>(url));
    if (!snapshot || !Array.isArray(snapshot.p) || !Array.isArray(snapshot.r) || !Array.isArray(snapshot.f)) {
      return { players: [], totalPlayerCount: 0 };
    }

    const players = snapshot.p
      .map((row) => this.deserializePlayer(row, snapshot))
      .filter((player): player is Player => player !== null);

    return { players, totalPlayerCount: snapshot.t ?? players.length };
  }

  private updateProgress(isLoading: boolean, current: number, total: number, message: string): void {
    this.syncProgress$.next({ isLoading, current, total, message });
  }

  private deserializePlayer(row: SerializedPlayerRecord, snapshot: PlayerSnapshot): Player | null {
    const [
      name,
      race,
      gender,
      playerClass,
      realmIndex,
      guild,
      achievementPoints,
      honorableKills,
      factionIndex,
      achievementPointsDelta = 0,
      achievementRankDelta = 0,
      honorableKillsDelta = 0,
      honorableKillsRankDelta = 0,
      isNewCharacter = false,
      appearanceCount = 0,
      appearanceCountDelta = 0,
      appearanceRankDelta = 0,
      characterAge = '',
      achievementsTotal = 0,
      achievementsTotalDelta = 0,
      achievementsTotalRankDelta = 0,
      playedTime = 0,
      playedTimeDelta = 0,
      playedTimeRankDelta = 0,
      ilvl = 0
    ] = row;

    const realm = snapshot.r[realmIndex];
    if (!name || !realm) {
      return null;
    }

    return {
      name,
      race,
      gender,
      class: playerClass,
      realm,
      guild: guild ?? '',
      achievementPoints,
      achievementPointsDelta,
      achievementRankDelta,
      honorableKills,
      honorableKillsDelta,
      honorableKillsRankDelta,
      appearanceCount,
      appearanceCountDelta,
      appearanceRankDelta,
      achievementsTotal,
      achievementsTotalDelta,
      achievementsTotalRankDelta,
      playedTime,
      playedTimeDelta,
      playedTimeRankDelta,
      ilvl,
      characterAge,
      isNewCharacter,
      faction: snapshot.f[factionIndex] ?? 'Horde'
    };
  }

  private clearObsoleteCacheStorage(): void {
    try {
      sessionStorage.removeItem('ladder_players_cache');
      sessionStorage.removeItem('ladder_last_sync');
      localStorage.removeItem('ladder_cache');
      localStorage.removeItem('ladder_players_cache');
      localStorage.removeItem('ladder_last_sync');
    } catch {
    }
  }
}
