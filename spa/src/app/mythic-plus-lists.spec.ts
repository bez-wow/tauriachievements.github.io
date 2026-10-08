import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MythicPlusAffix, MythicPlusDungeon, MythicPlusMember, MythicPlusRun } from './mythic-plus';
import { MythicPlusPlayersListComponent } from './mythic-plus-players-list.component';
import { MythicPlusRunsListComponent } from './mythic-plus-runs-list.component';
import { MythicPlusWeekAffixesComponent } from './mythic-plus-week-affixes.component';
import { PlayerRow, RunRow, toMemberView, toRunView } from './mythic-plus-views';

const dungeon: MythicPlusDungeon = {
  id: 'brh', challengeId: 199, shortName: 'BRH', name: 'Black Rook Hold',
  timerSeconds: 2340, icon: 'brh.png', runCount: 1, bestScore: 200
};
const otherDungeon: MythicPlusDungeon = { ...dungeon, id: 'cos', shortName: 'COS', name: 'Court of Stars' };

const affixes: MythicPlusAffix[] = [
  { id: 6, name: 'Raging', level: 4, icon: 'raging.png', description: 'Enemies enrage.' },
  { id: 3, name: 'Volcanic', level: 7, icon: 'volcanic.png', description: 'Flames erupt.' }
];

function member(name: string, role: MythicPlusMember['role']): MythicPlusMember {
  return { name, realm: 'Evermoon', class: 1, race: 1, gender: 0, spec: 'Arms', role };
}

function runRow(id: string, rank: number): RunRow {
  const run: MythicPlusRun = {
    id,
    dungeon: 'brh',
    keyLevel: 15,
    clearTimeSeconds: 1800,
    score: 150,
    completedAt: '2026-10-01T20:00:00Z',
    affixes: [6, 3],
    roster: [member('Dps', 'dps'), member('Tank', 'tank'), member('Healer', 'healer')]
  };
  return { ...toRunView(run, dungeon, new Map(affixes.map(affix => [affix.id, affix])), 200), rank };
}

function playerRow(name: string): PlayerRow {
  return {
    key: `${name}-Evermoon`,
    rank: 1,
    member: toMemberView(member(name, 'dps')),
    score: 300,
    quality: 'epic',
    bests: [
      { dungeon, keyLevel: 15, timed: true, upgrades: 2, clearTime: '00:30:00', score: 150 },
      undefined
    ]
  };
}

// Names link to profile pages.
beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

describe('MythicPlusRunsListComponent', () => {
  function render(cards: boolean) {
    const fixture = TestBed.createComponent(MythicPlusRunsListComponent);
    fixture.componentRef.setInput('rows', [runRow('a', 1), runRow('b', 2)]);
    fixture.componentRef.setInput('cards', cards);
    fixture.detectChanges();
    return fixture;
  }

  it('renders a card per run on narrow screens, with the group tank first', () => {
    const element: HTMLElement = render(true).nativeElement;

    expect(element.querySelector('table')).toBeNull();
    expect(element.querySelectorAll('.run-card').length).toBe(2);
    const names = [...element.querySelectorAll('.run-card')[0].querySelectorAll('.card-member')].map(node => node.textContent);
    expect(names).toEqual(['Tank', 'Healer', 'Dps']);
  });

  it('renders the table on wide screens', () => {
    const element: HTMLElement = render(false).nativeElement;

    expect(element.querySelector('.run-card')).toBeNull();
    expect(element.querySelectorAll('tbody .run-row').length).toBe(2);
  });

  it('links names in the table and in the run details to their profiles, not the armory', () => {
    const fixture = render(false);
    fixture.componentRef.setInput('expandedRunId', 'a');
    fixture.detectChanges();

    const tableLink: HTMLAnchorElement = fixture.nativeElement.querySelector('.run-row a.member-link');
    const rosterLink: HTMLAnchorElement = fixture.nativeElement.querySelector('.roster-card a');
    expect(tableLink.getAttribute('href')).toBe('/mythic-plus/character/evermoon/Tank');
    expect(tableLink.getAttribute('target')).toBeNull();
    expect(rosterLink.getAttribute('href')).toBe('/mythic-plus/character/evermoon/Tank');
  });

  it('asks to toggle a run when its card is tapped, and shows the details it is given', () => {
    const fixture = render(true);
    const toggled: string[] = [];
    fixture.componentInstance.toggleRun.subscribe(id => toggled.push(id));

    (fixture.nativeElement.querySelectorAll('.run-card-summary')[1] as HTMLButtonElement).click();
    expect(toggled).toEqual(['b']);

    fixture.componentRef.setInput('expandedRunId', 'b');
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.run-card');
    expect(cards[1].querySelector('app-mythic-plus-run-details')).not.toBeNull();
    expect(cards[1].querySelector('.run-card-summary').getAttribute('aria-expanded')).toBe('true');
    expect(cards[0].querySelector('app-mythic-plus-run-details')).toBeNull();
  });

  it('shows the empty message instead of an empty list', () => {
    const fixture = TestBed.createComponent(MythicPlusRunsListComponent);
    fixture.componentRef.setInput('rows', []);
    fixture.componentRef.setInput('cards', true);
    fixture.componentRef.setInput('emptyMessage', 'No runs yet this week.');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('ol')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No runs yet this week.');
  });
});

describe('MythicPlusPlayersListComponent', () => {
  function render(cards: boolean, singleDungeon = false) {
    const fixture = TestBed.createComponent(MythicPlusPlayersListComponent);
    fixture.componentRef.setInput('rows', [playerRow('Alpha')]);
    fixture.componentRef.setInput('dungeons', [dungeon, otherDungeon]);
    fixture.componentRef.setInput('singleDungeon', singleDungeon);
    fixture.componentRef.setInput('cards', cards);
    fixture.detectChanges();
    return fixture;
  }

  it('lists only the dungeons a player has run as chips', () => {
    const chips = [...render(true).nativeElement.querySelectorAll('.best-chip')].map((chip: Element) => chip.textContent?.trim());
    expect(chips).toEqual(['BRH +15']);
  });

  it('shows best key and time on a card when one dungeon is picked', () => {
    const element: HTMLElement = render(true, true).nativeElement;
    expect(element.querySelector('.best-chip')).toBeNull();
    expect(element.querySelector('.card-time')?.textContent).toBe('00:30:00');
  });

  it('links each card to the player profile', () => {
    const card: HTMLAnchorElement = render(true).nativeElement.querySelector('a.player-card');
    expect(card.getAttribute('href')).toBe('/mythic-plus/character/evermoon/Alpha');
  });

  it('shows the primary spec icon after the class icon in cards and table rows', () => {
    for (const cards of [true, false]) {
      const icons = render(cards).nativeElement.querySelector('.player-icons');
      expect(icons.querySelector('.class-icon')).not.toBeNull();
      expect(icons.querySelector('.spec-icon img')).not.toBeNull();
      expect(icons.querySelector('.spec-icon')?.getAttribute('title')).toBeNull();
    }
  });

  it('opens the profile from anywhere on a table row, and links the name to it', () => {
    const fixture = render(false);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    (fixture.nativeElement.querySelector('.player-row .col-rank') as HTMLElement).click();
    expect(navigate).toHaveBeenCalledWith(['/mythic-plus', 'character', 'evermoon', 'Alpha']);
    expect(fixture.nativeElement.querySelector('.player-row a.member-link').getAttribute('href'))
      .toBe('/mythic-plus/character/evermoon/Alpha');
  });

  it('shows only the immediate profile tooltip on a player row', () => {
    const element: HTMLElement = render(false).nativeElement;
    const row = element.querySelector('.player-row');

    expect(row?.getAttribute('title')).toBeNull();
    expect(row?.querySelector('.member-tooltip')).toBeNull();
    const tooltip = row?.querySelector('.profile-tooltip');
    expect(tooltip?.textContent?.trim()).toBe('Open the profile of Alpha');
    expect(tooltip?.parentElement?.classList).toContain('member-link');
  });

  it('picks out the highlighted player', () => {
    const fixture = render(false);
    fixture.componentRef.setInput('highlightKey', 'Alpha-Evermoon');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.player-row').classList).toContain('highlighted');
  });

  it('keeps a best-key column per dungeon in the wide table', () => {
    const element: HTMLElement = render(false).nativeElement;
    expect(element.querySelectorAll('td.col-best').length).toBe(2);
    expect(element.querySelector('.player-card')).toBeNull();
  });

  it('shows score gained and upward rank movement in tables and cards', () => {
    for (const cards of [true, false]) {
      const fixture = TestBed.createComponent(MythicPlusPlayersListComponent);
      fixture.componentRef.setInput('rows', [{
        ...playerRow('Alpha'),
        change: { score: 12.3, rank: 4 }
      }]);
      fixture.componentRef.setInput('dungeons', [dungeon, otherDungeon]);
      fixture.componentRef.setInput('cards', cards);
      fixture.detectChanges();

      const rank: HTMLElement = fixture.nativeElement.querySelector('.rank-change');
      const score: HTMLElement = fixture.nativeElement.querySelector(cards ? '.card-score' : '.score-metric');
      expect(rank.textContent?.trim()).toBe('▲ 4');
      expect(rank.getAttribute('aria-label')).toBe('Climbed 4 ranks since the last scan');
      expect(score.classList).toContain('score-gained');
      expect(score.querySelector('.score-tooltip')?.textContent?.trim()).toBe('+12.3 score since the last scan');
      expect(score.querySelector('.score-change')).toBeNull();
      if (!cards) {
        expect(score.classList).toContain('score-metric');
      }
    }
  });

  it('does not show a rank indicator when the rank is unchanged', () => {
    const fixture = TestBed.createComponent(MythicPlusPlayersListComponent);
    fixture.componentRef.setInput('rows', [{
      ...playerRow('Alpha'),
      change: { score: 3.2, rank: 0 }
    }]);
    fixture.componentRef.setInput('dungeons', [dungeon, otherDungeon]);
    fixture.componentRef.setInput('cards', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.rank-change')).toBeNull();
    expect(fixture.nativeElement.querySelector('.score-metric').classList).toContain('score-gained');
    expect(fixture.nativeElement.querySelector('.score-tooltip')?.textContent?.trim())
      .toBe('+3.2 score since the last scan');
  });

  it('does not show a score indicator when the score is unchanged', () => {
    const fixture = TestBed.createComponent(MythicPlusPlayersListComponent);
    fixture.componentRef.setInput('rows', [{
      ...playerRow('Alpha'),
      change: { score: 0, rank: -2 }
    }]);
    fixture.componentRef.setInput('dungeons', [dungeon, otherDungeon]);
    fixture.componentRef.setInput('cards', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.score-tooltip')).toBeNull();
    expect(fixture.nativeElement.querySelector('.score-metric').classList).not.toContain('score-gained');
    expect(fixture.nativeElement.querySelector('.rank-change')?.textContent?.trim()).toBe('▼ 2');
  });

  it('marks a player who was absent from the previous scan as new', () => {
    const fixture = TestBed.createComponent(MythicPlusPlayersListComponent);
    fixture.componentRef.setInput('rows', [{ ...playerRow('Alpha'), newSinceLastScan: true }]);
    fixture.componentRef.setInput('dungeons', [dungeon, otherDungeon]);
    fixture.componentRef.setInput('cards', false);
    fixture.detectChanges();

    expect([...fixture.nativeElement.querySelectorAll('.player-new')].map((node: Element) => node.textContent?.trim()))
      .toEqual(['new', 'new']);
  });
});

describe('MythicPlusWeekAffixesComponent', () => {
  it('gives each list its own tooltip ids, so a page can show several weeks', () => {
    const create = () => {
      const fixture = TestBed.createComponent(MythicPlusWeekAffixesComponent);
      fixture.componentRef.setInput('affixes', affixes);
      fixture.detectChanges();
      return fixture;
    };
    const first = create();
    const second = create();

    const ids = [first, second].flatMap(fixture =>
      [...fixture.nativeElement.querySelectorAll('[role=tooltip]')].map((tooltip: Element) => tooltip.id));
    expect(ids.length).toBe(4);
    expect(new Set(ids).size).toBe(4);

    const item: HTMLElement = first.nativeElement.querySelector('li');
    expect(item.getAttribute('aria-describedby')).toBe(first.nativeElement.querySelector('[role=tooltip]').id);
    expect(item.getAttribute('tabindex')).toBe('0');
  });
});
