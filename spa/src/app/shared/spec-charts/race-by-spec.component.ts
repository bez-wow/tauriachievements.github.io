import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { getRaceIconPath } from '../../game/raceIconHelper';
import { GlideDirective } from '../motion/glide.directive';
import { RaceFactionFilter, RaceSample, RaceShare, racesBySpec } from './race-popularity';
import { RevealDirective } from '../motion/reveal.directive';
import { TapTooltipDirective } from '../tap-tooltip.directive';
import { Role } from '../../game/wow';

interface RaceView extends RaceShare {
  icon: string;
  shareLabel: string;
}

interface Segment {
  key: string;
  tone: number;
  width: number;
}

interface SpecRow {
  key: string;
  classId: number;
  className: string;
  color: string;
  spec: string;
  icon?: string;
  total: number;
  races: RaceView[];
  tiedWith: string[];
  segments: Segment[];
  label: string;
}

const SHOWN_RACES = 3;

const shareLabel = (share: number): string => `${Math.round(share * 100)}%`;

const ROLE_TITLES: Readonly<Record<Role, string>> = { dps: 'DPS', tank: 'tank', healer: 'healer' };

@Component({
  selector: 'app-race-by-spec',
  imports: [GlideDirective, RevealDirective, TapTooltipDirective, DecimalPipe],
  templateUrl: './race-by-spec.component.html',
  styleUrls: ['./spec-chart.scss', './race-by-spec.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaceBySpecComponent {
  readonly samples = input.required<readonly RaceSample[]>();
  readonly role = input.required<Role>();
  readonly context = input.required<string>();
  readonly loading = input(false);

  readonly factionOptions: ReadonlyArray<{ value: RaceFactionFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'alliance', label: 'Alliance' },
    { value: 'horde', label: 'Horde' }
  ];
  readonly faction = signal<RaceFactionFilter>('all');

  readonly title = computed(() => `Most popular race by ${ROLE_TITLES[this.role()]} spec`);
  readonly rowsPerColumn = computed(() => Math.ceil(this.result().specs.length / 2));

  private readonly result = computed(() => racesBySpec(this.samples(), this.role(), this.faction()));

  readonly rows = computed<SpecRow[]>(() => this.result().specs.map(spec => {
    const races = spec.races.map((race): RaceView => ({
      ...race,
      icon: getRaceIconPath(race.race === 24 ? 25 : race.race, 0),
      shareLabel: shareLabel(race.share)
    }));
    const rest = races.slice(SHOWN_RACES).reduce((sum, race) => sum + race.share, 0);
    const segments: Segment[] = races.slice(0, SHOWN_RACES)
      .map((race, tone) => ({ key: String(race.race), tone, width: race.share * 100 }));
    if (rest > 0) {
      segments.push({ key: 'rest', tone: SHOWN_RACES, width: rest * 100 });
    }

    const name = `${spec.spec} ${spec.className}`;
    return {
      key: `${spec.classId}:${spec.spec}`,
      classId: spec.classId,
      className: spec.className,
      color: spec.color,
      spec: spec.spec,
      icon: spec.icon,
      total: spec.total,
      races,
      tiedWith: races.slice(1).filter(race => race.count === races[0].count).map(race => race.name),
      segments,
      label: races.length
        ? `${name}, ${spec.total} characters: ${races.map(race => `${race.name} ${race.shareLabel}`).join(', ')}`
        : `${name}: nobody yet`
    };
  }));

  readonly subtitle = computed(() => {
    const total = this.result().total;
    return `${this.context()} · ${total.toLocaleString('en-US')} ${total === 1 ? 'character' : 'characters'}, each counted once per spec`;
  });
}
