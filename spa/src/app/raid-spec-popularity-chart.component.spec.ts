import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { RaidDifficulty, RaidKillDetails, RaidMember, RaidSpec } from './raid-logs';
import { RaidSpecPopularityChartComponent } from './raid-spec-popularity-chart.component';

const DIFFICULTIES: RaidDifficulty[] = [
  { id: 14, slug: 'normal', name: 'Normal', shortName: 'N', kills: 2 },
  { id: 15, slug: 'heroic', name: 'Heroic', shortName: 'HC', kills: 2 },
  { id: 16, slug: 'mythic', name: 'Mythic', shortName: 'M', kills: 1 }
];

const RESTORATION: RaidSpec = { id: 105, classId: 11, name: 'Restoration', role: 'healer' };
const FIRE: RaidSpec = { id: 63, classId: 8, name: 'Fire', role: 'dps' };

function member(name: string, spec: RaidSpec): RaidMember {
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
    dps: 0,
    hps: 0
  };
}

function kill(logId: number, members: RaidMember[]): RaidKillDetails {
  return {
    realm: 'Evermoon',
    logId,
    boss: { id: 1, slug: 'boss', name: 'Boss', shortName: 'Boss', index: 0, portrait: '' },
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
});
