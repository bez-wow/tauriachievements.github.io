import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, filter, firstValueFrom, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RaidBossFile, RaidBossLogEntry, RaidLogsIndexFile, RaidMemberEntry } from './raid-logs';
import { RaidLogsCharacterPageComponent } from './raid-logs-character-page.component';
import { DataFileService } from './services/data-file.service';

// Three bosses on Mythic, one on Heroic. Every fight lasts 100 s, so damage / 100 is the DPS.
const indexFile: RaidLogsIndexFile = {
  version: 1,
  generatedAt: '2026-10-17T16:00:00Z',
  raid: { id: 1520, slug: 'emerald-nightmare', name: 'The Emerald Nightmare' },
  difficulties: [
    { id: 15, slug: 'heroic', name: 'Heroic', shortName: 'HC', kills: 1 },
    { id: 16, slug: 'mythic', name: 'Mythic', shortName: 'M', kills: 4 }
  ],
  bosses: [
    { id: 1853, slug: 'nythendra', name: 'Nythendra' },
    { id: 1873, slug: 'ilgynoth', name: "Il'gynoth, The Heart of Corruption" },
    { id: 1876, slug: 'elerethe-renferal', name: 'Elerethe Renferal' }
  ],
  specs: [
    { id: 63, class: 8, name: 'Fire', role: 'dps' },
    { id: 64, class: 8, name: 'Frost', role: 'dps' },
    { id: 65, class: 2, name: 'Holy', role: 'healer' },
    { id: 66, class: 2, name: 'Protection', role: 'tank' },
    { id: 70, class: 2, name: 'Retribution', role: 'dps' }
  ],
  guilds: [['Miracle', 'Evermoon', 1, 3676]],
  logs: [
    ['Tauri', 10, 0, 16, 1_000, 100_000, 0, 1, 0, 0, 20],
    ['Tauri', 11, 0, 16, 2_000, 100_000, 0, 1, 0, 0, 20],
    ['Tauri', 12, 1, 16, 3_000, 100_000, 0, 1, 0, 0, 20],
    ['Tauri', 13, 2, 16, 4_000, 100_000, 0, 1, 0, 0, 20],
    ['Tauri', 20, 0, 15, 500, 100_000, 0, 1, 0, 0, 20]
  ],
  top: [],
  items: []
};

const [FROSTY, KAEL, RET, LIGHT, TANK] = [0, 1, 2, 3, 4];

const member = (player: number, spec: number, dps: number, hps = 0): RaidMemberEntry =>
  [player, spec, 870, dps * 100, hps * 100, 0, 0, 0, 0, 0];

const log = (logId: number, killedAt: number, members: RaidMemberEntry[]): RaidBossLogEntry =>
  ['Tauri', logId, killedAt, 100_000, 0, 1, 0, 0, 0, members, []];

const bossFile = (boss: string, difficulty: string, logs: RaidBossLogEntry[]): RaidBossFile => ({
  version: 1,
  boss,
  difficulty,
  guilds: [['Miracle', 'Evermoon', 1, 3676]],
  players: [
    ['Frosty', 'Evermoon', 8, 10, 0, 'Miracle'],
    ['Kael', 'Tauri', 8, 1, 0, ''],
    ['Ret', 'Tauri', 2, 1, 0, ''],
    ['Light', 'Evermoon', 2, 10, 1, 'Miracle'],
    ['Tank', 'Tauri', 2, 1, 0, '']
  ],
  logs
});

// Frosty, a Frost mage: second of four on Nythendra but the best mage, third of three on
// Il'gynoth and second of two mages, and no Elerethe kill.
const bossFiles: Record<string, RaidBossFile> = Object.fromEntries([
  bossFile('nythendra', 'mythic', [
    log(10, 1_000, [member(RET, 70, 1_000), member(FROSTY, 64, 800), member(KAEL, 63, 600), member(LIGHT, 65, 0, 500)]),
    log(11, 2_000, [member(KAEL, 63, 700), member(FROSTY, 64, 750), member(TANK, 66, 300)])
  ]),
  bossFile('ilgynoth', 'mythic', [log(12, 3_000, [member(KAEL, 63, 900), member(RET, 70, 1_200), member(FROSTY, 64, 450)])]),
  bossFile('elerethe-renferal', 'mythic', [log(13, 4_000, [member(KAEL, 63, 500)])]),
  bossFile('nythendra', 'heroic', [log(20, 500, [member(FROSTY, 64, 400), member(KAEL, 63, 500), member(RET, 70, 300)])])
].map(file => [`raid-log-data/${file.boss}-${file.difficulty}.json`, file]));

class FakeDataFiles {
  fetchJson<T>(path: string): Observable<T> {
    if (path === 'raid-log-data/index.json') {
      return of(indexFile as T);
    }
    const file = bossFiles[path];
    return file ? of(file as T) : throwError(() => new Error(`No ${path}`));
  }

  refresh(): void {}
}

@Component({ standalone: true, template: '' })
class ElsewhereComponent {}

async function open(url: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'raid-logs/character/:realm/:name', component: RaidLogsCharacterPageComponent },
        { path: 'raid-logs/leaderboard', component: ElsewhereComponent }
      ]),
      // A history the Back button can be pressed in.
      provideLocationMocks(),
      { provide: DataFileService, useValue: new FakeDataFiles() }
    ]
  });
  const harness = await RouterTestingHarness.create();
  const page = await harness.navigateByUrl(url, RaidLogsCharacterPageComponent);
  harness.detectChanges();
  return { harness, page, element: harness.routeNativeElement as HTMLElement, location: TestBed.inject(Location) };
}

/** Each boss row as [boss, of best, rank, out of]. */
function rows(page: RaidLogsCharacterPageComponent) {
  return page.bossRows().map(row => [row.boss.shortName, row.relative, row.rank, row.ranked]);
}

/** The Bosses table as shown: boss, of best and rank cells. */
function cells(element: HTMLElement) {
  return [...element.querySelectorAll('section[aria-labelledby="character-bosses-title"] tbody tr')]
    .map(row => [...row.querySelectorAll('td')].slice(0, 4).map(cell => cell.textContent?.replace(/\s+/g, ' ').trim()))
    .map(([boss, , relative, rank]) => [boss, relative, rank]);
}

function comparisonButtons(element: HTMLElement) {
  return [...element.querySelectorAll<HTMLButtonElement>('.comparison-switch button')];
}

function summaryTile(element: HTMLElement, label: string) {
  const tile = [...element.querySelectorAll('.summary > div')].find(div => div.querySelector('dt')?.textContent === label);
  return {
    value: tile?.querySelector('dd')?.firstChild?.textContent,
    note: tile?.querySelector('.summary-note')?.textContent
  };
}

describe('RaidLogsCharacterPageComponent comparison', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('matchMedia', (media: string) => ({
      media,
      matches: media.includes('prefers-reduced-motion: reduce'),
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('compares with all players by default, as the score does', async () => {
    const { page, element } = await open('/raid-logs/character/evermoon/Frosty');

    expect(page.comparison()).toBe('all');
    expect(comparisonButtons(element).map(button => [button.textContent?.trim(), button.getAttribute('aria-pressed')]))
      .toEqual([['All players', 'true'], ['Same class', 'false']]);
    expect(rows(page)).toEqual([
      ['Nythendra', .8, 2, 4],
      ["Il'gynoth", .375, 3, 3],
      ['Elerethe', 0, undefined, 0]
    ]);
    // The same shares the score averages.
    expect(page.bossRows().map(row => row.relative)).toEqual(page.score()?.bosses.map(entry => entry.relative));
    expect(cells(element)).toEqual([['Nythendra', '80%', '#2 / 4'], ["Il'gynoth", '37%', '#3 / 3'], ['Elerethe', '', '']]);

    // (.8 + .375 + 0) / 3 of 6969; Kael and Ret score higher.
    expect(summaryTile(element, 'DPS score')).toEqual({ value: '2729', note: '#3 of 4 on the leaderboard' });
    expect(summaryTile(element, 'Best damage rank')).toEqual({ value: '#2', note: 'Nythendra, of 4' });
    expect(element.querySelector('th[title]')?.getAttribute('title')).toBe('The best kill against the best anyone did on the boss');
    expect(element.querySelector('.list-note')?.textContent).toContain("Rank among every character's best kill of the boss");
  });

  it('compares with the same class when picked, keeping the all-player score', async () => {
    const { page, harness, element, location } = await open('/raid-logs/character/evermoon/Frosty');

    comparisonButtons(element)[1].click();
    harness.detectChanges();

    expect(page.comparison()).toBe('class');
    expect(location.path()).toBe('/raid-logs/character/evermoon/Frosty?compare=class');
    expect(comparisonButtons(element).map(button => button.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    // Among the two mages: first on Nythendra, second (at half Kael's) on Il'gynoth; Elerethe stays empty.
    expect(rows(page)).toEqual([
      ['Nythendra', 1, 1, 2],
      ["Il'gynoth", .5, 2, 2],
      ['Elerethe', 0, undefined, 0]
    ]);
    expect(cells(element)).toEqual([['Nythendra', '100%', '#1 / 2'], ["Il'gynoth", '50%', '#2 / 2'], ['Elerethe', '', '']]);

    expect(summaryTile(element, 'DPS score')).toEqual({ value: '2729', note: '#3 of 4 among all players' });
    expect(summaryTile(element, 'Best damage rank')).toEqual({ value: '#1', note: 'Nythendra, of 2 Mages' });
    expect([...element.querySelectorAll('th[title]')].map(th => th.getAttribute('title'))).toEqual([
      'The best kill against the best any Mage did on the boss',
      "Among every Mage's best kill of the boss"
    ]);
    const note = element.querySelector('.list-note')?.textContent?.replace(/\s+/g, ' ');
    expect(note).toContain('"Of best" and Rank compare with Mages only');
    expect(note).toContain('The DPS score above still compares each boss with the best of all players');
    // The boss pages open on the same ranking: the class only.
    expect(element.querySelector('a.boss-cell')?.getAttribute('href')).toBe('/raid-logs/boss/nythendra?difficulty=mythic&tab=dps&class=8');

    comparisonButtons(element)[0].click();
    harness.detectChanges();
    expect(page.comparison()).toBe('all');
    expect(location.path()).toBe('/raid-logs/character/evermoon/Frosty');
    expect(rows(page)[0]).toEqual(['Nythendra', .8, 2, 4]);
  });

  it('opens on ?compare=class and keeps it through difficulty and Damage/Healing changes', async () => {
    const { page, harness, element, location } = await open('/raid-logs/character/evermoon/Frosty?compare=class');

    expect(page.comparison()).toBe('class');
    expect(rows(page)[0]).toEqual(['Nythendra', 1, 1, 2]);

    page.setDifficulty('heroic');
    harness.detectChanges();
    expect(location.path()).toBe('/raid-logs/character/evermoon/Frosty?difficulty=heroic&compare=class');
    // Kael's 500 beats Frosty's 400; the paladin's 300 doesn't count among mages.
    expect(rows(page)[0]).toEqual(['Nythendra', .8, 2, 2]);

    [...element.querySelectorAll<HTMLButtonElement>('[role="tab"]')][1].click();
    harness.detectChanges();
    expect(location.path()).toBe('/raid-logs/character/evermoon/Frosty?difficulty=heroic&metric=hps&compare=class');
    expect(page.comparison()).toBe('class');
    // A mage heals nothing the Healing ranking counts.
    expect(rows(page)[0]).toEqual(['Nythendra', 0, undefined, 0]);
  });

  it('comes back to the same class from another page', async () => {
    const { harness, element, location } = await open('/raid-logs/character/evermoon/Frosty');
    comparisonButtons(element)[1].click();
    harness.detectChanges();

    await harness.navigateByUrl('/raid-logs/leaderboard', ElsewhereComponent);
    // The app's first navigation starts the router listening for Back; a test bed never makes one.
    const router = TestBed.inject(Router);
    router.setUpLocationChangeListener();
    const navigated = firstValueFrom(router.events.pipe(filter(event => event instanceof NavigationEnd)));
    location.back();
    await navigated;
    harness.detectChanges();

    const page = harness.routeDebugElement?.componentInstance as RaidLogsCharacterPageComponent;
    expect(page).toBeInstanceOf(RaidLogsCharacterPageComponent);
    expect(location.path()).toBe('/raid-logs/character/evermoon/Frosty?compare=class');
    expect(page.comparison()).toBe('class');
    expect(rows(page)[0]).toEqual(['Nythendra', 1, 1, 2]);
  });

  it('compares with all players for a ?compare= it does not know', async () => {
    const { page } = await open('/raid-logs/character/evermoon/Frosty?compare=guild');

    expect(page.comparison()).toBe('all');
    expect(rows(page)[1]).toEqual(["Il'gynoth", .375, 3, 3]);
  });
});
