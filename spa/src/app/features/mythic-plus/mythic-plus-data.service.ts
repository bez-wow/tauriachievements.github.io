import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, switchMap, throwError } from 'rxjs';
import {
  MYTHIC_PLUS_DATA_DIR,
  MythicPlusDungeonFile,
  MythicPlusIndex,
  MythicPlusRun,
  NEWER_DATA_MESSAGE,
  createRunDecoder,
  sharesTables
} from './mythic-plus';
import { DataFileService } from '../../core/data-file.service';
import { ObservableCache } from '../../core/observable-cache';

export interface MythicPlusSeason {
  readonly index: MythicPlusIndex;
  readonly runs: readonly MythicPlusRun[];
}

export class NewerExportError extends Error {
  constructor(dungeonId: string) {
    super(`${dungeonId}.json and index.json come from different exports`);
  }
}

export function mythicPlusLoadError(error: unknown): string {
  return error instanceof NewerExportError ? NEWER_DATA_MESSAGE : 'The Mythic+ runs could not be loaded.';
}

@Injectable({ providedIn: 'root' })
export class MythicPlusDataService {
  private readonly dataFiles = inject(DataFileService);
  private readonly cache = new ObservableCache();
  private readonly decoders = new WeakMap<MythicPlusIndex, (file: MythicPlusDungeonFile) => MythicPlusRun[]>();

  index(): Observable<MythicPlusIndex> {
    return this.cache.get('index', () => this.dataFiles.getJson<MythicPlusIndex>(`${MYTHIC_PLUS_DATA_DIR}/index.json`));
  }

  dungeonRuns(index: MythicPlusIndex, dungeonId: string): Observable<readonly MythicPlusRun[]> {
    return this.cache.get(`dungeon:${dungeonId}`, () =>
      this.dataFiles.fetchJson<MythicPlusDungeonFile>(`${MYTHIC_PLUS_DATA_DIR}/${dungeonId}.json`).pipe(
        map(file => {
          if (!sharesTables(index, file)) {
            throw new NewerExportError(dungeonId);
          }
          return this.decoderFor(index)(file);
        })
      ));
  }

  season(): Observable<MythicPlusSeason> {
    return this.loadSeason().pipe(
      catchError((error: unknown) => {
        if (!(error instanceof NewerExportError)) {
          return throwError(() => error);
        }
        this.refresh();
        return this.loadSeason();
      })
    );
  }

  refresh(): void {
    this.dataFiles.refresh();
    this.cache.clear();
  }

  private loadSeason(): Observable<MythicPlusSeason> {
    return this.index().pipe(
      switchMap(index => forkJoin(index.dungeons.map(dungeon => this.dungeonRuns(index, dungeon.id))).pipe(
        map(runsByDungeon => ({ index, runs: runsByDungeon.flat() }))
      ))
    );
  }

  private decoderFor(index: MythicPlusIndex): (file: MythicPlusDungeonFile) => MythicPlusRun[] {
    let decode = this.decoders.get(index);
    if (!decode) {
      decode = createRunDecoder(index);
      this.decoders.set(index, decode);
    }
    return decode;
  }
}
