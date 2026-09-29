import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom, map, shareReplay } from 'rxjs';
import { Player, PlayerRankings, PlayerSnapshot } from '../models/character.model';
import { readPlayerSnapshot } from '../models/player-snapshot';
import { DataFileService } from './data-file.service';

export interface SyncProgress {
  isLoading: boolean;
  current: number;
  total: number;
  message: string;
}

/** The loaded players, in achievement-point rank order, with the rules for every other ranking. */
export interface PlayerDataset {
  players: Player[];
  rankings: PlayerRankings | undefined;
}

const HEAD_SNAPSHOT_URL = 'assets/data/players.head.snapshot.json';
const FULL_SNAPSHOT_URL = 'assets/data/players.snapshot.json';
const NEW_PLAYERS_SNAPSHOT_URL = 'assets/data/new-players.snapshot.json';

@Injectable({ providedIn: 'root' })
export class DataSyncService {
  private readonly dataFiles = inject(DataFileService);
  private readonly dataset$ = new BehaviorSubject<PlayerDataset>({ players: [], rankings: undefined });
  private readonly isComplete$ = new BehaviorSubject<boolean>(false);
  private readonly totalPlayerCount$ = new BehaviorSubject<number>(0);
  private readonly syncProgress$ = new BehaviorSubject<SyncProgress>({
    isLoading: false,
    current: 0,
    total: 0,
    message: ''
  });
  private readonly newPlayers$ = this.dataFiles.getJson<PlayerSnapshot>(NEW_PLAYERS_SNAPSHOT_URL).pipe(
    map((snapshot) => readPlayerSnapshot(snapshot)),
    shareReplay({ bufferSize: 1, refCount: false })
  );

  // Both stages are deduped by holding onto the in-flight promise: several components
  // ask for data on the same navigation, and without this each one starts its own fetch.
  private headSync?: Promise<void>;
  private completeSync?: Promise<void>;

  constructor() {
    this.clearObsoleteCacheStorage();
  }

  getDataset(): Observable<PlayerDataset> {
    return this.dataset$.asObservable();
  }

  getPlayers(): Observable<Player[]> {
    return this.dataset$.pipe(map((dataset) => dataset.players));
  }

  getCurrentPlayers(): Player[] {
    return this.dataset$.value.players;
  }

  /** Characters first seen in the latest scan. A small file of its own, so no full load is needed. */
  getNewPlayers(): Observable<Player[]> {
    return this.newPlayers$;
  }

  getSyncProgress(): Observable<SyncProgress> {
    return this.syncProgress$.asObservable();
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
    const alreadyLoaded = this.dataset$.value.players.length;

    try {
      this.updateProgress(true, 0, this.totalPlayerCount$.value, 'Loading ladder data...');
      const snapshot = await firstValueFrom(this.dataFiles.fetchJson<PlayerSnapshot>(url));
      const players = readPlayerSnapshot(snapshot);
      const totalPlayerCount = snapshot?.t ?? players.length;

      // A slower head response must never overwrite the full set that beat it home.
      if (!isComplete && this.isComplete$.value) {
        return;
      }

      this.totalPlayerCount$.next(totalPlayerCount);
      this.dataset$.next({ players, rankings: snapshot?.k });
      this.isComplete$.next(isComplete);

      this.updateProgress(false, players.length, totalPlayerCount, `Sync complete! ${players.length} players loaded.`);
    } catch (error) {
      // An upgrade that fails leaves the head data on screen, so this is only fatal
      // when there was nothing to show in the first place.
      this.updateProgress(false, alreadyLoaded, this.totalPlayerCount$.value, alreadyLoaded > 0 ? '' : 'Sync failed. See console for details.');
      throw error;
    }
  }

  private updateProgress(isLoading: boolean, current: number, total: number, message: string): void {
    this.syncProgress$.next({ isLoading, current, total, message });
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
