import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { RatedBattlegroundMatch, normalizeRatedBattlegrounds } from './rated-battleground-stats';

@Injectable({ providedIn: 'root' })
export class RatedBattlegroundsService {
  private readonly http = inject(HttpClient);

  getMatches(): Observable<RatedBattlegroundMatch[]> {
    return this.http.get<unknown>(`rated-battlegrounds.json?v=${Date.now()}`).pipe(
      map(value => normalizeRatedBattlegrounds(value))
    );
  }
}
