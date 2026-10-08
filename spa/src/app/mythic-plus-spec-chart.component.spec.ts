import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { MythicPlusRun } from './mythic-plus';
import { MythicPlusSpecChartComponent } from './mythic-plus-spec-chart.component';

function run(id: string, keyLevel: number, spec: string): MythicPlusRun {
  return {
    id,
    dungeon: 'brh',
    keyLevel,
    clearTimeSeconds: 1800,
    score: 100,
    completedAt: '2026-10-01T20:00:00Z',
    affixes: [],
    roster: [{ name: `Healer${id}`, realm: 'Evermoon', class: 11, race: 4, gender: 0, spec, role: 'healer' }]
  };
}

describe('MythicPlusSpecChartComponent', () => {
  it('counts only keys at or above the chosen level', async () => {
    await TestBed.configureTestingModule({ imports: [MythicPlusSpecChartComponent] }).compileComponents();
    const fixture = TestBed.createComponent(MythicPlusSpecChartComponent);
    fixture.componentRef.setInput('runs', [run('a', 4, 'Restoration'), run('b', 10, 'Restoration'), run('c', 15, 'Restoration')]);
    const chart = fixture.componentInstance;

    expect(chart.popularity().runCount).toBe(3);
    expect(chart.subtitle()).toContain('All keys');

    chart.minLevel.set(10);
    expect(chart.popularity().runCount).toBe(2);
    expect(chart.subtitle()).toContain('Keys +10 and higher');

    chart.minLevel.set(15);
    expect(chart.popularity().total).toBe(1);
  });

  it('resets role, key level and count mode in one click', async () => {
    await TestBed.configureTestingModule({ imports: [MythicPlusSpecChartComponent] }).compileComponents();
    const fixture = TestBed.createComponent(MythicPlusSpecChartComponent);
    fixture.componentRef.setInput('runs', [run('a', 4, 'Restoration')]);
    const chart = fixture.componentInstance;

    expect(chart.isFiltered()).toBe(false);

    chart.role.set('healer');
    chart.minLevel.set(10);
    chart.countMode.set('characters');
    expect(chart.isFiltered()).toBe(true);

    chart.resetFilters();
    expect([chart.role(), chart.minLevel(), chart.countMode()]).toEqual(['all', 0, 'runs']);
    expect(chart.isFiltered()).toBe(false);
  });

  it('selects the class and spec represented by a clicked bar', async () => {
    await TestBed.configureTestingModule({ imports: [MythicPlusSpecChartComponent] }).compileComponents();
    const fixture = TestBed.createComponent(MythicPlusSpecChartComponent);
    fixture.componentRef.setInput('runs', [run('a', 10, 'Restoration')]);
    const selections: Array<{ classId: number; spec: string }> = [];
    fixture.componentInstance.specSelect.subscribe(selection => selections.push(selection));
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const restorationBar = [...element.querySelectorAll<HTMLButtonElement>('.bar-slot')]
      .find(bar => bar.getAttribute('aria-label')?.startsWith('Show Restoration Druid players'));
    restorationBar?.click();

    expect(selections).toEqual([{ classId: 11, spec: 'Restoration' }]);
  });

  it('highlights the class and spec selected in the players filters', async () => {
    await TestBed.configureTestingModule({ imports: [MythicPlusSpecChartComponent] }).compileComponents();
    const fixture = TestBed.createComponent(MythicPlusSpecChartComponent);
    fixture.componentRef.setInput('runs', [run('a', 10, 'Restoration')]);
    fixture.componentRef.setInput('selectedClassId', 11);
    fixture.componentRef.setInput('selectedSpec', 'Restoration');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const restorationBar = [...element.querySelectorAll<HTMLButtonElement>('.bar-slot')]
      .find(bar => bar.getAttribute('aria-label')?.startsWith('Show Restoration Druid players'));
    const balanceBar = [...element.querySelectorAll<HTMLButtonElement>('.bar-slot')]
      .find(bar => bar.getAttribute('aria-label')?.startsWith('Show Balance Druid players'));

    expect(restorationBar?.classList.contains('filter-match')).toBe(true);
    expect(balanceBar?.classList.contains('filter-match')).toBe(false);
    expect(element.querySelector('.class-label.filter-match')?.textContent).toContain('Druid');
  });
});
