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
  RareAchievementDefinition,
  RareAchievementSummary,
  RareAchievementsDataset
} from './rare-achievements.types';

const GLADIATOR_TITLE_ID_ORDER = R1_GLADIATOR_OPTIONS.map((option) => option.value);
const GLADIATOR_MOUNT_ID_ORDER = GLADIATOR_MOUNT_OPTIONS.map((option) => option.value);
const RATED_BATTLEGROUND_HERO_ID_ORDER = RATED_BATTLEGROUND_OPTIONS.map((option) => option.value);
const REALM_FIRST_ID_ORDER = REALM_FIRST_OPTIONS.map((option) => option.value);
const TRACKED_ACHIEVEMENT_FALLBACK_LABELS = new Map<number, string>([
  ...R1_GLADIATOR_OPTIONS.map((option) => [option.value, option.label] as const),
  ...GLADIATOR_MOUNT_OPTIONS.map((option) => [option.value, option.label] as const),
  ...RATED_BATTLEGROUND_OPTIONS.map((option) => [option.value, option.label] as const),
  ...REALM_FIRST_OPTIONS.map((option) => [option.value, option.label] as const)
]);

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
    const achievementNamesById = this.buildAchievementNamesById(dataset.achievements ?? []);

    for (const character of dataset.characters ?? []) {
      const summary = this.toRareAchievementSummary(character, achievementNamesById);

      if (!summary) {
        continue;
      }

      indicators.set(buildRareAchievementCharacterKey(character.name, character.realm), summary);
    }

    return indicators;
  }

  private toRareAchievementSummary(
    character: RareAchievementCharacter,
    achievementNamesById: ReadonlyMap<number, string>
  ): RareAchievementSummary | undefined {
    const ownedAchievementIds = new Set(character.achievements.map((achievement) => achievement.id));
    const gladiatorTitles = this.collectOwnedAchievementNames(
      ownedAchievementIds,
      GLADIATOR_TITLE_ID_ORDER,
      achievementNamesById
    );
    const gladiatorMounts = this.collectOwnedAchievementNames(
      ownedAchievementIds,
      GLADIATOR_MOUNT_ID_ORDER,
      achievementNamesById
    );
    const ratedBattlegroundHeroTitles = this.collectOwnedAchievementNames(
      ownedAchievementIds,
      RATED_BATTLEGROUND_HERO_ID_ORDER,
      achievementNamesById
    );
    const realmFirstAchievements = this.collectOwnedAchievementNames(
      ownedAchievementIds,
      REALM_FIRST_ID_ORDER,
      achievementNamesById
    );
    const achievementNames = [
      ...gladiatorTitles,
      ...gladiatorMounts,
      ...ratedBattlegroundHeroTitles,
      ...realmFirstAchievements
    ];

    if (achievementNames.length === 0) {
      return undefined;
    }

    return {
      gladiatorTitleCount: gladiatorTitles.length,
      gladiatorMountCount: gladiatorMounts.length,
      ratedBattlegroundHeroCount: ratedBattlegroundHeroTitles.length,
      realmFirstCount: realmFirstAchievements.length,
      achievementNames
    };
  }

  private buildAchievementNamesById(
    achievements: ReadonlyArray<RareAchievementDefinition>
  ): Map<number, string> {
    return new Map(achievements.map((achievement) => [achievement.id, achievement.name] as const));
  }

  private collectOwnedAchievementNames(
    ownedAchievementIds: ReadonlySet<number>,
    trackedAchievementIds: ReadonlyArray<number>,
    achievementNamesById: ReadonlyMap<number, string>
  ): string[] {
    const names: string[] = [];

    for (const achievementId of trackedAchievementIds) {
      if (!ownedAchievementIds.has(achievementId)) {
        continue;
      }

      const achievementName = achievementNamesById.get(achievementId)
        ?? TRACKED_ACHIEVEMENT_FALLBACK_LABELS.get(achievementId);

      if (achievementName) {
        names.push(achievementName);
      }
    }

    return names;
  }
}
