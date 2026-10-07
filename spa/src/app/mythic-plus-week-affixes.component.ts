import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MythicPlusAffix } from './mythic-plus';
import { TapTooltipDirective } from './tap-tooltip.directive';

/**
 * This week's affixes, each with its description in a tooltip: hover with a mouse, tap on a
 * touch screen, or focus with the keyboard. Shared by the leaderboard and the stats page.
 */
@Component({
  selector: 'app-mythic-plus-week-affixes',
  standalone: true,
  imports: [CommonModule, TapTooltipDirective],
  templateUrl: './mythic-plus-week-affixes.component.html',
  styleUrl: './mythic-plus-week-affixes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusWeekAffixesComponent {
  private static instances = 0;
  /** Tooltip ids stay unique when a page lists several weeks. */
  readonly idPrefix = `week-affix-${MythicPlusWeekAffixesComponent.instances++}-`;

  readonly affixes = input.required<readonly MythicPlusAffix[]>();
  /** Names the list for screen readers. */
  readonly label = input("This week's affixes");
}
