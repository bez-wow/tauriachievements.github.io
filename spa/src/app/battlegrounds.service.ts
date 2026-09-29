import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BattlegroundRecord } from './battleground-stats';

export interface BattlegroundCollectorState {
  lastScanUtc?: string;
}

@Injectable({ providedIn: 'root' })
export class BattlegroundsService {
  private readonly http = inject(HttpClient);

  getBattlegrounds(): Observable<BattlegroundRecord[]> {
    return this.http.get<BattlegroundRecord[]>(`battlegrounds.json?v=${Date.now()}`).pipe(
      map((records) => Array.isArray(records) ? records : [])
    );
  }

  getCollectorState(): Observable<BattlegroundCollectorState> {
    return this.http.get<BattlegroundCollectorState>(`battleground-collector-state.json?v=${Date.now()}`);
  }
}
