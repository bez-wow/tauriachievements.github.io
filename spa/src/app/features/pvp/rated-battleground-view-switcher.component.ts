import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type RatedBattlegroundContentView = 'players' | 'matches';

@Component({
  selector: 'app-rated-battleground-view-switcher',
  templateUrl: './rated-battleground-view-switcher.component.html',
  styleUrls: ['./rated-battleground-view-switcher.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RatedBattlegroundViewSwitcherComponent {
  readonly selectedView = input.required<RatedBattlegroundContentView>();
  readonly playerCount = input(0);
  readonly matchCount = input(0);
  readonly viewChange = output<RatedBattlegroundContentView>();
}
