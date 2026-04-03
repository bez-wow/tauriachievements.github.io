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

@Injectable({ providedIn: 'root' })
export class DataSyncService {
  private players$ = new BehaviorSubject<Player[]>([]);
  private syncProgress$ = new BehaviorSubject<SyncProgress>({
    isLoading: false,
    current: 0,
    total: 0,
    message: ''
  });

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

  /**
   * Main sync function - fetches characters from JSON files
   */
  async syncData(): Promise<void> {
    try {
      this.updateProgress(true, 0, 1, 'Loading ladder data...');
      const players = await this.loadPlayersFromSnapshot();

      console.log(`Loaded ${players.length} players from snapshot`);

      this.players$.next(players);

      this.updateProgress(false, players.length, players.length, `Sync complete! ${players.length} players loaded.`);
    } catch (error) {
      console.error('Sync failed:', error);
      this.updateProgress(false, 0, 0, 'Sync failed. See console for details.');
      throw error;
    }
  }

  /**
   * Load players from the generated JSON snapshot
   */
  private async loadPlayersFromSnapshot(): Promise<Player[]> {
    const snapshot = await firstValueFrom(this.http.get<PlayerSnapshot>('assets/data/players.snapshot.json'));
    if (!snapshot || !Array.isArray(snapshot.p) || !Array.isArray(snapshot.r) || !Array.isArray(snapshot.f)) {
      return [];
    }

    return snapshot.p
      .map((row) => this.deserializePlayer(row, snapshot))
      .filter((player): player is Player => player !== null);
  }

  /**
   * Update sync progress
   */
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
      honorableKillsRankDelta = 0
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
      // Ignore storage access failures; the app can still load from the shipped snapshot.
    }
  }
}
