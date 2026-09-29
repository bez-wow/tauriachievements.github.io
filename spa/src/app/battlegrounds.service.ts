import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BattlegroundRecord } from './battleground-stats';
import { DataFileService } from './services/data-file.service';

export interface BattlegroundCollectorState {
  lastScanUtc?: string;
}

@Injectable({ providedIn: 'root' })
export class BattlegroundsService {
  private readonly dataFiles = inject(DataFileService);

  getBattlegrounds(): Observable<BattlegroundRecord[]> {
    // Large (10+ MB): fetched per visit rather than kept in memory; the HTTP cache still applies.
    return this.dataFiles.fetchJson<BattlegroundRecord[]>('battlegrounds.json').pipe(
      map((records) => Array.isArray(records) ? records : [])
    );
  }

  getCollectorState(): Observable<BattlegroundCollectorState> {
    return this.dataFiles.getJson<BattlegroundCollectorState>('battleground-collector-state.json');
  }
}
