import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { getClassIconPath } from '../../game/classIconHelper';
import { FlipDirective } from '../../shared/motion/flip.directive';
import { GlideDirective } from '../../shared/motion/glide.directive';
import { formatShare, shareTicks, specPopularity } from '../../shared/spec-charts/spec-popularity';
import { RaidBoss, RaidDifficulty, RaidKillDetails } from './raid-logs.types';
import { RoleFilter } from './raid-display';
import {
  SPEC_TOP_SCORES,
  SpecCharacterScore,
  formatScoreTick,
  scoreTicks,
  scoresBySpec,
  specPerformance
} from './raid-scores';
import { RevealDirective } from '../../shared/motion/reveal.directive';
import { TapTooltipDirective } from '../../shared/tap-tooltip.directive';
import { SpecDefinition } from '../../game/wow-specs';

interface SpecBar extends SpecDefinition {
  count: number;
  value: number;
  heightPercent: number;
  valueLabel: string;
  showValue: boolean;
  best?: SpecCharacterScore;
}

interface ClassGroup {
  classId: number;
  className: string;
  color: string;
  classIcon: string;
  valueLabel: string;
  specs: SpecBar[];
}

export type ChartView = 'popularity' | 'performance';

export function parseChartView(value: string | null | undefined): ChartView {
  return value === 'performance' ? 'performance' : 'popularity';
}

@Component({
  selector: 'app-raid-spec-popularity-chart',
  imports: [TapTooltipDirective, GlideDirective, RevealDirective, FlipDirective, DecimalPipe],
  templateUrl: './raid-spec-popularity-chart.component.html',
  styleUrls: ['../../shared/spec-charts/spec-chart.scss', './raid-spec-popularity-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaidSpecPopularityChartComponent {
  readonly kills = input.required<readonly RaidKillDetails[]>();
  readonly bosses = input<readonly RaidBoss[]>([]);
  readonly difficulties = input.required<readonly RaidDifficulty[]>();
  readonly selectedDifficulty = input.required<string>();
  readonly raidName = input('The Emerald Nightmare');
  readonly loading = input(false);
  readonly error = input<string>();

  readonly difficultyChange = output<string>();
  readonly retry = output<void>();

  readonly viewOptions: ReadonlyArray<{ value: ChartView; label: string }> = [
    { value: 'popularity', label: 'Popularity' },
    { value: 'performance', label: 'Performance' }
  ];
  readonly view = model<ChartView>('popularity');

  readonly roleOptions: ReadonlyArray<{ value: RoleFilter; label: string }> = [
    { value: 'all', label: 'All roles' },
    { value: 'tank', label: 'Tank' },
    { value: 'healer', label: 'Healer' },
    { value: 'dps', label: 'DPS' }
  ];
  readonly role = model<RoleFilter>('all');

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

  private readonly specScores = computed(() => {
    const kills = this.kills();
    const bosses = this.bosses();
    return scoresBySpec(bosses, bosses.map(boss => kills.filter(kill => kill.boss.slug === boss.slug)));
  });

  readonly performance = computed(() => {
    const role = this.role();
    return specPerformance(this.specScores(), role === 'all' ? undefined : role);
  });

  readonly hasData = computed(() =>
    this.view() === 'performance' ? this.performance().characterCount > 0 : this.popularity().total > 0);

  private readonly ticks = computed(() => {
    if (this.view() === 'performance') {
      return scoreTicks(Math.max(0, ...this.performance().classes.flatMap(group => group.specs.map(spec => spec.score))));
    }
    return shareTicks(Math.max(0, ...this.popularity().classes.flatMap(group => group.specs.map(spec => spec.share))));
  });

  readonly gridlines = computed(() => {
    const ticks = this.ticks();
    const top = ticks[ticks.length - 1];
    const performance = this.view() === 'performance';
    return ticks.map(value => ({ position: (value / top) * 100, label: performance ? formatScoreTick(value) : `${value}%` }));
  });

  readonly groups = computed<ClassGroup[]>(() => {
    const ticks = this.ticks();
    const top = ticks[ticks.length - 1];

    if (this.view() === 'performance') {
      return this.performance().classes.map(group => ({
        classId: group.classId,
        className: group.className,
        color: group.color,
        classIcon: getClassIconPath(group.classId),
        valueLabel: group.count ? String(group.score) : '-',
        specs: group.specs.map((spec, index) => ({
          ...spec,
          value: spec.score,
          heightPercent: (spec.score / top) * 100,
          valueLabel: String(spec.score),
          showValue: index === 0 && spec.count > 0
        }))
      }));
    }

    return this.popularity().classes.map(group => ({
      classId: group.classId,
      className: group.className,
      color: group.color,
      classIcon: getClassIconPath(group.classId),
      valueLabel: formatShare(group.share),
      specs: group.specs.map((spec, index) => ({
        ...spec,
        value: spec.share,
        heightPercent: (spec.share * 100 / top) * 100,
        valueLabel: formatShare(spec.share),
        showValue: index === 0 && spec.count > 0
      }))
    }));
  });

  readonly selectedDifficultyName = computed(() =>
    this.difficulties().find(difficulty => difficulty.slug === this.selectedDifficulty())?.name
      ?? this.selectedDifficulty());

  readonly title = computed(() => this.view() === 'performance' ? 'Spec Performance' : 'Spec Popularity');

  readonly subtitle = computed(() => {
    const role = this.roleOptions.find(option => option.value === this.role())?.label ?? 'All roles';

    if (this.view() === 'performance') {
      const { characterCount } = this.performance();
      return [
        `${this.selectedDifficultyName()} raids`,
        role,
        `${characterCount.toLocaleString('en-US')} ${characterCount === 1 ? 'character' : 'characters'}`,
        `Each spec's top ${SPEC_TOP_SCORES} ${this.scoreNoun()}, averaged`
      ].join(' · ');
    }

    const { total, runCount } = this.popularity();
    return [
      `${this.selectedDifficultyName()} raids`,
      role,
      `${total.toLocaleString('en-US')} player slots from ${runCount.toLocaleString('en-US')} ${runCount === 1 ? 'kill' : 'kills'}`,
      'Grouped by popularity'
    ].join(' · ');
  });

  private scoreNoun(): string {
    switch (this.role()) {
      case 'healer': return 'HPS scores';
      case 'all': return 'scores (HPS for healers, DPS for the rest)';
      default: return 'DPS scores';
    }
  }

  scoreKind(spec: SpecBar): string {
    return spec.role === 'healer' ? 'HPS score' : 'DPS score';
  }

  scoreSample(spec: SpecBar): string {
    if (spec.count === 1) {
      return 'Only 1 character';
    }
    return spec.count > SPEC_TOP_SCORES
      ? `Average of the top ${SPEC_TOP_SCORES} of ${spec.count.toLocaleString('en-US')} characters`
      : `Average of all ${spec.count} characters`;
  }

  barLabel(spec: SpecBar, group: ClassGroup): string {
    const name = `${spec.spec} ${group.className}`;
    if (this.view() === 'performance') {
      return spec.count
        ? `${name}: ${this.scoreKind(spec)} ${spec.valueLabel}. ${this.scoreSample(spec)}`
        : `${name}: nobody scored`;
    }
    return `${name}: ${spec.valueLabel}, ${spec.count.toLocaleString('en-US')} player slots`;
  }

  difficultyLabel(difficulty: RaidDifficulty): string {
    return difficulty.slug === 'heroic' ? 'HC' : difficulty.name;
  }
}
