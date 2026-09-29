import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, throwError } from 'rxjs';
import { buildRareAchievementCharacterKey } from './rare-achievement-groups';
import { buildRareAchievementNamesById, summarizeRareAchievements } from './rare-achievement-summary';
import {
  RareAchievementSummary,
  RareAchievementsDataset
} from './rare-achievements.types';
import { DataFileService } from './services/data-file.service';

/**
 * RareAchievements.json and the per-character summaries derived from it. Both are loaded
 * and computed once per session and shared by the Ladder, Rare Achievements and New Rare
 * Characters pages.
 */
@Injectable({ providedIn: 'root' })
export class RareAchievementsService {
  private readonly dataFiles = inject(DataFileService);
  private summaries$?: Observable<Map<string, RareAchievementSummary>>;

  getRareAchievements(): Observable<RareAchievementsDataset> {
    return this.dataFiles.getJson<RareAchievementsDataset>('RareAchievements.json');
  }

  /** Summary per character, keyed by {@link buildRareAchievementCharacterKey}. */
  getRareAchievementIndicators(): Observable<Map<string, RareAchievementSummary>> {
    this.summaries$ ??= this.getRareAchievements().pipe(
      map((dataset) => this.buildRareAchievementIndicators(dataset)),
      catchError((error: unknown) => {
        this.summaries$ = undefined;
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    return this.summaries$;
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
