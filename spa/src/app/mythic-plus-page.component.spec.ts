import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MythicPlusDungeonFile, MythicPlusIndex, MythicPlusPlayerEntry, NEWER_DATA_MESSAGE } from './mythic-plus';
import { MythicPlusPageComponent } from './mythic-plus-page.component';
import { DataFileService } from './services/data-file.service';

/** One export: an index and its Court of Stars file, where the healer is player 0. */
function exportOf(tables: string, players: MythicPlusPlayerEntry[]): { index: MythicPlusIndex; cos: MythicPlusDungeonFile } {
  return {
    index: {
      version: 1,
      tables,
      season: { id: 'legion-s1', name: 'Legion Season 1', raid: 'Emerald Nightmare', startDate: '2026-09-16' },
      dungeons: [{ id: 'cos', challengeId: 210, shortName: 'COS', name: 'Court of Stars', timerSeconds: 1800, icon: '', runCount: 1, bestScore: 196 }],
      affixes: [],
      specs: [{ class: 11, name: 'Restoration', role: 'healer' }],
      players
    } as MythicPlusIndex,
    cos: { version: 1, dungeon: 'cos', tables, runs: [[19, 1297289, 1791293804, 196, [], [[0, 0]]]] }
  };
}

// The Oct 5 table had Fellicia (a warlock) where the Oct 7 one has Exkeito (a druid).
const oct5 = exportOf('aaaaaaaaaaaa', [['Fellicia', 'Evermoon', 'Yin Yang', 9, 1, 1]]);
const oct7 = exportOf('bbbbbbbbbbbb', [['Exkeito', 'Evermoon', '', 11, 4, 0]]);

/** Serves `held` until refresh(), then `deployed`: a tab that kept an old index across a deploy. */
class FakeDataFiles {
  refreshes = 0;
  constructor(private held: MythicPlusIndex, private readonly deployed: ReturnType<typeof exportOf>) {}

  getJson<T>(): Observable<T> {
    return of(this.held as T);
  }

  fetchJson<T>(): Observable<T> {
    return of(this.deployed.cos as T);
  }

  refresh(): void {
    this.refreshes++;
    this.held = this.deployed.index;
  }
}

function createPage(dataFiles: FakeDataFiles): MythicPlusPageComponent {
  TestBed.configureTestingModule({
    imports: [MythicPlusPageComponent],
    providers: [provideRouter([]), { provide: DataFileService, useValue: dataFiles }]
  });
  const page = TestBed.createComponent(MythicPlusPageComponent).componentInstance;
  page.ngOnInit();
  return page;
}

describe('MythicPlusPageComponent data from two exports', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));

  it('loads the index again when a dungeon file belongs to a newer export', () => {
    const dataFiles = new FakeDataFiles(oct5.index, oct7);
    const page = createPage(dataFiles);

    expect(dataFiles.refreshes).toBe(1);
    expect(page.loadError()).toBeUndefined();
    const healer = page.runsByDungeon().get('cos')?.[0].roster[0];
    expect(healer).toMatchObject({ name: 'Exkeito', class: 11, spec: 'Restoration' });
  });

  it('reports a mismatch that a fresh load does not fix instead of reloading again', () => {
    const dataFiles = new FakeDataFiles(oct5.index, oct7);
    dataFiles.refresh = () => dataFiles.refreshes++; // the deploy is still going out
    const page = createPage(dataFiles);

    expect(dataFiles.refreshes).toBe(1);
    expect(page.loadError()).toBe(NEWER_DATA_MESSAGE);
    expect(page.runsByDungeon().size).toBe(0);
  });

  it('reads files from the same export without reloading', () => {
    const dataFiles = new FakeDataFiles(oct7.index, oct7);
    const page = createPage(dataFiles);

    expect(dataFiles.refreshes).toBe(0);
    expect(page.runsByDungeon().get('cos')?.[0].roster[0].name).toBe('Exkeito');
  });
});
