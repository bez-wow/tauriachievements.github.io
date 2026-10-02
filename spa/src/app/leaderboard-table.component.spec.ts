import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeaderboardTableComponent } from './leaderboard-table.component';
import { LadderPlayerView } from './ladder.types';

function createPlayer(overrides: Partial<LadderPlayerView> = {}): LadderPlayerView {
  return {
    name: 'Larahh',
    race: 4,
    gender: 1,
    class: 11,
    realm: 'Tauri',
    guild: 'Outlaws',
    faction: 'Alliance',
    achievementPoints: 20905,
    honorableKills: 230025,
    appearanceCount: 4468,
    achievementsTotal: 25060,
    playedTime: 814779,
    ilvl: 873.5,
    level10Day: 0,
    isNewCharacter: false,
    achievementPointsDelta: 20,
    achievementRankDelta: 1,
    honorableKillsDelta: 0,
    honorableKillsRankDelta: 0,
    appearanceCountDelta: -3,
    appearanceRankDelta: 0,
    achievementsTotalDelta: 70,
    achievementsTotalRankDelta: 0,
    playedTimeDelta: 110,
    playedTimeRankDelta: 0,
    rank: 1,
    raceIcon: '',
    classIcon: '11',
    nameParts: [{ text: 'Larahh', isMatch: false }],
    guildParts: [{ text: 'Outlaws', isMatch: false }],
    gladiatorTitleCount: 0,
    gladiatorMountCount: 0,
    ratedBattlegroundHeroCount: 0,
    realmFirstCount: 0,
    isNewRareAchievementCharacter: false,
    ...overrides
  };
}

function setCompactScreen(matches: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query }));
}

async function render(players: LadderPlayerView[]) {
  await TestBed.configureTestingModule({ imports: [LeaderboardTableComponent] }).compileComponents();
  const fixture = TestBed.createComponent(LeaderboardTableComponent);
  fixture.componentRef.setInput('players', players);
  fixture.detectChanges();
  return fixture;
}

describe('LeaderboardTableComponent row details', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens one row at a time and closes it again from its toggle', async () => {
    const fixture = await render([createPlayer(), createPlayer({ name: 'Spuky', rank: 2 })]);
    const element: HTMLElement = fixture.nativeElement;
    const toggles = () => element.querySelectorAll<HTMLButtonElement>('.row-toggle');

    toggles()[0].click();
    fixture.detectChanges();
    expect(element.querySelectorAll('.player-details-row').length).toBe(1);
    expect(toggles()[0].getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector(`#${toggles()[0].getAttribute('aria-controls')}`)).not.toBeNull();

    toggles()[1].click();
    fixture.detectChanges();
    expect(element.querySelectorAll('.player-details-row').length).toBe(1);
    expect(toggles()[0].getAttribute('aria-expanded')).toBe('false');
    expect(toggles()[1].getAttribute('aria-expanded')).toBe('true');

    toggles()[1].click();
    fixture.detectChanges();
    expect(element.querySelector('.player-details-row')).toBeNull();
  });

  it('lists the realm, guild and every metric in the details panel', async () => {
    const fixture = await render([createPlayer()]);
    fixture.nativeElement.querySelector('.row-toggle').click();
    fixture.detectChanges();

    const labels = [...fixture.nativeElement.querySelectorAll('.player-details dt')].map((dt: Element) => dt.textContent?.trim());
    expect(labels).toEqual([
      'Realm',
      'Guild',
      'Character achievements',
      'Account wide achievements',
      'Honorable kills',
      'Time played',
      'Item level',
      'Appearances'
    ]);
    expect(fixture.nativeElement.querySelector('.player-details a.guild-name')?.textContent?.trim()).toBe('Outlaws');
  });

  it('shows a change only for metrics that moved', () => {
    const component = new LeaderboardTableComponent();
    const metrics = component.getDetailMetrics(createPlayer());
    const byLabel = new Map(metrics.map((metric) => [metric.label, metric]));

    expect(byLabel.get('Character achievements')).toMatchObject({ delta: '+20', deltaClass: 'positive' });
    expect(byLabel.get('Appearances')).toMatchObject({ delta: '-3', deltaClass: 'negative' });
    expect(byLabel.get('Honorable kills')?.delta).toBeUndefined();
    expect(byLabel.get('Item level')).toEqual({ label: 'Item level', value: (873.5).toLocaleString() });
  });

  it('shows no account-wide value or change for a player without that data', () => {
    const component = new LeaderboardTableComponent();
    const metric = component
      .getDetailMetrics(createPlayer({ achievementsTotal: -1, achievementsTotalDelta: 5 }))
      .find((item) => item.label === 'Account wide achievements');

    expect(metric).toEqual({ label: 'Account wide achievements', value: '-' });
  });

  it('toggles from a row tap on phones, but not from links or on wider screens', () => {
    const component = new LeaderboardTableComponent();
    const player = createPlayer();
    const cell = document.createElement('td');
    const link = document.createElement('a');
    cell.appendChild(link);
    const clickOn = (target: Element) => ({ target }) as unknown as MouseEvent;

    setCompactScreen(true);
    component.onRowClick(clickOn(link), player);
    expect(component.isExpanded(player)).toBe(false);
    component.onRowClick(clickOn(cell), player);
    expect(component.isExpanded(player)).toBe(true);

    component.togglePlayerDetails(player);
    setCompactScreen(false);
    component.onRowClick(clickOn(cell), player);
    expect(component.isExpanded(player)).toBe(false);
  });
});
