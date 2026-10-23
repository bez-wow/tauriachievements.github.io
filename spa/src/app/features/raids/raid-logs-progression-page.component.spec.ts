import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { RaidLogsIndexFile } from './raid-logs.types';
import { RaidLogsProgressionPageComponent } from './raid-logs-progression-page.component';
import { DataFileService } from '../../core/data-file.service';

const indexFile: RaidLogsIndexFile = {
  version: 2,
  generatedAt: '2026-10-22T22:00:00Z',
  previousGeneratedAt: '2026-10-21T22:00:00Z',
  raid: { id: 1520, slug: 'emerald-nightmare', name: 'The Emerald Nightmare' },
  difficulties: [{ id: 16, slug: 'mythic', name: 'Mythic', shortName: 'M', kills: 6 }],
  bosses: [
    { id: 1853, slug: 'nythendra', name: 'Nythendra' },
    { id: 1873, slug: 'ilgynoth', name: "Il'gynoth, The Heart of Corruption" },
    { id: 1876, slug: 'elerethe-renferal', name: 'Elerethe Renferal' }
  ],
  specs: [],
  guilds: [['Miracle', 'Evermoon', 1, 1], ['Outlaws', 'Tauri', 0, 2], ['Newcomers', 'Evermoon', 1, 3]],
  logs: [
    ['Tauri', 10, 0, 16, 1_000, 100_000, 0, 1, 0, 0, 20],
    ['Tauri', 11, 0, 16, 2_000, 100_000, 1, 0, 0, 0, 20],
    ['Tauri', 12, 1, 16, 3_000, 100_000, 0, 1, 0, 0, 20],
    ['Tauri', 13, 2, 16, 4_000, 100_000, 0, 1, 0, 0, 20],
    ['Tauri', 14, 0, 16, 5_000, 100_000, 1, 0, 0, 0, 20],
    ['Tauri', 15, 0, 16, 6_000, 100_000, 2, 1, 0, 0, 20]
  ],
  newLogs: [['Tauri', 12], ['Tauri', 13], ['Tauri', 14], ['Tauri', 15]],
  top: [],
  items: []
};

class FakeDataFiles {
  constructor(private readonly file: RaidLogsIndexFile) {}

  fetchJson<T>(): Observable<T> {
    return of(this.file as T);
  }

  refresh(): void {}
}

async function open(file: RaidLogsIndexFile) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'raid-logs/guilds', component: RaidLogsProgressionPageComponent }]),
      provideLocationMocks(),
      { provide: DataFileService, useValue: new FakeDataFiles(file) }
    ]
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/raid-logs/guilds', RaidLogsProgressionPageComponent);
  harness.detectChanges();
  return harness.routeNativeElement as HTMLElement;
}

function rows(element: HTMLElement) {
  return [...element.querySelectorAll('tbody tr')].map(row => [
    row.querySelector('.guild-name .strong')?.textContent,
    row.querySelector('.progress-count')?.textContent,
    row.querySelector('.guild-new')?.textContent ?? '',
    row.querySelector('.progress-gain [aria-hidden="true"]')?.textContent ?? '',
    row.querySelectorAll('.pip.fresh').length
  ]);
}

describe('RaidLogsProgressionPageComponent changes since the last scan', () => {
  it('tags a guild new to the difficulty and counts the bosses another guild killed', async () => {
    const element = await open(indexFile);

    expect(rows(element)).toEqual([
      ['Miracle', '3/3', '', '+2', 2],
      ['Outlaws', '1/3', '', '', 0],
      ['Newcomers', '1/3', 'new', '', 1]
    ]);
    expect(element.querySelector('.progress-gain')?.getAttribute('title'))
      .toMatch(/^Killed Elerethe and Il'gynoth since the scan of 2[12] Oct, \d\d:\d\d$/);
    expect(element.querySelector('.guild-new')?.getAttribute('title')).toMatch(/^New on Mythic since the scan of 2[12] Oct, \d\d:\d\d$/);
  });

  it('shows no change when the index has no previous scan', async () => {
    const element = await open({ ...indexFile, previousGeneratedAt: undefined, newLogs: undefined });

    expect(rows(element).map(([guild, , isNew, gain, fresh]) => [guild, isNew, gain, fresh])).toEqual([
      ['Miracle', '', '', 0],
      ['Outlaws', '', '', 0],
      ['Newcomers', '', '', 0]
    ]);
  });
});
