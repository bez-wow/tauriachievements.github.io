import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MythicPlusDungeon, upgradeStars } from './mythic-plus';
import { BestRunCell, PlayerRow } from './mythic-plus-views';

/**
 * One page of ranked players. A table with a best-key column per dungeon on wide screens; on
 * narrow ones a card per player with their best keys as chips. Picking a player opens their runs.
 */
@Component({
  selector: 'app-mythic-plus-players-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mythic-plus-players-list.component.html',
  styleUrl: './mythic-plus-players-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusPlayersListComponent {
  readonly rows = input.required<readonly PlayerRow[]>();
  /** The dungeons in scope, one per entry of each row's `bests`. */
  readonly dungeons = input.required<readonly MythicPlusDungeon[]>();
  /** One dungeon picked: best key and time columns instead of a column per dungeon. */
  readonly singleDungeon = input(false);
  readonly emptyMessage = input('');
  /** Cards instead of the table (MYTHIC_PLUS_CARDS_QUERY). */
  readonly cards = input(false);

  readonly playerSelected = output<PlayerRow>();

  readonly upgradeStars = upgradeStars;

  trackPlayer(index: number, row: PlayerRow): string {
    return row.key;
  }

  trackDungeon(index: number, dungeon: MythicPlusDungeon): string {
    return dungeon.id;
  }

  bestTitle(best: BestRunCell | undefined): string {
    return best
      ? `${best.dungeon.name} +${best.keyLevel}${best.timed ? '' : ' (over time)'} · ${best.score.toFixed(1)}`
      : '';
  }

  /** The dungeons a card lists: only those the player has a run in. */
  playedBests(row: PlayerRow): BestRunCell[] {
    return row.bests.filter((best): best is BestRunCell => best !== undefined);
  }
}
