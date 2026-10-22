import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import {
  RAID_GENDERS_PATH,
  RAID_LOGS_DATA_DIR,
  RAID_TALENTS_PATH,
  RAID_TALENT_TOOLTIPS_PATH,
  bossFilePath,
  decodeBossFile,
  decodeGenders,
  decodeIndex,
  decodeTalentTooltips,
  decodeTalents
} from './raid-logs';
import {
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
  RaidTalentsFile
} from './raid-logs.types';
import { DataFileService } from '../../core/data-file.service';
import { ObservableCache } from '../../core/observable-cache';
import { realmSlug } from '../../game/wow';

export interface FoundKill {
  index: RaidLogsIndex;
  kill?: RaidKill;
  details?: RaidKillDetails;
}

@Injectable({ providedIn: 'root' })
export class RaidLogsDataService {
  private readonly dataFiles = inject(DataFileService);
  private readonly cache = new ObservableCache();

  readonly lastDifficulty = signal<string | undefined>(undefined);

  index(): Observable<RaidLogsIndex> {
    return this.cache.get('index', () =>
      this.dataFiles.fetchJson<RaidLogsIndexFile>(`${RAID_LOGS_DATA_DIR}/index.json`).pipe(map(decodeIndex)));
  }

  bossKills(index: RaidLogsIndex, boss: RaidBoss, difficulty: RaidDifficulty): Observable<RaidKillDetails[]> {
    const hasKills = index.kills.some(kill => kill.boss === boss && kill.difficulty === difficulty);
    if (!hasKills) {
      return of([]);
    }

    const path = bossFilePath(boss, difficulty);
    return this.cache.get(path, () =>
      this.dataFiles.fetchJson<RaidBossFile>(path).pipe(map(file => decodeBossFile(file, boss, difficulty, index.specs))));
  }

  difficultyKills(index: RaidLogsIndex, difficulty: RaidDifficulty): Observable<RaidKillDetails[]> {
    if (!index.bosses.length) {
      return of([]);
    }

    return forkJoin(index.bosses.map(boss => this.bossKills(index, boss, difficulty))).pipe(
      map(killsByBoss => killsByBoss.flat())
    );
  }

  genders(): Observable<ReadonlyMap<string, number>> {
    return this.cache.get('genders', () => this.dataFiles.fetchJson<RaidGendersFile>(RAID_GENDERS_PATH).pipe(
      map(decodeGenders),
      catchError((error: unknown) => {
        console.warn('Could not load the raid genders; race icons keep the gender from the raid logs.', error);
        return of(new Map<string, number>());
      })
    ));
  }

  talents(): Observable<RaidTalentTable> {
    return this.cache.get('talents', () => this.dataFiles.fetchJson<RaidTalentsFile>(RAID_TALENTS_PATH).pipe(
      map(decodeTalents),
      catchError((error: unknown) => {
        console.warn('Could not load the talents; the boss rankings show none.', error);
        return of(new Map() as RaidTalentTable);
      })
    ));
  }

  talentTooltips(): Observable<RaidTalentTooltips> {
    return this.cache.get('talentTooltips', () => this.dataFiles.fetchJson<RaidTalentTooltipsFile>(RAID_TALENT_TOOLTIPS_PATH).pipe(
      map(decodeTalentTooltips),
      catchError((error: unknown) => {
        console.warn('Could not load the talent tooltips; talents show their names only.', error);
        return of(new Map() as RaidTalentTooltips);
      })
    ));
  }

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

  refresh(): void {
    this.dataFiles.refresh();
    this.cache.clear();
  }

  private findIn(realm: string, logId: number): Observable<FoundKill> {
    const slug = realmSlug(realm);
    return this.index().pipe(map(index => ({
      index,
      kill: index.kills.find(kill => kill.logId === logId && realmSlug(kill.realm) === slug)
    })));
  }
}
