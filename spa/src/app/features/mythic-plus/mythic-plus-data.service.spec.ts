import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { MythicPlusDungeonFile, MythicPlusIndex, NEWER_DATA_MESSAGE } from './mythic-plus';
import { DataFileService } from '../../core/data-file.service';
import { MythicPlusDataService, NewerExportError, mythicPlusLoadError } from './mythic-plus-data.service';

const index = {
  version: 1,
  tables: 'aaaaaaaaaaaa',
  season: { id: 'legion-s1', name: 'Legion Season 1', raid: 'Emerald Nightmare', startDate: '2026-09-16' },
  dungeons: [
    { id: 'cos', challengeId: 210, shortName: 'COS', name: 'Court of Stars', timerSeconds: 1800, icon: '', runCount: 1, bestScore: 100 },
    { id: 'arc', challengeId: 209, shortName: 'ARC', name: 'The Arcway', timerSeconds: 2700, icon: '', runCount: 1, bestScore: 90 }
  ],
  affixes: [],
  players: [['Exkeito', 'Evermoon', '', 11, 4, 0]],
  specs: [{ class: 11, spec: 'Restoration', role: 'healer' }],
  standings: [[100, 1]]
} as unknown as MythicPlusIndex;

class FakeDataFiles {
  fetches: string[] = [];
  refreshes = 0;

  constructor(private tables: string[] = []) {}

  getJson<T>(): Observable<T> {
    return of(index as T);
  }

  fetchJson<T>(path: string): Observable<T> {
    this.fetches.push(path);
    const dungeon = path.replace(/^.*\//, '').replace('.json', '');
    const file: MythicPlusDungeonFile = {
      version: 1,
      dungeon,
      tables: this.tables[0] ?? index.tables,
      runs: [[15, 1500000, 1790000000, 100, [], [[0, 0]]]]
    };
    return of(file as T);
  }

  refresh(): void {
    this.refreshes++;
    this.tables.shift();
  }
}

function serviceWith(dataFiles: FakeDataFiles): MythicPlusDataService {
  TestBed.configureTestingModule({ providers: [{ provide: DataFileService, useValue: dataFiles }] });
  return TestBed.inject(MythicPlusDataService);
}

describe('MythicPlusDataService', () => {
  it('decodes every dungeon once and serves the next page from memory', async () => {
    const dataFiles = new FakeDataFiles();
    const service = serviceWith(dataFiles);

    const first = await firstValueFrom(service.season());
    const second = await firstValueFrom(service.season());

    expect(first.runs).toHaveLength(2);
    expect(second.runs[0]).toBe(first.runs[0]);
    expect(dataFiles.fetches).toEqual(['mythic-plus-data/cos.json', 'mythic-plus-data/arc.json']);
  });

  it('shares one member object between the dungeons a character played', async () => {
    const service = serviceWith(new FakeDataFiles());

    const { runs } = await firstValueFrom(service.season());

    expect(runs[0].roster[0]).toBe(runs[1].roster[0]);
  });

  it('loads everything again once when a dungeon file comes from another export', async () => {
    const dataFiles = new FakeDataFiles(['bbbbbbbbbbbb']);
    const service = serviceWith(dataFiles);

    const { runs } = await firstValueFrom(service.season());

    expect(dataFiles.refreshes).toBe(1);
    expect(runs).toHaveLength(2);
  });

  it('gives up when a fresh load still mixes exports', async () => {
    const dataFiles = new FakeDataFiles(['bbbbbbbbbbbb', 'bbbbbbbbbbbb']);
    const service = serviceWith(dataFiles);

    const error = await firstValueFrom(service.season()).catch((caught: unknown) => caught);

    expect(dataFiles.refreshes).toBe(1);
    expect(error).toBeInstanceOf(NewerExportError);
    expect(mythicPlusLoadError(error)).toBe(NEWER_DATA_MESSAGE);
    expect(mythicPlusLoadError(new Error('offline'))).toBe('The Mythic+ runs could not be loaded.');
  });
});
