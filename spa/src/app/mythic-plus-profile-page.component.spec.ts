import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MythicPlusDungeonFile,
  MythicPlusIndex,
  MythicPlusRunEntry,
  MythicPlusStandingEntry,
  NEWER_DATA_MESSAGE
} from './mythic-plus';
import { MythicPlusProfilePageComponent } from './mythic-plus-profile-page.component';
import { DataFileService } from './services/data-file.service';

const unix = (iso: string) => Date.parse(iso) / 1000;

const index: MythicPlusIndex = {
  version: 1,
  tables: 'aaaaaaaaaaaa',
  season: { id: 'legion-s1', name: 'Legion Season 1', raid: 'Emerald Nightmare', startDate: '2026-09-16' },
  dungeons: [
    { id: 'nl', challengeId: 206, shortName: 'NL', name: "Neltharion's Lair", timerSeconds: 1980, icon: 'nl.png', runCount: 2, bestScore: 150 },
    { id: 'dht', challengeId: 198, shortName: 'DHT', name: 'Darkheart Thicket', timerSeconds: 1800, icon: 'dht.png', runCount: 2, bestScore: 140 },
    { id: 'cos', challengeId: 210, shortName: 'COS', name: 'Court of Stars', timerSeconds: 1800, icon: 'cos.png', runCount: 0, bestScore: 0 }
  ],
  affixes: [],
  specs: [
    { class: 10, name: 'Windwalker', role: 'dps' },
    { class: 6, name: 'Blood', role: 'tank' },
    { class: 5, name: 'Holy', role: 'healer' },
    { class: 8, name: 'Fire', role: 'dps' },
    { class: 10, name: 'Mistweaver', role: 'healer' }
  ],
  players: [
    ['Progtrix', 'Evermoon', 'The Echoes', 10, 10, 1],
    ['Tank', 'Evermoon', '', 6, 1, 0],
    ['Healer', 'Tauri', '', 5, 1, 0],
    ['Lili', 'Evermoon', '', 8, 1, 1],
    ['LILI', 'Evermoon', '', 8, 1, 1],
    ['Progtrix', 'WoD', '', 10, 10, 1]
  ]
};

const runs: Record<string, MythicPlusRunEntry[]> = {
  nl: [
    [15, 1500000, unix('2026-09-17T18:00:00Z'), 150, [], [[1, 1], [2, 2], [0, 0]]],
    [12, 2100000, unix('2026-09-18T18:00:00Z'), 120, [], [[0, 4], [3, 3]]]
  ],
  dht: [
    [14, 1600000, unix('2026-09-19T18:00:00Z'), 140, [], [[1, 1], [0, 0]]],
    [10, 1500000, unix('2026-09-20T18:00:00Z'), 110, [], [[4, 3], [5, 0]]]
  ],
  cos: []
};

const fileFor = (path: string, tables = index.tables): MythicPlusDungeonFile => {
  const dungeon = path.replace(/^.*\//, '').replace('.json', '');
  return { version: 1, dungeon, tables, runs: runs[dungeon] };
};

class FakeDataFiles {
  refreshes = 0;
  /** Dungeon files carry another export's tables until refresh() when set. */
  constructor(
    private staleTables?: string,
    private readonly staysStale = false,
    private readonly servedIndex = index
  ) {}

  getJson<T>(): Observable<T> {
    return of(this.servedIndex as T);
  }

  fetchJson<T>(path: string): Observable<T> {
    return of(fileFor(path, this.staleTables ?? this.servedIndex.tables) as T);
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
      provideRouter([{ path: 'mythic-plus/character/:realm/:name', component: MythicPlusProfilePageComponent }]),
      { provide: DataFileService, useValue: dataFiles }
    ]
  });
  const harness = await RouterTestingHarness.create();
  const page = await harness.navigateByUrl(url, MythicPlusProfilePageComponent);
  harness.detectChanges();
  return { harness, page, element: harness.routeNativeElement as HTMLElement };
}

describe('MythicPlusProfilePageComponent', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The score and totals count up (CountUpDirective); asking for reduced motion shows them at once.
    vi.stubGlobal('matchMedia', (media: string) => ({
      media,
      matches: media.includes('prefers-reduced-motion: reduce'),
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('shows the character the URL names: score, ranks, bests, teammates and runs', async () => {
    const { page, element } = await open('/mythic-plus/character/evermoon/Progtrix');

    expect(page.player()?.key).toBe('Progtrix|Evermoon');
    expect(element.querySelector('h1')?.textContent).toBe('Progtrix');
    expect(element.querySelector('.profile-crest img')?.getAttribute('src')).toBe('assets/class-crests/10.webp');
    expect(element.querySelector('.profile-score-value')?.textContent).toBe('290.0');
    // All first; their top run was as Windwalker, so it comes before Mistweaver.
    expect([...element.querySelectorAll('.spec-pill')]
      .map(pill => [...pill.querySelectorAll(':scope > span:not(.spec-icon)')].map(span => span.textContent?.trim())))
      .toEqual([['All', '3 runs'], ['Windwalker', '2 runs'], ['Mistweaver', '1 run']]);
    expect([...element.querySelectorAll('.spec-pill')].map(pill => pill.getAttribute('aria-pressed')))
      .toEqual(['true', 'false', 'false']);

    // Tank also has 290; the tie goes by name, as on the players view.
    expect(page.ranks().map(tile => [tile.scope, tile.rank, tile.total])).toEqual([
      ['Overall', 1, 6], ['Realm', 1, 4], ['Class', 1, 2], ['Spec', 1, 2], ['Role', 1, 4]
    ]);
    expect(page.ranks()[1].queryParams).toEqual({ view: 'players', realm: 'evermoon', character: 'Progtrix-Evermoon', page: undefined });

    expect(page.dungeonBests().map(best => best.run?.score)).toEqual([150, 140, undefined]);
    expect(element.textContent).toContain('Not played');
    expect(page.teammates().map(mate => [mate.member.name, mate.runs])).toEqual([['Tank', 2], ['Healer', 1], ['Lili', 1]]);
    expect(page.historyRows().map(row => row.completedAt.slice(0, 10))).toEqual(['2026-09-19', '2026-09-18', '2026-09-17']);
    expect(page.timeline().at(-1)?.score).toBe(290);
  });

  it('shows score gain and overall rank movement from the previous scan', async () => {
    const standings: MythicPlusStandingEntry[] = index.players.map(() => [0, 0]);
    standings[0] = [290, 1, 12.3, 4];
    const changedIndex: MythicPlusIndex = {
      ...index,
      previousGeneratedAt: '2026-10-07T12:00:00Z',
      standings
    };
    const { page, harness, element } = await open(
      '/mythic-plus/character/evermoon/Progtrix',
      new FakeDataFiles(undefined, false, changedIndex)
    );

    expect(page.scanChange()).toEqual({ score: 12.3, rank: 4, isNew: false });
    expect(element.querySelector('.profile-score-value')?.classList).toContain('score-gained');
    expect(element.querySelector('.scan-score-tooltip')?.textContent).toBe('+12.3 score since the last scan');
    expect(element.querySelectorAll('.profile-rank-change')).toHaveLength(1);
    expect(element.querySelector('.profile-rank-change')?.textContent?.trim()).toBe('▲ 4');

    // A spec score never sits next to the overall score's change; the Overall tile keeps its own.
    page.selectSpec('Mistweaver');
    harness.detectChanges();
    expect(element.querySelector('.profile-score-value')?.classList).not.toContain('score-gained');
    expect(element.querySelector('.scan-score-tooltip')).toBeNull();
    expect(element.querySelectorAll('.profile-rank-change')).toHaveLength(1);
  });

  it('shows the profile in one spec when its pill is clicked, and in every spec again', async () => {
    const { page, harness, element } = await open('/mythic-plus/character/evermoon/Progtrix');
    const location = TestBed.inject(Location);
    const pills = () => [...element.querySelectorAll<HTMLButtonElement>('button.spec-pill')];
    const click = (pill: number) => {
      pills()[pill].click();
      harness.detectChanges();
    };

    click(2);
    expect(page.selectedSpec()).toBe('Mistweaver');
    expect(location.path()).toBe('/mythic-plus/character/evermoon/Progtrix?spec=Mistweaver');
    expect(pills().map(pill => pill.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
    expect(element.querySelector('.profile-score-value')?.textContent).toBe('120.0');
    expect(element.querySelector('.profile-score-label')?.textContent?.trim()).toMatch(/^Mistweaver score/);
    expect(page.summary().map(item => item.value)).toEqual(['1', '0%', '-']);
    // Overall, Realm and Class stay the character's; the Spec tile ranks them among Mistweavers.
    expect(page.ranks().map(tile => [tile.scope, tile.label, tile.rank, tile.total])).toEqual([
      ['Overall', 'All realms', 1, 6], ['Realm', 'Evermoon', 1, 4], ['Class', 'Monk', 1, 2], ['Spec', 'Mistweaver Monk', 1, 1], ['Role', 'Healer', 2, 2]
    ]);
    expect(page.ranks()[3].queryParams).toEqual({
      view: 'players', class: 10, spec: 'Mistweaver', character: 'Progtrix-Evermoon', page: undefined
    });
    expect(page.dungeonBests().map(best => best.run?.score)).toEqual([120, undefined, undefined]);
    expect(element.textContent).toContain('Not played as Mistweaver');
    expect(page.teammates().map(mate => mate.member.name)).toEqual(['Lili']);
    expect(page.historyRows().map(row => row.completedAt.slice(0, 10))).toEqual(['2026-09-18']);
    expect(element.querySelector('.history-header p')?.textContent).toContain('1 as Mistweaver this season');
    expect(page.timeline().at(-1)?.score).toBe(120);

    // The pressed pill again shows every spec; so does All.
    click(2);
    expect(page.selectedSpec()).toBeUndefined();
    expect(location.path()).toBe('/mythic-plus/character/evermoon/Progtrix');
    expect(element.querySelector('.profile-score-value')?.textContent).toBe('290.0');
    expect(page.historyRows()).toHaveLength(3);

    click(1);
    expect(page.selectedSpec()).toBe('Windwalker');
    expect(page.ranks()[3]).toMatchObject({ label: 'Windwalker Monk', rank: 1, total: 2 });
    click(0);
    expect(page.selectedSpec()).toBeUndefined();
    expect(pills().map(pill => pill.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
  });

  it('opens in the spec ?spec= names and keeps it when fixing the name in the address bar', async () => {
    const { page, element } = await open('/mythic-plus/character/evermoon/progtrix?spec=Mistweaver');

    expect(page.selectedSpec()).toBe('Mistweaver');
    expect(element.querySelector('.profile-score-value')?.textContent).toBe('120.0');
    expect(TestBed.inject(Location).path()).toBe('/mythic-plus/character/evermoon/Progtrix?spec=Mistweaver');
  });

  it('ignores a ?spec= the character has not played', async () => {
    const { page } = await open('/mythic-plus/character/evermoon/Progtrix?spec=Blood');

    expect(page.selectedSpec()).toBeUndefined();
    expect(page.shownScore()?.score).toBe(290);
  });

  it('keeps the pill of a character with one spec static', async () => {
    const { page, element } = await open('/mythic-plus/character/evermoon/Tank?spec=Blood');

    expect(element.querySelector('button.spec-pill')).toBeNull();
    expect([...element.querySelectorAll('.spec-pill')]
      .map(pill => [...pill.querySelectorAll(':scope > span:not(.spec-icon)')].map(span => span.textContent?.trim())))
      .toEqual([['Blood', '2 runs']]);
    expect(page.selectedSpec()).toBeUndefined();
  });

  it('opens another character in all their specs', async () => {
    const { harness, page } = await open('/mythic-plus/character/evermoon/Progtrix');
    page.selectSpec('Mistweaver');

    await harness.navigateByUrl('/mythic-plus/character/evermoon/Lili', MythicPlusProfilePageComponent);
    expect(page.selectedSpec()).toBeUndefined();

    await harness.navigateByUrl('/mythic-plus/character/evermoon/Progtrix', MythicPlusProfilePageComponent);
    expect(page.selectedSpec()).toBeUndefined();
  });

  it('finds a name typed in another case and puts the real one in the address bar', async () => {
    const { page } = await open('/mythic-plus/character/Evermoon/progtrix');

    expect(page.player()?.key).toBe('Progtrix|Evermoon');
    expect(TestBed.inject(Location).path()).toBe('/mythic-plus/character/evermoon/Progtrix');
  });

  it('tells the same name on two realms apart by the realm in the URL', async () => {
    const { page } = await open('/mythic-plus/character/wod/Progtrix');
    expect(page.player()?.key).toBe('Progtrix|WoD');
  });

  it('lists every character a case-insensitive name matches', async () => {
    const { page, element } = await open('/mythic-plus/character/evermoon/lili');

    expect(page.player()).toBeUndefined();
    expect(element.querySelector('.not-found h1')?.textContent).toBe('Which lili?');
    expect([...element.querySelectorAll('.result-name')].map(name => name.textContent)).toEqual(['Lili', 'LILI']);
  });

  it('shows a friendly page with a search for a character without runs', async () => {
    const { page, harness, element } = await open('/mythic-plus/character/tauri/Progtrix');

    expect(element.querySelector('.not-found h1')?.textContent).toBe('No Mythic+ runs this season');
    expect(element.querySelector('.not-found p')?.textContent).toContain('on Tauri');
    // The search starts from the name in the URL and finds it on the other realms.
    expect([...element.querySelectorAll('.character-results a')].map(link => link.getAttribute('href'))).toEqual([
      '/mythic-plus/character/evermoon/Progtrix',
      '/mythic-plus/character/wod/Progtrix'
    ]);

    page.searchQuery.set('heal');
    harness.detectChanges();
    expect([...element.querySelectorAll('.result-name')].map(name => name.textContent)).toEqual(['Healer']);
  });

  it('follows a teammate link on the same page', async () => {
    const { harness, page } = await open('/mythic-plus/character/evermoon/Progtrix');
    page.toggleRun(page.historyRows()[0].id);

    const next = await harness.navigateByUrl('/mythic-plus/character/tauri/Healer', MythicPlusProfilePageComponent);

    expect(next).toBe(page);
    expect(page.player()?.key).toBe('Healer|Tauri');
    expect(page.expandedRunId()).toBeUndefined();
  });

  it('loads everything again once when the dungeon files come from a newer export', async () => {
    const dataFiles = new FakeDataFiles('bbbbbbbbbbbb');
    const { page } = await open('/mythic-plus/character/evermoon/Progtrix', dataFiles);

    expect(dataFiles.refreshes).toBe(1);
    expect(page.loadError()).toBeUndefined();
    expect(page.player()?.key).toBe('Progtrix|Evermoon');
  });

  it('reports a mismatch a fresh load does not fix', async () => {
    const dataFiles = new FakeDataFiles('bbbbbbbbbbbb', true);
    const { page } = await open('/mythic-plus/character/evermoon/Progtrix', dataFiles);

    expect(dataFiles.refreshes).toBe(2);
    expect(page.loadError()).toBe(NEWER_DATA_MESSAGE);
  });
});
