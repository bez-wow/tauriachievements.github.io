import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { RaidBossFile, RaidLogsIndexFile, RaidMemberEntry } from './raid-logs.types';
import { RaidLogsLeaderboardPageComponent } from './raid-logs-leaderboard-page.component';
import { DataFileService } from '../../core/data-file.service';

const indexFile: RaidLogsIndexFile = {
  version: 2,
  generatedAt: '2026-10-22T22:00:00Z',
  previousGeneratedAt: '2026-10-21T22:00:00Z',
  raid: { id: 1520, slug: 'emerald-nightmare', name: 'The Emerald Nightmare' },
  difficulties: [{ id: 16, slug: 'mythic', name: 'Mythic', shortName: 'M', kills: 2 }],
  bosses: [
    { id: 1853, slug: 'nythendra', name: 'Nythendra' },
    { id: 1873, slug: 'ilgynoth', name: "Il'gynoth, The Heart of Corruption" }
  ],
  specs: [
    { id: 63, class: 8, name: 'Fire', role: 'dps' },
    { id: 64, class: 8, name: 'Frost', role: 'dps' }
  ],
  guilds: [['Miracle', 'Evermoon', 1, 3676]],
  logs: [
    ['Tauri', 10, 0, 16, 1_000, 100_000, 0, 1, 0, 0, 20],
    ['Tauri', 11, 0, 16, 2_000, 100_000, 0, 1, 0, 0, 20]
  ],
  newLogs: [['Tauri', 11]],
  top: [],
  items: []
};

function member(player: number, spec: number, damage: number): RaidMemberEntry {
  return [player, spec, 870, damage, 0, 0, 0, 0, 0, 0];
}

const nythendraFile: RaidBossFile = {
  version: 1,
  boss: 'nythendra',
  difficulty: 'mythic',
  guilds: [['Miracle', 'Evermoon', 1, 3676]],
  players: [
    ['Alpha', 'Evermoon', 8, 10, 0, 'Miracle'],
    ['Beta', 'Evermoon', 8, 10, 0, 'Miracle'],
    ['Gamma', 'Evermoon', 8, 10, 0, 'Miracle']
  ],
  logs: [
    ['Tauri', 10, 1_000, 100_000, 0, 1, 0, 0, 0, [member(0, 64, 100_000_000), member(1, 63, 200_000_000)], []],
    ['Tauri', 11, 2_000, 100_000, 0, 1, 0, 0, 0, [member(0, 64, 300_000_000), member(2, 64, 150_000_000)], []]
  ]
};

const ilgynothFile: RaidBossFile = { version: 1, boss: 'ilgynoth', difficulty: 'mythic', guilds: [], players: [], logs: [] };

class FakeDataFiles {
  constructor(private readonly files: Readonly<Record<string, unknown>>) {}

  fetchJson<T>(path: string): Observable<T> {
    return of(this.files[path] as T);
  }

  refresh(): void {}
}

async function open(index: RaidLogsIndexFile) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'raid-logs/leaderboard', component: RaidLogsLeaderboardPageComponent }]),
      provideLocationMocks(),
      {
        provide: DataFileService,
        useValue: new FakeDataFiles({
          'raid-log-data/index.json': index,
          'raid-log-data/nythendra-mythic.json': nythendraFile,
          'raid-log-data/ilgynoth-mythic.json': ilgynothFile,
          'assets/data/raid-genders.json': { v: 1, female: {} }
        })
      }
    ]
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/raid-logs/leaderboard?difficulty=mythic', RaidLogsLeaderboardPageComponent);
  harness.detectChanges();
  return harness.routeNativeElement as HTMLElement;
}

function rows(element: HTMLElement) {
  return [...element.querySelectorAll('tbody tr')].map(row => {
    const rankMove = row.querySelector('td.rank .rank-move');
    const scoreChange = row.querySelector('td.score .score-change');
    return [
      row.querySelector('.character-name')?.textContent,
      rankMove?.querySelector('[aria-hidden="true"]')?.textContent ?? '',
      rankMove?.classList.contains('up') ?? false,
      row.querySelector('td.rank .rank-new')?.textContent ?? '',
      (row.querySelector('.score-value') ?? row.querySelector('td.score'))?.textContent?.trim(),
      scoreChange?.querySelector('[aria-hidden="true"]')?.textContent ?? '',
      scoreChange?.classList.contains('up') ?? false
    ];
  });
}

describe('RaidLogsLeaderboardPageComponent changes since the last scan', () => {
  it('puts the rank change beside the rank and the score change beside the score, green only for gains', async () => {
    const element = await open(indexFile);

    expect(element.querySelector('table')?.classList.contains('with-changes')).toBe(true);
    expect(rows(element)).toEqual([
      ['Alpha', '▲1', true, '', '6969', '+3485', true],
      ['Beta', '▼1', false, '', '4646', '−2323', false],
      ['Gamma', '', false, 'new', '3484', '', false]
    ]);
    expect(element.querySelector('.rank-move')?.getAttribute('title')).toBe('Climbed 1 rank since the last scan');
    expect(element.querySelector('.rank-move .visually-hidden')?.textContent).toBe(', Climbed 1 rank since the last scan');
    expect(element.querySelector('.score-change .visually-hidden')?.textContent).toBe(', +3485 score since the last scan');
  });

  it('shows plain ranks and scores when there is no earlier scan to compare with', async () => {
    const element = await open({ ...indexFile, newLogs: undefined });

    expect(element.querySelector('table')?.classList.contains('with-changes')).toBe(false);
    expect(rows(element)).toEqual([
      ['Alpha', '', false, '', '6969', '', false],
      ['Beta', '', false, '', '4646', '', false],
      ['Gamma', '', false, '', '3484', '', false]
    ]);
  });
});
