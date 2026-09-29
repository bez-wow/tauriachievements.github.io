import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { GuildPresenceSnapshot } from './guild-presence.types';
import { DataFileService } from './services/data-file.service';

/**
 * Guild rankings are computed at build time (scripts/generate-guild-rankings.js) for every
 * source limit the page offers, so the page loads a small file instead of every player.
 */
@Injectable({ providedIn: 'root' })
export class GuildPresenceService {
  private readonly dataFiles = inject(DataFileService);

  getGuildRankings(): Observable<GuildPresenceSnapshot> {
    return this.dataFiles.getJson<GuildPresenceSnapshot>('assets/data/guilds.snapshot.json');
  }
}
