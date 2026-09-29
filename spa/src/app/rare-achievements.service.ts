import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, throwError } from 'rxjs';
import { buildRareAchievementCharacterKey } from './rare-achievement-groups';
import { buildRareAchievementNamesById, summarizeRareAchievements } from './rare-achievement-summary';
import {
  RareAchievementSummary,
  RareAchievementsDataset
} from './rare-achievements.types';

@Injectable({ providedIn: 'root' })
export class RareAchievementsService {
  private readonly http = inject(HttpClient);
  private rareAchievementIndicators$?: Observable<Map<string, RareAchievementSummary>>;

  getRareAchievements(): Observable<RareAchievementsDataset> {
    return this.http.get<RareAchievementsDataset>(`RareAchievements.json?v=${Date.now()}`);
  }

  getRareAchievementIndicators(): Observable<Map<string, RareAchievementSummary>> {
    if (!this.rareAchievementIndicators$) {
      this.rareAchievementIndicators$ = this.getRareAchievements().pipe(
        map((dataset) => this.buildRareAchievementIndicators(dataset)),
        catchError((error) => {
          this.rareAchievementIndicators$ = undefined;
          return throwError(() => error);
        }),
        shareReplay(1)
      );
    }

    return this.rareAchievementIndicators$;
  }

  private buildRareAchievementIndicators(dataset: RareAchievementsDataset): Map<string, RareAchievementSummary> {
    const indicators = new Map<string, RareAchievementSummary>();
    const achievementNamesById = buildRareAchievementNamesById(dataset.achievements ?? []);

    for (const character of dataset.characters ?? []) {
      const summary = summarizeRareAchievements(character, achievementNamesById);

      if (!summary) {
        continue;
      }

      indicators.set(buildRareAchievementCharacterKey(character.name, character.realm), summary);
    }

    return indicators;
  }
}
