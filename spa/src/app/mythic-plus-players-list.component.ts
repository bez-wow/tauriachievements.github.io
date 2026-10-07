import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MythicPlusDungeon, upgradeStars } from './mythic-plus';
import { BestRunCell, PlayerRow } from './mythic-plus-views';

/**
 * One page of ranked players. A table with a best-key column per dungeon on wide screens; on
 * narrow ones a card per player with their best keys as chips. Picking a player opens their profile.
 */
@Component({
  selector: 'app-mythic-plus-players-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './mythic-plus-players-list.component.html',
  styleUrl: './mythic-plus-players-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusPlayersListComponent {
  private readonly router = inject(Router);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  readonly rows = input.required<readonly PlayerRow[]>();
  /** The dungeons in scope, one per entry of each row's `bests`. */
  readonly dungeons = input.required<readonly MythicPlusDungeon[]>();
  /** One dungeon picked: best key and time columns instead of a column per dungeon. */
  readonly singleDungeon = input(false);
  readonly emptyMessage = input('');
  /** Cards instead of the table (MYTHIC_PLUS_CARDS_QUERY). */
  readonly cards = input(false);
  /** `characterKey` of a player to pick out, e.g. one who followed a rank from their profile. */
  readonly highlightKey = input<string | undefined>();

  readonly upgradeStars = upgradeStars;

  /** The highlighted player already scrolled to, so paging back to them doesn't scroll again. */
  private scrolledTo?: string;

  constructor() {
    // Bring the highlighted player into view once their row is on the page.
    afterRenderEffect(() => {
      const key = this.highlightKey();
      if (!key || key === this.scrolledTo || !this.rows().some(row => row.key === key)) {
        return;
      }

      this.scrolledTo = key;
      this.host.querySelector('.highlighted')?.scrollIntoView?.({ block: 'center' });
    });
  }

  /** A click anywhere on a table row; the name inside it is a link of its own. */
  openProfile(row: PlayerRow): void {
    this.router.navigate(row.member.profileLink);
  }

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
