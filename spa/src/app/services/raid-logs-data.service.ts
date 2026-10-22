import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, shareReplay, switchMap, throwError } from 'rxjs';
import {
  RAID_GENDERS_PATH,
  RAID_LOGS_DATA_DIR,
  RAID_TALENTS_PATH,
  RAID_TALENT_TOOLTIPS_PATH,
  RaidBoss,
  RaidBossFile,
  RaidDifficulty,
  RaidGendersFile,
  RaidKill,
  RaidKillDetails,
  RaidLogsIndex,
  RaidLogsIndexFile,
  RaidTalentTable,
  RaidTalentTooltips,
  RaidTalentTooltipsFile,
  RaidTalentsFile,
  bossFilePath,
  decodeBossFile,
  decodeGenders,
  decodeIndex,
  decodeTalentTooltips,
  decodeTalents,
  realmSlug
} from '../raid-logs';
import { DataFileService } from './data-file.service';

export interface FoundKill {
  index: RaidLogsIndex;
  kill?: RaidKill;
  details?: RaidKillDetails;
}

/**
 * Loads and decodes the /raid-logs data once per session: the index, and each boss file the
 * first time a page needs it. Boss files hold their own guild and player tables, so a boss file
 * from a newer deploy than the index still reads correctly.
 */
@Injectable({ providedIn: 'root' })
export class RaidLogsDataService {
  private readonly dataFiles = inject(DataFileService);
  private readonly memoized = new Map<string, Observable<unknown>>();

  /**
   * The difficulty slug last picked or linked on a Raids tab (Logs, Guilds, Statistics, Talents,
   * Rankings). A tab opened without `?difficulty=` starts on it, so the tabs stay on one difficulty
   * although the nav links carry none. Kept for the session only.
   */
  readonly lastDifficulty = signal<string | undefined>(undefined);

  index(): Observable<RaidLogsIndex> {
    return this.memoize('index', () =>
      this.dataFiles.fetchJson<RaidLogsIndexFile>(`${RAID_LOGS_DATA_DIR}/index.json`).pipe(map(decodeIndex)));
  }

  /** A boss's kills on one difficulty, oldest first. A difficulty without kills has no file. */
  bossKills(index: RaidLogsIndex, boss: RaidBoss, difficulty: RaidDifficulty): Observable<RaidKillDetails[]> {
    const hasKills = index.kills.some(kill => kill.boss === boss && kill.difficulty === difficulty);
    if (!hasKills) {
      return of([]);
    }

    const path = bossFilePath(boss, difficulty);
    return this.memoize(path, () =>
      this.dataFiles.fetchJson<RaidBossFile>(path).pipe(map(file => decodeBossFile(file, boss, difficulty, index.specs))));
  }

  /** Every detailed kill on one difficulty, in boss order. Used for raid-wide roster analytics. */
  difficultyKills(index: RaidLogsIndex, difficulty: RaidDifficulty): Observable<RaidKillDetails[]> {
    if (!index.bosses.length) {
      return of([]);
    }

    return forkJoin(index.bosses.map(boss => this.bossKills(index, boss, difficulty))).pipe(
      map(killsByBoss => killsByBoss.flat())
    );
  }

  /**
   * The ladder's gender for the raid characters the raid logs have wrong, by characterKey. Only
   * race icons depend on it, so a file that won't load is an empty map, not an error.
   */
  genders(): Observable<ReadonlyMap<string, number>> {
    return this.memoize('genders', () => this.dataFiles.fetchJson<RaidGendersFile>(RAID_GENDERS_PATH).pipe(
      map(decodeGenders),
      catchError((error: unknown) => {
        console.warn('Could not load the raid genders; race icons keep the gender from the raid logs.', error);
        return of(new Map<string, number>());
      })
    ));
  }

  /**
   * Every spec's talent tiers, to name the talents members picked. Only talent icons depend on
   * it, so a file that won't load is an empty table, not an error.
   */
  talents(): Observable<RaidTalentTable> {
    return this.memoize('talents', () => this.dataFiles.fetchJson<RaidTalentsFile>(RAID_TALENTS_PATH).pipe(
      map(decodeTalents),
      catchError((error: unknown) => {
        console.warn('Could not load the talents; the boss rankings show none.', error);
        return of(new Map() as RaidTalentTable);
      })
    ));
  }

  talentTooltips(): Observable<RaidTalentTooltips> {
    return this.memoize('talentTooltips', () => this.dataFiles.fetchJson<RaidTalentTooltipsFile>(RAID_TALENT_TOOLTIPS_PATH).pipe(
      map(decodeTalentTooltips),
      catchError((error: unknown) => {
        console.warn('Could not load the talent tooltips; talents show their names only.', error);
        return of(new Map() as RaidTalentTooltips);
      })
    ));
  }

  /**
   * One kill and its details. A kill the index doesn't list may be newer than the index this tab
   * loaded, so the data is loaded fresh once before giving up.
   */
  findKill(realm: string, logId: number): Observable<FoundKill> {
    return this.findIn(realm, logId).pipe(
      switchMap(found => {
        if (found.kill) {
          return of(found);
        }

        this.refresh();
        return this.findIn(realm, logId);
      }),
      switchMap(found => found.kill
        ? this.bossKills(found.index, found.kill.boss, found.kill.difficulty).pipe(
          map(kills => ({ ...found, details: kills.find(kill => kill.logId === logId && kill.realm === found.kill!.realm) })))
        : of(found))
    );
  }

  /** Forgets everything loaded, for a tab left open across a deploy. */
  refresh(): void {
    this.dataFiles.refresh();
    this.memoized.clear();
  }

  private findIn(realm: string, logId: number): Observable<FoundKill> {
    const slug = realmSlug(realm);
    return this.index().pipe(map(index => ({
      index,
      kill: index.kills.find(kill => kill.logId === logId && realmSlug(kill.realm) === slug)
    })));
  }

  private memoize<T>(key: string, load: () => Observable<T>): Observable<T> {
    let cached = this.memoized.get(key) as Observable<T> | undefined;

    if (!cached) {
      cached = load().pipe(
        catchError((error: unknown) => {
          this.memoized.delete(key);
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
      this.memoized.set(key, cached);
    }

    return cached;
  }
}
