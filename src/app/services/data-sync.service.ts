import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { Player } from '../models/character.model';

export interface SyncProgress {
  isLoading: boolean;
  current: number;
  total: number;
  message: string;
}

interface CsvPlayerRow {
  Id?: string;
  Name?: string;
  Race?: string;
  Gender?: string;
  Class?: string;
  Realm?: string;
  Guild?: string;
  AchievementPoints?: string;
  HonorableKills?: string;
  LastUpdated?: string;
  Faction?: string;
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
      this.updateProgress(true, 0, 1, 'Loading players.csv...');
      const players = await this.loadPlayersFromCsv();

      console.log(`Loaded ${players.length} players from CSV`);

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
   * Load players from Players.csv
   */
  private async loadPlayersFromCsv(): Promise<Player[]> {
    const csvText = await this.http.get('Players.csv', { responseType: 'text' }).toPromise();
    if (!csvText) {
      return [];
    }

    const rows = this.parseCsv(csvText);
    if (rows.length < 2) {
      return [];
    }

    const header = rows[0];
    const index = this.buildHeaderIndex(header);
    const players: Player[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0 || row.every(value => value.trim() === '')) {
        continue;
      }

      const csvRow: CsvPlayerRow = {
        Id: this.getField(row, index, 'Id'),
        Name: this.getField(row, index, 'Name'),
        Race: this.getField(row, index, 'Race'),
        Gender: this.getField(row, index, 'Gender'),
        Class: this.getField(row, index, 'Class'),
        Realm: this.getField(row, index, 'Realm'),
        Guild: this.getField(row, index, 'Guild'),
        AchievementPoints: this.getField(row, index, 'AchievementPoints'),
        HonorableKills: this.getField(row, index, 'HonorableKills'),
        LastUpdated: this.getField(row, index, 'LastUpdated'),
        Faction: this.getField(row, index, 'Faction')
      };

      if (!csvRow.Name || !csvRow.Realm) {
        continue;
      }

      const lastUpdated = this.parseCsvDate(csvRow.LastUpdated);

      players.push({
        name: csvRow.Name,
        race: this.toNumber(csvRow.Race),
        gender: this.toNumber(csvRow.Gender),
        class: this.toNumber(csvRow.Class),
        realm: csvRow.Realm,
        guild: csvRow.Guild || '',
        achievementPoints: this.toNumber(csvRow.AchievementPoints),
        honorableKills: this.toNumber(csvRow.HonorableKills),
        faction: csvRow.Faction || '',
        lastUpdated: lastUpdated ?? new Date()
      });
    }

    return players;
  }

  /**
   * Basic CSV parser with quoted field support
   */
  private parseCsv(input: string): string[][] {
    const rows: string[][] = [];
    let currentField = '';
    let currentRow: string[] = [];
    let inQuotes = false;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      const next = input[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === ',' && !inQuotes) {
        currentRow.push(currentField);
        currentField = '';
        continue;
      }

      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') {
          i++;
        }
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        continue;
      }

      currentField += char;
    }

    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }

    return rows.map(row => row.map(value => value.trim()));
  }

  /**
   * Build map of header names to indexes
   */
  private buildHeaderIndex(header: string[]): Record<string, number> {
    const index: Record<string, number> = {};
    header.forEach((name, idx) => {
      if (name) {
        const normalized = name.replace(/^\uFEFF/, '').trim();
        index[normalized] = idx;
      }
    });
    return index;
  }

  /**
   * Get a field from a CSV row
   */
  private getField(row: string[], index: Record<string, number>, field: keyof CsvPlayerRow): string {
    const idx = index[field];
    if (idx === undefined) {
      return '';
    }
    return row[idx] ?? '';
  }

  /**
   * Convert CSV number strings safely
   */
  private toNumber(value?: string): number {
    if (!value) {
      return 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /**
   * Parse timestamp in "YYYY-MM-DD HH:mm:ss.ssssss+00" format
   */
  private parseCsvDate(value?: string): Date | null {
    if (!value) {
      return null;
    }

    const match = value.match(
      /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/
    );
    if (!match) {
      const fallback = new Date(value);
      return Number.isNaN(fallback.getTime()) ? null : fallback;
    }

    const datePart = match[1];
    const timePart = match[2];
    const fractional = match[3] ?? '';
    const tz = match[4] ?? 'Z';

    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute, second] = timePart.split(':').map(Number);
    const ms = fractional ? Number(fractional.slice(0, 3).padEnd(3, '0')) : 0;

    let utc = Date.UTC(year, month - 1, day, hour, minute, second, ms);

    if (tz !== 'Z') {
      const sign = tz.startsWith('-') ? -1 : 1;
      const tzValue = tz.replace(':', '');
      const tzHours = Number(tzValue.slice(1, 3)) || 0;
      const tzMinutes = Number(tzValue.slice(3, 5)) || 0;
      const offsetMinutes = sign * (tzHours * 60 + tzMinutes);
      utc -= offsetMinutes * 60 * 1000;
    }

    return new Date(utc);
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
        const data = JSON.parse(cached);
        // Convert date strings back to Date objects
        const players = data.map((p: any) => ({
          ...p,
          lastUpdated: new Date(p.lastUpdated)
        }));
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
}
