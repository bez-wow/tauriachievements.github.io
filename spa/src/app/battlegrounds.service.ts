import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BattlegroundEra, BattlegroundSnapshot } from './battleground-stats';
import { DataFileService } from './services/data-file.service';

export interface BattlegroundCollectorState {
  lastScanUtc?: string;
}

@Injectable({ providedIn: 'root' })
export class BattlegroundsService {
  private readonly dataFiles = inject(DataFileService);

  /** One era's battlegrounds (assets/data/battlegrounds-<era>.json, built by the data pipeline). */
  getBattlegrounds(era: BattlegroundEra): Observable<BattlegroundSnapshot | null> {
    return this.dataFiles.fetchJson<BattlegroundSnapshot>(`assets/data/battlegrounds-${era}.json`).pipe(
      map((snapshot) => Array.isArray(snapshot?.days) && Array.isArray(snapshot?.names) ? snapshot : null)
    );
  }

  getCollectorState(): Observable<BattlegroundCollectorState> {
    return this.dataFiles.getJson<BattlegroundCollectorState>('battleground-collector-state.json');
  }
}
