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

interface LadderCachePayload {
  version: number;
  syncedAt: string;
  players: CachedPlayerRecord[];
}

@Injectable({ providedIn: 'root' })
export class DataSyncService {
  private static readonly CACHE_KEY = 'ladder_cache';
  private static readonly CACHE_VERSION = 1;
  private static readonly LEGACY_PLAYERS_KEY = 'ladder_players_cache';
  private static readonly LEGACY_SYNC_KEY = 'ladder_last_sync';

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
      const cache = this.readCachePayload() ?? this.migrateLegacyCache();
      if (!cache) {
        return;
      }

      const players = cache.players
        .map((player) => this.normalizeCachedPlayer(player))
        .filter((player): player is Player => player !== null);

      this.players$.next(players);
    } catch (error) {
      console.error('Failed to load cached data:', error);
      this.clearCacheStorage();
    }
  }

  /**
   * Save data to localStorage cache
   */
  private cacheData(players: Player[]): void {
    try {
      const payload: LadderCachePayload = {
        version: DataSyncService.CACHE_VERSION,
        syncedAt: new Date().toISOString(),
        players: players.map((player) => this.toCachedPlayerRecord(player))
      };

      localStorage.setItem(DataSyncService.CACHE_KEY, JSON.stringify(payload));
      this.clearLegacyCacheStorage();
    } catch (error) {
      console.error('Failed to cache data:', error);
    }
  }

  /**
   * Get last sync time from cache
   */
  getLastSyncTime(): Date | null {
    try {
      const cache = this.readCachePayload();
      if (!cache?.syncedAt) {
        return null;
      }

      const parsed = new Date(cache.syncedAt);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
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
    this.clearCacheStorage();
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

  private readCachePayload(): LadderCachePayload | null {
    const cached = localStorage.getItem(DataSyncService.CACHE_KEY);
    if (!cached) {
      return null;
    }

    const parsed = JSON.parse(cached) as Partial<LadderCachePayload>;
    if (parsed.version !== DataSyncService.CACHE_VERSION || !Array.isArray(parsed.players)) {
      this.clearCacheStorage();
      return null;
    }

    return {
      version: parsed.version,
      syncedAt: typeof parsed.syncedAt === 'string' ? parsed.syncedAt : '',
      players: parsed.players
    };
  }

  private migrateLegacyCache(): LadderCachePayload | null {
    const cachedPlayers = sessionStorage.getItem(DataSyncService.LEGACY_PLAYERS_KEY)
      ?? localStorage.getItem(DataSyncService.LEGACY_PLAYERS_KEY);

    if (!cachedPlayers) {
      this.clearLegacyCacheStorage();
      return null;
    }

    const parsedPlayers = JSON.parse(cachedPlayers);
    if (!Array.isArray(parsedPlayers)) {
      this.clearLegacyCacheStorage();
      return null;
    }

    const syncedAt = sessionStorage.getItem(DataSyncService.LEGACY_SYNC_KEY)
      ?? localStorage.getItem(DataSyncService.LEGACY_SYNC_KEY)
      ?? new Date().toISOString();

    const payload: LadderCachePayload = {
      version: DataSyncService.CACHE_VERSION,
      syncedAt,
      players: parsedPlayers as CachedPlayerRecord[]
    };

    localStorage.setItem(DataSyncService.CACHE_KEY, JSON.stringify(payload));
    this.clearLegacyCacheStorage();

    return payload;
  }

  private toCachedPlayerRecord(player: Player): CachedPlayerRecord {
    return {
      name: player.name,
      race: player.race,
      gender: player.gender,
      class: player.class,
      realm: player.realm,
      guild: player.guild,
      achievementPoints: player.achievementPoints,
      honorableKills: player.honorableKills,
      faction: player.faction
    };
  }

  private clearCacheStorage(): void {
    localStorage.removeItem(DataSyncService.CACHE_KEY);
    this.clearLegacyCacheStorage();
  }

  private clearLegacyCacheStorage(): void {
    sessionStorage.removeItem(DataSyncService.LEGACY_PLAYERS_KEY);
    sessionStorage.removeItem(DataSyncService.LEGACY_SYNC_KEY);
    localStorage.removeItem(DataSyncService.LEGACY_PLAYERS_KEY);
    localStorage.removeItem(DataSyncService.LEGACY_SYNC_KEY);
  }

  private toNumber(value?: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
}
