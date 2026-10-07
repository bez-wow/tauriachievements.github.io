import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { getClassIconPath } from '../utils/classIconHelper';
import { injectCompactViewport } from './compact-viewport';
import { MythicPlusRole, MythicPlusRun } from './mythic-plus';
import { ClassShare, SpecShare, formatShare, shareTicks, specPopularity } from './mythic-plus-stats';
import { MYTHIC_PLUS_CARDS_QUERY } from './mythic-plus-views';
import { TapTooltipDirective } from './tap-tooltip.directive';

type RoleFilter = MythicPlusRole | 'all';
type CountMode = 'runs' | 'characters';

interface SpecBar extends SpecShare {
  heightPercent: number;
  shareLabel: string;
  /** Only each class's most-seen spec carries a value on its cap; the rest live in the tooltip. */
  showValue: boolean;
}

interface ClassGroup extends Omit<ClassShare, 'specs'> {
  classIcon: string;
  shareLabel: string;
  specs: SpecBar[];
}

@Component({
  selector: 'app-mythic-plus-spec-chart',
  standalone: true,
  imports: [CommonModule, TapTooltipDirective],
  templateUrl: './mythic-plus-spec-chart.component.html',
  styleUrls: ['./mythic-plus-spec-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusSpecChartComponent {
  readonly runs = input.required<readonly MythicPlusRun[]>();
  readonly scopeLabel = input('All dungeons');
  readonly seasonName = input('');

  readonly roleOptions: ReadonlyArray<{ value: RoleFilter; label: string }> = [
    { value: 'all', label: 'All roles' },
    { value: 'tank', label: 'Tank' },
    { value: 'healer', label: 'Healer' },
    { value: 'dps', label: 'DPS' }
  ];
  readonly countOptions: ReadonlyArray<{ value: CountMode; label: string }> = [
    { value: 'runs', label: 'All runs' },
    { value: 'characters', label: 'Unique characters' }
  ];
  /** Minimum key level; each step keeps that level and everything above it. */
  readonly levelOptions: ReadonlyArray<{ value: number; label: string; title: string }> = [
    { value: 0, label: 'All keys', title: 'Keys of every level' },
    { value: 5, label: '+5', title: 'Keys +5 and higher' },
    { value: 10, label: '+10', title: 'Keys +10 and higher' },
    { value: 15, label: '+15', title: 'Keys +15 and higher' }
  ];

  readonly role = signal<RoleFilter>('all');
  readonly countMode = signal<CountMode>('runs');
  readonly minLevel = signal(0);

  /**
   * On narrow screens the chart and its filters start folded under the title, so the
   * leaderboard is on the first screen; a tap opens them. Wide screens always show them.
   */
  readonly collapsible = injectCompactViewport(MYTHIC_PLUS_CARDS_QUERY);
  readonly expanded = signal(false);
  readonly showBody = computed(() => !this.collapsible() || this.expanded());

  readonly isFiltered = computed(() =>
    this.role() !== 'all' || this.minLevel() !== 0 || this.countMode() !== 'runs');

  resetFilters(): void {
    this.role.set('all');
    this.minLevel.set(0);
    this.countMode.set('runs');
  }

  readonly popularity = computed(() => {
    const role = this.role();
    const minLevel = this.minLevel();
    const runs = minLevel > 0 ? this.runs().filter(run => run.keyLevel >= minLevel) : this.runs();
    return specPopularity(runs, {
      role: role === 'all' ? undefined : role,
      uniqueCharacters: this.countMode() === 'characters'
    });
  });

  readonly ticks = computed(() => shareTicks(Math.max(0, ...this.popularity().classes
    .flatMap(group => group.specs.map(spec => spec.share)))));

  readonly gridlines = computed(() => {
    const ticks = this.ticks();
    const top = ticks[ticks.length - 1];
    return ticks.map(value => ({ value, position: (value / top) * 100 }));
  });

  readonly groups = computed<ClassGroup[]>(() => {
    const ticks = this.ticks();
    const topShare = ticks[ticks.length - 1] / 100;

    return this.popularity().classes.map(group => ({
      ...group,
      classIcon: getClassIconPath(group.classId),
      shareLabel: formatShare(group.share),
      specs: group.specs.map((spec, index) => ({
        ...spec,
        heightPercent: (spec.share / topShare) * 100,
        shareLabel: formatShare(spec.share),
        showValue: index === 0 && spec.count > 0
      }))
    }));
  });

  readonly unitLabel = computed(() => this.countMode() === 'characters' ? 'characters' : 'player slots');

  readonly subtitle = computed(() => {
    const { total, runCount } = this.popularity();
    const role = this.roleOptions.find(option => option.value === this.role())?.label ?? 'All roles';
    const count = this.countMode() === 'characters' ? 'Unique characters' : 'All runs';
    const minLevel = this.minLevel();

    return [
      this.scopeLabel(),
      role,
      minLevel > 0 ? `Keys +${minLevel} and higher` : 'All keys',
      count,
      `${total} ${this.unitLabel()} from ${runCount} ${runCount === 1 ? 'run' : 'runs'}`,
      'Grouped by popularity'
    ].join(' · ');
  });

  trackGroup(index: number, group: ClassGroup): number {
    return group.classId;
  }

  trackSpec(index: number, spec: SpecBar): string {
    return spec.spec;
  }
}
