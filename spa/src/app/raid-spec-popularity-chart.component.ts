import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { getClassIconPath } from '../utils/classIconHelper';
import { FlipDirective } from './flip.directive';
import { GlideDirective } from './glide.directive';
import { ClassShare, SpecShare, formatShare, shareTicks, specPopularity } from './mythic-plus-stats';
import { RaidDifficulty, RaidKillDetails, RaidRole } from './raid-logs';
import { RevealDirective } from './reveal.directive';
import { TapTooltipDirective } from './tap-tooltip.directive';

interface SpecBar extends SpecShare {
  heightPercent: number;
  shareLabel: string;
  /** Only each class's most-seen spec carries a value above its bar. */
  showValue: boolean;
}

interface ClassGroup extends Omit<ClassShare, 'specs'> {
  classIcon: string;
  shareLabel: string;
  specs: SpecBar[];
}

type RoleFilter = RaidRole | 'all';

/**
 * Raid-roster equivalent of the Mythic+ spec-popularity chart. Each appearance in a boss kill is
 * one player slot, so a character who killed several bosses contributes once to each kill.
 */
@Component({
  selector: 'app-raid-spec-popularity-chart',
  standalone: true,
  imports: [CommonModule, TapTooltipDirective, GlideDirective, RevealDirective, FlipDirective],
  templateUrl: './raid-spec-popularity-chart.component.html',
  styleUrls: ['./mythic-plus-spec-chart.component.scss', './raid-spec-popularity-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaidSpecPopularityChartComponent {
  readonly kills = input.required<readonly RaidKillDetails[]>();
  readonly difficulties = input.required<readonly RaidDifficulty[]>();
  readonly selectedDifficulty = input.required<string>();
  readonly raidName = input('The Emerald Nightmare');
  readonly loading = input(false);
  readonly error = input<string>();

  readonly difficultyChange = output<string>();
  readonly retry = output<void>();

  readonly roleOptions: ReadonlyArray<{ value: RoleFilter; label: string }> = [
    { value: 'all', label: 'All roles' },
    { value: 'tank', label: 'Tank' },
    { value: 'healer', label: 'Healer' },
    { value: 'dps', label: 'DPS' }
  ];
  readonly role = signal<RoleFilter>('all');

  readonly shownDifficulties = computed(() => this.difficulties().filter(difficulty =>
    difficulty.kills > 0 && ['normal', 'heroic', 'mythic'].includes(difficulty.slug)));

  readonly popularity = computed(() => {
    const role = this.role();
    return specPopularity(this.kills().map(kill => ({
      roster: kill.members.flatMap(member => member.spec ? [{
        name: member.character.name,
        realm: member.character.realm,
        class: member.character.classId,
        spec: member.spec.name,
        role: member.spec.role
      }] : [])
    })), { role: role === 'all' ? undefined : role });
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

  readonly selectedDifficultyName = computed(() =>
    this.difficulties().find(difficulty => difficulty.slug === this.selectedDifficulty())?.name
      ?? this.selectedDifficulty());

  readonly subtitle = computed(() => {
    const { total, runCount } = this.popularity();
    const role = this.roleOptions.find(option => option.value === this.role())?.label ?? 'All roles';
    return [
      `${this.selectedDifficultyName()} raids`,
      role,
      `${total.toLocaleString('en-US')} player slots from ${runCount.toLocaleString('en-US')} ${runCount === 1 ? 'kill' : 'kills'}`,
      'Grouped by popularity'
    ].join(' · ');
  });

  difficultyLabel(difficulty: RaidDifficulty): string {
    return difficulty.slug === 'heroic' ? 'HC' : difficulty.name;
  }

  trackDifficulty(index: number, difficulty: RaidDifficulty): string {
    return difficulty.slug;
  }

  trackGroup(index: number, group: ClassGroup): number {
    return group.classId;
  }

  trackSpec(index: number, spec: SpecBar): string {
    return spec.spec;
  }
}
