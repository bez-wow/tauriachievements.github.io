import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DataFileService } from '../../core/data-file.service';

export interface ServerStatsIdCount {
  id: number;
  count: number;
}

export interface ServerStatsNamedCount {
  name: string;
  count: number;
}

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

export interface ServerStatsSnapshotCollection {
  version: 2;
  filters: Record<string, ServerStatsSnapshot>;
}

@Injectable({ providedIn: 'root' })
export class ServerStatsService {
  private readonly dataFiles = inject(DataFileService);

  getServerStats(): Observable<ServerStatsSnapshotCollection> {
    return this.dataFiles.getJson<ServerStatsSnapshotCollection>('assets/data/stats.snapshot.json');
  }
}
