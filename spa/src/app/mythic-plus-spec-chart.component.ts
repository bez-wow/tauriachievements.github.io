import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { getClassIconPath } from '../utils/classIconHelper';
import { MythicPlusRole, MythicPlusRun } from './mythic-plus';
import { ClassShare, SpecShare, formatShare, shareTicks, specPopularity } from './mythic-plus-stats';

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
  imports: [CommonModule],
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

  readonly role = signal<RoleFilter>('all');
  readonly countMode = signal<CountMode>('runs');

  readonly popularity = computed(() => {
    const role = this.role();
    return specPopularity(this.runs(), {
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

    return [
      this.scopeLabel(),
      role,
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
