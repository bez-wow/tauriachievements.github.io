import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MythicPlusDungeonFile, MythicPlusIndex, MythicPlusRunEntry, NEWER_DATA_MESSAGE } from './mythic-plus';
import { MythicPlusGuildPageComponent } from './mythic-plus-guild-page.component';
import { DataFileService } from '../../core/data-file.service';

const unix = (iso: string) => Date.parse(iso) / 1000;

const index: MythicPlusIndex = {
  version: 1,
  tables: 'aaaaaaaaaaaa',
  generatedAt: '2026-10-15T06:00:00Z',
  previousGeneratedAt: '2026-10-14T06:00:00Z',
  season: { id: 'legion-s1', name: 'Legion Season 1', raid: 'Emerald Nightmare', startDate: '2026-09-16' },
  dungeons: [
    { id: 'nl', challengeId: 206, shortName: 'NL', name: "Neltharion's Lair", timerSeconds: 1980, icon: 'nl.png', runCount: 2, bestScore: 160 },
    { id: 'dht', challengeId: 198, shortName: 'DHT', name: 'Darkheart Thicket', timerSeconds: 1800, icon: 'dht.png', runCount: 2, bestScore: 150 }
  ],
  affixes: [],
  specs: [
    { class: 6, name: 'Unholy', role: 'dps' },
    { class: 10, name: 'Windwalker', role: 'dps' },
    { class: 8, name: 'Fire', role: 'dps' },
    { class: 5, name: 'Holy', role: 'healer' },
    { class: 6, name: 'Blood', role: 'tank' }
  ],
  players: [
    ['Dksmus', 'Evermoon', 'Skill Issue', 6, 1, 0],
    ['Polán', 'Evermoon', 'Skill Issue', 10, 1, 0],
    ['Outsider', 'Evermoon', 'A Murder of Crows', 8, 1, 0],
    ['Twin', 'Tauri', 'Skill Issue', 5, 1, 0],
    ['Newbie', 'Evermoon', 'Skill Issue', 5, 1, 0]
  ],
  standings: [
    [280, 3, 0, -2],
    [290, 2, 25, 3],
    [310, 1, 30, 1],
    [140, 4, 0, 0],
    [120, 5]
  ]
};

const runs: Record<string, MythicPlusRunEntry[]> = {
  nl: [
    [16, 1500000, unix('2026-10-10T18:00:00Z'), 160, [], [[2, 2], [0, 0]]],
    [14, 1600000, unix('2026-10-11T18:00:00Z'), 140, [], [[1, 1], [3, 3]]]
  ],
  dht: [
    [15, 1500000, unix('2026-10-12T18:00:00Z'), 150, [], [[1, 1], [2, 2]]],
    [12, 1600000, unix('2026-10-13T18:00:00Z'), 120, [], [[0, 4], [4, 3]]]
  ]
};

class FakeDataFiles {
  refreshes = 0;
  constructor(private staleTables?: string, private readonly staysStale = false) {}

  getJson<T>(): Observable<T> {
    return of(index as T);
  }

  fetchJson<T>(path: string): Observable<T> {
    const dungeon = path.replace(/^.*\//, '').replace('.json', '');
    const file: MythicPlusDungeonFile = { version: 1, dungeon, tables: this.staleTables ?? index.tables, runs: runs[dungeon] };
    return of(file as T);
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
      provideRouter([{ path: 'mythic-plus/guild/:realm/:guild', component: MythicPlusGuildPageComponent }]),
      { provide: DataFileService, useValue: dataFiles }
    ]
  });
  const harness = await RouterTestingHarness.create();
  const page = await harness.navigateByUrl(url, MythicPlusGuildPageComponent);
  harness.detectChanges();
  return { harness, page, element: harness.routeNativeElement as HTMLElement };
}

const texts = (element: HTMLElement, selector: string) =>
  [...element.querySelectorAll(selector)].map(node => node.textContent?.trim());

describe('MythicPlusGuildPageComponent', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('matchMedia', (media: string) => ({
      media,
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('ranks the guild members with their overall rank beside the guild one', async () => {
    const { page, element } = await open('/mythic-plus/guild/evermoon/Skill%20Issue');

    expect(element.querySelector('h1')?.textContent).toBe('Skill Issue');
    expect(texts(element, '.player-row .member-link').map(name => name?.split(' ')[0])).toEqual(['Polán', 'Dksmus', 'Newbie']);
    expect(page.rows().map(row => [row.rank, row.overall?.rank, row.score])).toEqual([[1, 2, 290], [2, 3, 280], [3, 5, 120]]);
    expect(texts(element, 'a.overall-link')).toEqual(['#2', '#3', '#5']);
    expect(element.querySelector('.col-guild')).toBeNull();

    expect(page.summary().map(tile => [tile.label, tile.value, tile.note])).toEqual([
      ['Characters', '3', 'with a run this season'],
      ['Best score', '290.0', 'Polán'],
      ['Top 100', '3', 'members overall']
    ]);
    expect(element.querySelector('a.summary-note')?.getAttribute('href')).toBe('/mythic-plus/character/evermoon/Pol%C3%A1n');
  });

  it('links each overall rank to that row on the leaderboard', async () => {
    const { element } = await open('/mythic-plus/guild/evermoon/Skill%20Issue');

    expect(element.querySelectorAll('a.overall-link')[1].getAttribute('href'))
      .toBe('/mythic-plus?view=players&character=Dksmus-Evermoon');
  });

  it('shows guild-rank movement worked out from the overall standings', async () => {
    const { page, element } = await open('/mythic-plus/guild/evermoon/Skill%20Issue');

    expect(page.rows().map(row => [row.member.name, row.change, row.newSinceLastScan])).toEqual([
      ['Polán', { rank: 1, score: 25 }, false],
      ['Dksmus', { rank: -1, score: 0 }, false],
      ['Newbie', undefined, true]
    ]);
    expect(texts(element, '.player-row .rank-change')).toEqual(['▲ 1', '▼ 1']);
  });

  it('ranks one role, renumbering the guild and the overall ranks and hiding the movement', async () => {
    const { page, element } = await open('/mythic-plus/guild/evermoon/Skill%20Issue?role=healer');

    expect(page.rows().map(row => [row.member.name, row.rank, row.overall?.rank, row.score])).toEqual([['Newbie', 1, 2, 120]]);
    expect(page.rows()[0].overall?.queryParams).toEqual({
      view: 'players', period: undefined, dungeon: undefined, role: 'healer', class: undefined, spec: undefined,
      character: 'Newbie-Evermoon', page: undefined
    });
    expect(element.querySelector('.rank-change, .player-new')).toBeNull();
  });

  it('scores members on one spec only, and shares a rank in one dungeon', async () => {
    const spec = await open('/mythic-plus/guild/evermoon/Skill%20Issue?class=6&spec=Unholy');
    expect(spec.page.rows().map(row => [row.member.name, row.score])).toEqual([['Dksmus', 160]]);

    TestBed.resetTestingModule();
    const dungeon = await open('/mythic-plus/guild/evermoon/Skill%20Issue?dungeon=dht');
    expect(dungeon.page.rows().map(row => [row.member.name, row.rank, row.score])).toEqual([
      ['Polán', 1, 150], ['Dksmus', 2, 120], ['Newbie', 2, 120]
    ]);
  });

  it('writes the filters into the address bar', async () => {
    const { page, harness } = await open('/mythic-plus/guild/evermoon/Skill%20Issue');
    const location = TestBed.inject(Location);

    page.showRoles(true);
    harness.detectChanges();
    expect(location.path()).toBe('/mythic-plus/guild/evermoon/Skill%20Issue?role=tank');
    expect(page.rows().map(row => row.member.name)).toEqual(['Dksmus']);

    page.showRoles(false);
    page.setClassFilter(10);
    page.selectDungeon('nl');
    expect(location.path()).toBe('/mythic-plus/guild/evermoon/Skill%20Issue?dungeon=nl&class=10');
  });

  it('finds the guild typed in another case and puts its own name in the address bar', async () => {
    const { page } = await open('/mythic-plus/guild/EVERMOON/skill%20issue?role=dps');

    expect(page.guild()).toEqual({ name: 'Skill Issue', realm: 'Evermoon' });
    expect(TestBed.inject(Location).path()).toBe('/mythic-plus/guild/evermoon/Skill%20Issue?role=dps');
  });

  it('tells the same guild name on two realms apart by the realm in the URL', async () => {
    const { page } = await open('/mythic-plus/guild/tauri/Skill%20Issue');

    expect(page.rows().map(row => [row.member.name, row.rank, row.overall?.rank])).toEqual([['Twin', 1, 4]]);
  });

  it('picks out the member ?character= names and searches by name without renumbering', async () => {
    const { page, harness, element } = await open('/mythic-plus/guild/evermoon/Skill%20Issue?character=newbie-evermoon');

    expect(page.highlightKey()).toBe('Newbie|Evermoon');
    expect(element.querySelector('.player-row.highlighted .member-link')?.textContent).toContain('Newbie');

    const input = element.querySelector<HTMLInputElement>('.player-search input')!;
    input.value = 'dks';
    input.dispatchEvent(new Event('input'));
    harness.detectChanges();
    expect(page.rows().map(row => [row.member.name, row.rank])).toEqual([['Dksmus', 2]]);
  });

  it('says so for a guild without runs this season', async () => {
    const { element } = await open('/mythic-plus/guild/evermoon/Nobody%20Here');

    expect(element.querySelector('.not-found h1')?.textContent).toBe('No Mythic+ runs for Nobody Here this season');
    expect(element.querySelector('.not-found p')?.textContent).toContain('on Evermoon');
    expect(element.querySelector('.not-found a')?.getAttribute('href')).toBe('/mythic-plus?view=players');
    expect(element.querySelector('app-mythic-plus-players-list')).toBeNull();
  });

  it('loads everything again once when the dungeon files come from a newer export', async () => {
    const dataFiles = new FakeDataFiles('bbbbbbbbbbbb');
    const { page } = await open('/mythic-plus/guild/evermoon/Skill%20Issue', dataFiles);

    expect(dataFiles.refreshes).toBe(1);
    expect(page.loadError()).toBeUndefined();
    expect(page.rows()).toHaveLength(3);
  });

  it('reports a mismatch a fresh load does not fix', async () => {
    const dataFiles = new FakeDataFiles('bbbbbbbbbbbb', true);
    const { page } = await open('/mythic-plus/guild/evermoon/Skill%20Issue', dataFiles);

    expect(dataFiles.refreshes).toBe(1);
    expect(page.loadError()).toBe(NEWER_DATA_MESSAGE);
  });
});
