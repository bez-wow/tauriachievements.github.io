import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { GuildPresenceSnapshot } from './guild-presence.types';
import { DataFileService } from '../../core/data-file.service';

@Injectable({ providedIn: 'root' })
export class GuildPresenceService {
  private readonly dataFiles = inject(DataFileService);

  getGuildRankings(): Observable<GuildPresenceSnapshot> {
    return this.dataFiles.getJson<GuildPresenceSnapshot>('assets/data/guilds.snapshot.json');
  }
}
