import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, throwError } from 'rxjs';
import {
  GLADIATOR_MOUNT_OPTIONS,
  REALM_FIRST_OPTIONS,
  R1_GLADIATOR_OPTIONS,
  RATED_BATTLEGROUND_OPTIONS,
  buildRareAchievementCharacterKey
} from './rare-achievement-groups';
import {
  RareAchievementCharacter,
  RareAchievementSummary,
  RareAchievementsDataset
} from './rare-achievements.types';

const GLADIATOR_TITLE_IDS = new Set<number>(R1_GLADIATOR_OPTIONS.map((option) => option.value));
const GLADIATOR_MOUNT_IDS = new Set<number>(GLADIATOR_MOUNT_OPTIONS.map((option) => option.value));
const RATED_BATTLEGROUND_HERO_IDS = new Set<number>(RATED_BATTLEGROUND_OPTIONS.map((option) => option.value));
const REALM_FIRST_IDS = new Set<number>(REALM_FIRST_OPTIONS.map((option) => option.value));

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

    for (const character of dataset.characters ?? []) {
      const summary = this.toRareAchievementSummary(character);

      if (!summary) {
        continue;
      }

      indicators.set(buildRareAchievementCharacterKey(character.name, character.realm), summary);
    }

    return indicators;
  }

  private toRareAchievementSummary(character: RareAchievementCharacter): RareAchievementSummary | undefined {
    const ownedAchievementIds = new Set(character.achievements.map((achievement) => achievement.id));
    const gladiatorTitleCount = this.countOwnedAchievements(ownedAchievementIds, GLADIATOR_TITLE_IDS);
    const gladiatorMountCount = this.countOwnedAchievements(ownedAchievementIds, GLADIATOR_MOUNT_IDS);
    const ratedBattlegroundHeroCount = this.countOwnedAchievements(ownedAchievementIds, RATED_BATTLEGROUND_HERO_IDS);
    const realmFirstCount = this.countOwnedAchievements(ownedAchievementIds, REALM_FIRST_IDS);

    if (gladiatorTitleCount === 0 && gladiatorMountCount === 0 && ratedBattlegroundHeroCount === 0 && realmFirstCount === 0) {
      return undefined;
    }

    return {
      gladiatorTitleCount,
      gladiatorMountCount,
      ratedBattlegroundHeroCount,
      realmFirstCount
    };
  }

  private countOwnedAchievements(ownedAchievementIds: ReadonlySet<number>, trackedAchievementIds: ReadonlySet<number>): number {
    let count = 0;

    for (const achievementId of trackedAchievementIds) {
      if (ownedAchievementIds.has(achievementId)) {
        count++;
      }
    }

    return count;
  }
}
