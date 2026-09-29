import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { RatedBattlegroundMatch, normalizeRatedBattlegrounds } from './rated-battleground-stats';
import { DataFileService } from './services/data-file.service';

@Injectable({ providedIn: 'root' })
export class RatedBattlegroundsService {
  private readonly dataFiles = inject(DataFileService);

  getMatches(): Observable<RatedBattlegroundMatch[]> {
    return this.dataFiles.getJson<unknown>('rated-battlegrounds.json').pipe(
      map(value => normalizeRatedBattlegrounds(value))
    );
  }
}
