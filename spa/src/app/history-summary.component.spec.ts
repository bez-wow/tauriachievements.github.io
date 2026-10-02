import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilterDropdownCoordinatorService } from './filter-dropdown-coordinator.service';
import { HistorySummaryComponent, MOBILE_MOVER_PREVIEW_SIZE } from './history-summary.component';
import { LadderHistoryMoverView } from './ladder-history.types';

function createMovers(count: number): LadderHistoryMoverView[] {
  return Array.from({ length: count }, (_, index) => ({
    playerKey: `Tauri::Player${index}`,
    name: `Player${index}`,
    realm: 'Tauri',
    guild: '',
    race: 1,
    gender: 0,
    classId: 1,
    rankDelta: 0,
    previousRank: index + 2,
    currentRank: index + 1,
    achievementPointsDelta: 100 - index,
    honorableKillsDelta: 0,
    previousAchievementPoints: 1000,
    currentAchievementPoints: 1100 - index,
    previousHonorableKills: 0,
    currentHonorableKills: 0,
    appearanceCountDelta: 0,
    previousAppearanceCount: 0,
    currentAppearanceCount: 0,
    playedTimeDelta: 0,
    previousPlayedTime: 0,
    currentPlayedTime: 0
  }));
}

function stubScreen(isPhone: boolean): void {
  vi.stubGlobal('matchMedia', () => ({ matches: isPhone, addEventListener: () => {}, removeEventListener: () => {} }));
}

async function render(achievementMovers: LadderHistoryMoverView[], honorableKillMovers: LadderHistoryMoverView[] = []) {
  await TestBed.configureTestingModule({
    imports: [HistorySummaryComponent],
    providers: [FilterDropdownCoordinatorService]
  }).compileComponents();
  const fixture = TestBed.createComponent(HistorySummaryComponent);
  fixture.componentRef.setInput('achievementMovers', achievementMovers);
  fixture.componentRef.setInput('honorableKillMovers', honorableKillMovers);
  fixture.detectChanges();
  return fixture;
}

const rowsPerList = (element: HTMLElement) =>
  [...element.querySelectorAll('.history-panel')].map((panel) => panel.querySelectorAll('tbody tr').length);

describe('HistorySummaryComponent on phones', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the top of each list and opens each list on its own', async () => {
    stubScreen(true);
    const fixture = await render(createMovers(100), createMovers(40));
    const element: HTMLElement = fixture.nativeElement;

    expect(rowsPerList(element).slice(0, 2)).toEqual([MOBILE_MOVER_PREVIEW_SIZE, MOBILE_MOVER_PREVIEW_SIZE]);
    const toggle = element.querySelector<HTMLButtonElement>('.list-toggle')!;
    expect(toggle.textContent?.trim()).toBe('Show all 100');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    fixture.detectChanges();
    expect(rowsPerList(element).slice(0, 2)).toEqual([100, MOBILE_MOVER_PREVIEW_SIZE]);
    expect(toggle.textContent?.trim()).toBe(`Show top ${MOBILE_MOVER_PREVIEW_SIZE}`);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    toggle.click();
    fixture.detectChanges();
    expect(rowsPerList(element).slice(0, 2)).toEqual([MOBILE_MOVER_PREVIEW_SIZE, MOBILE_MOVER_PREVIEW_SIZE]);
  });

  it('has no toggle for a list that already fits', async () => {
    stubScreen(true);
    const fixture = await render(createMovers(MOBILE_MOVER_PREVIEW_SIZE));

    expect(rowsPerList(fixture.nativeElement)[0]).toBe(MOBILE_MOVER_PREVIEW_SIZE);
    expect(fixture.nativeElement.querySelector('.list-toggle')).toBeNull();
  });

  it('shows whole lists on wider screens', async () => {
    stubScreen(false);
    const fixture = await render(createMovers(100));

    expect(rowsPerList(fixture.nativeElement)[0]).toBe(100);
    expect(fixture.nativeElement.querySelector('.list-toggle')).toBeNull();
  });
});
