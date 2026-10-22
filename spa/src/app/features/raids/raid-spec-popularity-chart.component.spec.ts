import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { MAX_SCORE } from './raid-scores';
import { RaidBoss, RaidDifficulty, RaidKillDetails, RaidMember, RaidSpec } from './raid-logs.types';
import { RaidSpecPopularityChartComponent, parseChartView } from './raid-spec-popularity-chart.component';

const DIFFICULTIES: RaidDifficulty[] = [
  { id: 14, slug: 'normal', name: 'Normal', shortName: 'N', kills: 2 },
  { id: 15, slug: 'heroic', name: 'Heroic', shortName: 'HC', kills: 2 },
  { id: 16, slug: 'mythic', name: 'Mythic', shortName: 'M', kills: 1 }
];

const RESTORATION: RaidSpec = { id: 105, classId: 11, name: 'Restoration', role: 'healer' };
const FIRE: RaidSpec = { id: 63, classId: 8, name: 'Fire', role: 'dps' };
const FROST: RaidSpec = { id: 64, classId: 8, name: 'Frost', role: 'dps' };
const BOSS: RaidBoss = { id: 1, slug: 'boss', name: 'Boss', shortName: 'Boss', index: 0, portrait: '' };

function member(name: string, spec: RaidSpec, dps = 0): RaidMember {
  return {
    character: { name, realm: 'Evermoon', classId: spec.classId, race: 4, gender: 0, guild: '' },
    spec,
    itemLevel: 900,
    damage: 0,
    healing: 0,
    absorbs: 0,
    overhealing: 0,
    damageTaken: 0,
    interrupts: 0,
    dispels: 0,
    dps,
    hps: 0,
    talents: '',
    trinkets: []
  };
}

function kill(logId: number, members: RaidMember[]): RaidKillDetails {
  return {
    realm: 'Evermoon',
    logId,
    boss: BOSS,
    difficulty: DIFFICULTIES[0],
    killedAt: 0,
    fightMs: 1000,
    faction: 0,
    wipes: 0,
    deaths: 0,
    resurrects: 0,
    members,
    items: []
  };
}

describe('RaidSpecPopularityChartComponent', () => {
  it('counts one player slot for every member appearance in a raid kill', async () => {
    await TestBed.configureTestingModule({ imports: [RaidSpecPopularityChartComponent] }).compileComponents();
    const fixture = TestBed.createComponent(RaidSpecPopularityChartComponent);
    fixture.componentRef.setInput('difficulties', DIFFICULTIES);
    fixture.componentRef.setInput('selectedDifficulty', 'normal');
    fixture.componentRef.setInput('kills', [
      kill(1, [member('Leaf', RESTORATION), member('Spark', FIRE)]),
      kill(2, [member('Leaf', RESTORATION)])
    ]);

    const popularity = fixture.componentInstance.popularity();
    const druid = popularity.classes.find(group => group.classId === 11);

    expect(popularity.total).toBe(3);
    expect(popularity.runCount).toBe(2);
    expect(druid?.count).toBe(2);
    expect(fixture.componentInstance.subtitle()).toContain('3 player slots from 2 kills');
  });

  it('offers Normal, HC and Mythic and emits the selected difficulty', async () => {
    await TestBed.configureTestingModule({ imports: [RaidSpecPopularityChartComponent] }).compileComponents();
    const fixture = TestBed.createComponent(RaidSpecPopularityChartComponent);
    fixture.componentRef.setInput('difficulties', DIFFICULTIES);
    fixture.componentRef.setInput('selectedDifficulty', 'normal');
    fixture.componentRef.setInput('kills', []);
    const selections: string[] = [];
    fixture.componentInstance.difficultyChange.subscribe(difficulty => selections.push(difficulty));
    fixture.detectChanges();

    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.difficulty-filter button')];
    expect(buttons.map(button => button.textContent?.trim())).toEqual(['Normal', 'HC', 'Mythic']);

    buttons[1].click();
    expect(selections).toEqual(['heroic']);
  });

  it('filters player slots by role', async () => {
    await TestBed.configureTestingModule({ imports: [RaidSpecPopularityChartComponent] }).compileComponents();
    const fixture = TestBed.createComponent(RaidSpecPopularityChartComponent);
    fixture.componentRef.setInput('difficulties', DIFFICULTIES);
    fixture.componentRef.setInput('selectedDifficulty', 'normal');
    fixture.componentRef.setInput('kills', [
      kill(1, [member('Leaf', RESTORATION), member('Spark', FIRE)]),
      kill(2, [member('Leaf', RESTORATION)])
    ]);
    const chart = fixture.componentInstance;

    expect(chart.popularity().total).toBe(3);
    expect(chart.subtitle()).toContain('All roles');

    chart.role.set('healer');
    expect(chart.popularity().total).toBe(2);
    expect(chart.popularity().classes.every(group => group.specs.every(spec => spec.role === 'healer'))).toBe(true);
    expect(chart.subtitle()).toContain('Healer');

    chart.role.set('dps');
    expect(chart.popularity().total).toBe(1);
  });

  it('switches to Performance, which ranks specs by their leaderboard scores', async () => {
    await TestBed.configureTestingModule({ imports: [RaidSpecPopularityChartComponent] }).compileComponents();
    const fixture = TestBed.createComponent(RaidSpecPopularityChartComponent);
    fixture.componentRef.setInput('difficulties', DIFFICULTIES);
    fixture.componentRef.setInput('selectedDifficulty', 'normal');
    fixture.componentRef.setInput('bosses', [BOSS]);
    fixture.componentRef.setInput('kills', []);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const chart = fixture.componentInstance;

    const views = [...element.querySelectorAll<HTMLButtonElement>('.view-filter button')];
    expect(views.map(button => button.textContent?.trim())).toEqual(['Popularity', 'Performance']);
    views[1].click();
    fixture.detectChanges();
    expect(chart.view()).toBe('performance');
    expect(element.querySelector('h2')?.textContent).toContain('Spec Performance');

    fixture.componentRef.setInput('kills', [
      kill(1, [member('Spark', FIRE, 100), member('Ember', FIRE, 50), member('Chill', FROST, 80)])
    ]);
    chart.role.set('dps');
    const mage = chart.groups()[0];
    expect(mage.className).toBe('Mage');
    expect(mage.specs.map(spec => [spec.spec, spec.valueLabel])).toEqual([
      ['Frost', String(Math.floor(MAX_SCORE * .8))],
      ['Fire', String(Math.round((MAX_SCORE + Math.floor(MAX_SCORE * .5)) / 2))],
      ['Arcane', '0']
    ]);
    expect(chart.subtitle()).toContain('3 characters');
    expect(chart.gridlines().map(line => line.label)).toEqual(['0', '2k', '4k', '6k']);

    chart.view.set('popularity');
    expect(chart.groups()[0].specs.map(spec => spec.spec)).toEqual(['Fire', 'Frost', 'Arcane']);
  });

  it('opens on the view and role it is given, and reports a click on either', async () => {
    await TestBed.configureTestingModule({ imports: [RaidSpecPopularityChartComponent] }).compileComponents();
    const fixture = TestBed.createComponent(RaidSpecPopularityChartComponent);
    fixture.componentRef.setInput('difficulties', DIFFICULTIES);
    fixture.componentRef.setInput('selectedDifficulty', 'mythic');
    fixture.componentRef.setInput('kills', []);
    fixture.componentRef.setInput('view', 'performance');
    fixture.componentRef.setInput('role', 'healer');
    const views: string[] = [];
    const roles: string[] = [];
    fixture.componentInstance.view.subscribe(view => views.push(view));
    fixture.componentInstance.role.subscribe(role => roles.push(role));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    const active = [...element.querySelectorAll('.segmented button.active')].map(button => button.textContent?.trim());
    expect(active).toEqual(['Performance', 'Mythic', 'Healer']);

    element.querySelector<HTMLButtonElement>('.view-filter button')!.click();
    [...element.querySelectorAll<HTMLButtonElement>('.role-filter button')].at(-1)!.click();
    expect(views).toEqual(['popularity']);
    expect(roles).toEqual(['dps']);
  });
});

describe('parseChartView', () => {
  it('reads the address bar, falling back to Popularity', () => {
    expect(['performance', 'popularity', 'nonsense', null].map(parseChartView))
      .toEqual(['performance', 'popularity', 'popularity', 'popularity']);
  });
});
