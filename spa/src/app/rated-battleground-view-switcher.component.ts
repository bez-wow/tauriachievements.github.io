import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

export type RatedBattlegroundContentView = 'players' | 'matches';

@Component({
  selector: 'app-rated-battleground-view-switcher',
  templateUrl: './rated-battleground-view-switcher.component.html',
  styleUrls: ['./rated-battleground-view-switcher.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RatedBattlegroundViewSwitcherComponent {
  @Input({ required: true }) selectedView: RatedBattlegroundContentView = 'players';
  @Input() playerCount = 0;
  @Input() matchCount = 0;
  @Output() readonly viewChange = new EventEmitter<RatedBattlegroundContentView>();
}
