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

interface CachedPlayerRecord {
  name?: string;
  race?: number;
  gender?: number;
  class?: number;
  realm?: string;
  guild?: string;
  achievementPoints?: number;
  honorableKills?: number;
  faction?: string;
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
    // Try to load cached data from localStorage on init
    this.loadCachedData();
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

      // Update state and cache
      this.players$.next(players);
      this.cacheData(players);
      
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
   * Load data from localStorage cache
   */
  private loadCachedData(): void {
    try {
      // Try sessionStorage first, fallback to localStorage
      let cached = sessionStorage.getItem('ladder_players_cache');
      if (!cached) {
        cached = localStorage.getItem('ladder_players_cache');
      }
      if (cached) {
        const data = JSON.parse(cached) as CachedPlayerRecord[];
        const players = data
          .map((player) => this.normalizeCachedPlayer(player))
          .filter((player): player is Player => player !== null);
        this.players$.next(players);
      }
    } catch (error) {
      console.error('Failed to load cached data:', error);
    }
  }

  /**
   * Save data to localStorage cache
   */
  private cacheData(players: Player[]): void {
    try {
      // Save to both sessionStorage and localStorage for compatibility
      const data = JSON.stringify(players);
      sessionStorage.setItem('ladder_players_cache', data);
      sessionStorage.setItem('ladder_last_sync', new Date().toISOString());
      localStorage.setItem('ladder_players_cache', data);
      localStorage.setItem('ladder_last_sync', new Date().toISOString());
    } catch (error) {
      console.error('Failed to cache data:', error);
    }
  }

  /**
   * Get last sync time from cache
   */
  getLastSyncTime(): Date | null {
    try {
      // Try sessionStorage first, fallback to localStorage
      let lastSync = sessionStorage.getItem('ladder_last_sync');
      if (!lastSync) {
        lastSync = localStorage.getItem('ladder_last_sync');
      }
      return lastSync ? new Date(lastSync) : null;
    } catch {
      return null;
    }
  }

  /**
   * Update sync progress
   */
  private updateProgress(isLoading: boolean, current: number, total: number, message: string): void {
    this.syncProgress$.next({ isLoading, current, total, message });
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    localStorage.removeItem('ladder_players_cache');
    localStorage.removeItem('ladder_last_sync');
    this.players$.next([]);
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
      factionIndex
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
      honorableKills,
      faction: snapshot.f[factionIndex] ?? 'Horde'
    };
  }

  private normalizeCachedPlayer(player?: CachedPlayerRecord): Player | null {
    if (!player?.name || !player.realm) {
      return null;
    }

    return {
      name: player.name,
      race: this.toNumber(player.race),
      gender: this.toNumber(player.gender),
      class: this.toNumber(player.class),
      realm: player.realm,
      guild: player.guild ?? '',
      achievementPoints: this.toNumber(player.achievementPoints),
      honorableKills: this.toNumber(player.honorableKills),
      faction: player.faction ?? 'Horde'
    };
  }

  private toNumber(value?: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
}
