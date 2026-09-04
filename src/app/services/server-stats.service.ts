import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';

/** A counted bucket keyed by a game id, whose display name lives in the view layer. */
export interface ServerStatsIdCount {
  id: number;
  count: number;
}

/** A counted bucket that already carries its own name - a realm, guild or faction. */
export interface ServerStatsNamedCount {
  name: string;
  count: number;
}

/**
 * Server-wide aggregates, precomputed by `scripts/generate-server-stats.js` whenever
 * Players.csv is rescanned. Shape mirrors that script's output; see its header for why
 * threshold labels ship with the data while entity names and colors do not.
 */
export interface ServerStatsSnapshot {
  totalPlayers: number;
  guildedPlayers: number;
  uniqueGuilds: number;
  avgAchievementPoints: number;
  maxAchievementPoints: number;
  avgHonorableKills: number;
  maxHonorableKills: number;
  factions: ServerStatsNamedCount[];
  classes: ServerStatsIdCount[];
  races: ServerStatsIdCount[];
  guilds: ServerStatsNamedCount[];
  realms: ServerStatsNamedCount[];
  apBucketLabels: string[];
  apBucketCounts: number[];
  hkBucketLabels: string[];
  hkBucketCounts: number[];
}

@Injectable({ providedIn: 'root' })
export class ServerStatsService {
  private readonly http = inject(HttpClient);

  private readonly stats$ = this.http.get<ServerStatsSnapshot>('assets/data/stats.snapshot.json').pipe(
    shareReplay({ bufferSize: 1, refCount: false })
  );

  getServerStats(): Observable<ServerStatsSnapshot> {
    return this.stats$;
  }
}
