import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MythicPlusDungeonFile, MythicPlusIndex, MythicPlusRunEntry, NEWER_DATA_MESSAGE } from './mythic-plus';
import { MythicPlusRecordsPageComponent } from './mythic-plus-records-page.component';
import { DataFileService } from './services/data-file.service';

const unix = (iso: string) => Date.parse(iso) / 1000;
const NOW = '2026-10-07T18:00:00Z';

const index: MythicPlusIndex = {
  version: 1,
  tables: 'aaaaaaaaaaaa',
  season: { id: 'legion-s1', name: 'Legion Season 1', raid: 'Emerald Nightmare', startDate: '2026-09-16' },
  dungeons: [
    { id: 'nl', challengeId: 206, shortName: 'NL', name: "Neltharion's Lair", timerSeconds: 1980, icon: 'nl.png', runCount: 3, bestScore: 190 },
    { id: 'mos', challengeId: 208, shortName: 'MOS', name: 'Maw of Souls', timerSeconds: 1440, icon: 'mos.png', runCount: 4, bestScore: 180 },
    { id: 'hov', challengeId: 200, shortName: 'HOV', name: 'Halls of Valor', timerSeconds: 2700, icon: 'hov.png', runCount: 2, bestScore: 170 }
  ],
  affixes: [],
  specs: [
    { class: 10, name: 'Windwalker', role: 'dps' },
    { class: 6, name: 'Blood', role: 'tank' },
    { class: 5, name: 'Holy', role: 'healer' },
    { class: 8, name: 'Fire', role: 'dps' }
  ],
  players: [
    ['Progtrix', 'Evermoon', 'The Echoes', 10, 10, 1],
    ['Tank', 'Evermoon', '', 6, 1, 0],
    ['Healer', 'Tauri', '', 5, 1, 0],
    ['Arrchangel', 'WoD', '', 8, 1, 0]
  ]
};

const lastWeek = [7, 1, 9];
const thisWeek = [8, 3, 10];

const runs: Record<string, MythicPlusRunEntry[]> = {
  nl: [
    [19, 1797000, unix('2026-10-05T12:00:00Z'), 190, thisWeek, [[0, 0], [1, 1], [2, 2]]],
    [18, 1500000, unix('2026-09-26T14:07:00Z'), 185, lastWeek, [[1, 1], [0, 0]]],
    [16, 1900000, unix('2026-09-20T16:03:00Z'), 165, lastWeek, [[0, 0]]]
  ],
  mos: [
    [17, 1174220, unix('2026-09-26T13:34:00Z'), 180, lastWeek, [[0, 0], [1, 1]]],
    [17, 1300000, unix('2026-09-21T15:10:00Z'), 177, lastWeek, [[0, 0]]],
    // 13 seconds over the timer
    [18, 1453188, unix('2026-09-27T12:00:00Z'), 177, lastWeek, [[1, 1], [2, 2]]],
    [15, 1400000, unix('2026-09-16T22:11:00Z'), 160, lastWeek, [[0, 0]]]
  ],
  hov: [
    [16, 1715000, unix('2026-09-27T14:46:00Z'), 170, lastWeek, [[0, 0]]],
    [12, 2000000, unix('2026-09-20T12:30:00Z'), 130, lastWeek, [[3, 3]]]
  ]
};

const fileFor = (path: string, tables = index.tables): MythicPlusDungeonFile => {
  const dungeon = path.replace(/^.*\//, '').replace('.json', '');
  return { version: 1, dungeon, tables, runs: runs[dungeon] };
};

class FakeDataFiles {
  refreshes = 0;
  /** Dungeon files carry another export's tables until refresh() when set. */
  constructor(private staleTables?: string, private readonly staysStale = false) {}

  getJson<T>(): Observable<T> {
    return of(index as T);
  }

  fetchJson<T>(path: string): Observable<T> {
    return of(fileFor(path, this.staleTables ?? index.tables) as T);
  }

  refresh(): void {
    this.refreshes++;
    if (!this.staysStale) {
      this.staleTables = undefined;
    }
  }
}

async function open(url: string, dataFiles = new FakeDataFiles()) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'mythic-plus/records', component: MythicPlusRecordsPageComponent }]),
      { provide: DataFileService, useValue: dataFiles }
    ]
  });
  const harness = await RouterTestingHarness.create();
  const page = await harness.navigateByUrl(url, MythicPlusRecordsPageComponent);
  harness.detectChanges();
  return { harness, page, element: harness.routeNativeElement as HTMLElement };
}

const texts = (element: HTMLElement, selector: string) =>
  [...element.querySelectorAll(selector)].map(node => node.textContent?.replace(/\s+/g, ' ').trim());

describe('MythicPlusRecordsPageComponent', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => vi.useRealTimers());

  it('shows each dungeon record, highest first, with how long it has stood', async () => {
    const { page, element } = await open('/mythic-plus/records');

    expect(page.records().map(record => [record.dungeon.id, record.run?.keyLevel, record.heldFor])).toEqual([
      ['nl', 19, 'held for 2 days'],
      // The faster of the two +17s holds it.
      ['mos', 17, 'held for 11 days'],
      ['hov', 16, 'held for 10 days']
    ]);
    expect(texts(element, '.record-card h3')).toEqual(["Neltharion's Lair", 'Maw of Souls', 'Halls of Valor']);
    expect(texts(element, '.record-card:first-child .record-time > *')).toEqual(['29:57', 'of 33:00', '-3:03']);
    // Tank, healer, then DPS, each opening their profile.
    expect([...element.querySelectorAll('.record-card:first-child .group a')].map(link => link.getAttribute('href'))).toEqual([
      '/mythic-plus/character/evermoon/Tank',
      '/mythic-plus/character/tauri/Healer',
      '/mythic-plus/character/evermoon/Progtrix'
    ]);
  });

  it('opens a record into the full run details', async () => {
    const { harness, element } = await open('/mythic-plus/records');
    const toggle = element.querySelector<HTMLButtonElement>('.record-card .details-toggle');

    toggle?.click();
    harness.detectChanges();

    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('#record-details-nl-1 app-mythic-plus-run-details')).not.toBeNull();

    toggle?.click();
    harness.detectChanges();
    expect(element.querySelector('app-mythic-plus-run-details')).toBeNull();
  });

  it('lists the first timed run at each level from +10 up', async () => {
    const { page, element } = await open('/mythic-plus/records');

    expect(page.firsts().map(first => [first.level, first.run.id])).toEqual([
      [19, 'nl-1'], [18, 'nl-2'], [17, 'mos-2'], [16, 'nl-3'], [15, 'mos-4'], [12, 'hov-2']
    ]);
    expect(texts(element, '.first-level')).toEqual(['+19', '+18', '+17', '+16', '+15', '+12']);
    expect(texts(element, '.section-filter .dropdown-trigger .option-label')).toEqual(['All dungeons']);
    expect(element.querySelector('.section-filter .dropdown.has-selection')).toBeNull();

    // The same run opens on its own in each list, and a record stays open while a first opens.
    page.toggle('record', 'mos-1');
    element.querySelector<HTMLElement>('.first-row')?.click();
    expect(page.isExpanded('first', 'nl-1')).toBe(true);
    expect(page.isExpanded('record', 'nl-1')).toBe(false);
    expect(page.isExpanded('record', 'mos-1')).toBe(true);
  });

  it('shows the open bounties, the closest attempt and a claim from this week', async () => {
    const { page, element } = await open('/mythic-plus/records');

    expect(page.serverBounty()).toEqual(expect.objectContaining({ level: 20, attempts: 0, closest: undefined }));
    expect(page.serverBounty().claimed?.id).toBe('nl-1');
    expect(texts(element, '.server-bounty h3')).toEqual(['Nobody has timed a +20 yet']);

    expect(page.bounties().map(bounty => [bounty.key, bounty.level, bounty.attempts, bounty.missedBy, bounty.claimed?.id])).toEqual([
      ['hov', 17, 0, undefined, undefined],
      ['mos', 18, 1, '0:13', undefined],
      ['nl', 20, 0, undefined, 'nl-1']
    ]);
    expect(texts(element, '.bounty-card .bounty-closest')[1]).toBe('Closest: +18, missed by 0:13 · 27 Sep');
    expect(texts(element, '.bounty-card .bounty-claimed p')).toEqual(['✓ +19 claimed on 5 Oct by']);

    expect(page.summary().map(tile => [tile.label, tile.value, tile.note])).toEqual([
      ['Highest timed key', '+19', 'NL'],
      ['Next server first', '+20', 'No attempts yet'],
      ["This week's highest key", '+19', 'NL']
    ]);
  });

  it('switches to the WoD leaderboard and keeps it in the address bar', async () => {
    const { page, harness, element } = await open('/mythic-plus/records');
    page.toggle('record', 'nl-1');

    page.setRealm('wod');
    harness.detectChanges();

    expect(TestBed.inject(Location).path()).toBe('/mythic-plus/records?realm=wod');
    expect(page.expanded()).toEqual({});
    expect(page.records().map(record => [record.dungeon.id, record.run?.keyLevel])).toEqual([
      ['hov', 12], ['nl', undefined], ['mos', undefined]
    ]);
    expect(texts(element, '.record-empty')).toEqual(['Nobody has timed it yet.', 'Nobody has timed it yet.']);
    expect(page.firsts().map(first => first.level)).toEqual([12]);
    expect(page.serverBounty().level).toBe(13);
    expect(page.bounties().map(bounty => [bounty.key, bounty.level])).toEqual([['nl', 2], ['mos', 2], ['hov', 13]]);
  });

  it('reads the realm and the firsts dungeon from the URL, and writes the dungeon back', async () => {
    const { page } = await open('/mythic-plus/records?realm=wod&dungeon=hov');

    expect(page.realm()).toBe('wod');
    expect(page.selectedFirstsDungeon()?.id).toBe('hov');
    expect(page.firsts().map(first => first.level)).toEqual([12]);

    page.setRealm('all');
    page.setFirstsDungeon('mos');
    expect(page.firsts().map(first => first.level)).toEqual([17, 15]);
    expect(TestBed.inject(Location).path()).toBe('/mythic-plus/records?dungeon=mos');

    page.setFirstsDungeon(undefined);
    expect(TestBed.inject(Location).path()).toBe('/mythic-plus/records');
  });

  it('ignores a dungeon the index does not list', async () => {
    const { page } = await open('/mythic-plus/records?dungeon=kara');

    expect(page.selectedFirstsDungeon()).toBeUndefined();
    expect(page.firsts()).toHaveLength(6);
  });

  it('loads everything again once when the dungeon files come from a newer export', async () => {
    const dataFiles = new FakeDataFiles('bbbbbbbbbbbb');
    const { page } = await open('/mythic-plus/records', dataFiles);

    expect(dataFiles.refreshes).toBe(1);
    expect(page.loadError()).toBeUndefined();
    expect(page.records()[0].run?.id).toBe('nl-1');
  });

  it('reports a mismatch a fresh load does not fix', async () => {
    const dataFiles = new FakeDataFiles('bbbbbbbbbbbb', true);
    const { page } = await open('/mythic-plus/records', dataFiles);

    expect(dataFiles.refreshes).toBe(2);
    expect(page.loadError()).toBe(NEWER_DATA_MESSAGE);
  });
});
