import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MythicPlusAffix } from './mythic-plus';
import { TapTooltipDirective } from '../../shared/tap-tooltip.directive';

@Component({
  selector: 'app-mythic-plus-week-affixes',
  imports: [TapTooltipDirective],
  templateUrl: './mythic-plus-week-affixes.component.html',
  styleUrl: './mythic-plus-week-affixes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.compact]': 'compact()' }
})
export class MythicPlusWeekAffixesComponent {
  private static instances = 0;
  readonly idPrefix = `week-affix-${MythicPlusWeekAffixesComponent.instances++}-`;

  readonly affixes = input.required<readonly MythicPlusAffix[]>();
  readonly label = input("This week's affixes");
  readonly compact = input(false);
}
