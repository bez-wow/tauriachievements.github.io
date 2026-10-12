import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, switchMap, throwError } from 'rxjs';
import {
  RAID_LOGS_DATA_DIR,
  RaidBoss,
  RaidBossFile,
  RaidDifficulty,
  RaidKill,
  RaidKillDetails,
  RaidLogsIndex,
  RaidLogsIndexFile,
  bossFilePath,
  decodeBossFile,
  decodeIndex,
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
