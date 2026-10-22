import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, inject, input, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MythicPlusDungeon, upgradeStars } from './mythic-plus';
import { BestRunCell, PlayerRow } from './mythic-plus-views';

@Component({
  selector: 'app-mythic-plus-players-list',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './mythic-plus-players-list.component.html',
  styleUrl: './mythic-plus-players-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusPlayersListComponent {
  private readonly router = inject(Router);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  readonly rows = input.required<readonly PlayerRow[]>();
  readonly dungeons = input.required<readonly MythicPlusDungeon[]>();
  readonly singleDungeon = input(false);
  readonly emptyMessage = input('');
  readonly cards = input(false);
  readonly highlightKey = input<string | undefined>();
  readonly pickMode = input(false);
  readonly pickedKeys = input<ReadonlySet<string>>(new Set());
  readonly pick = output<PlayerRow>();
  readonly ladder = input<'server' | 'guild'>('server');

  readonly upgradeStars = upgradeStars;

  rankChangeLabel(change: number): string {
    return change > 0
      ? `Climbed ${change} ${change === 1 ? 'rank' : 'ranks'} since the last scan`
      : change < 0
        ? `Fell ${Math.abs(change)} ${change === -1 ? 'rank' : 'ranks'} since the last scan`
        : 'Rank unchanged since the last scan';
  }

  scoreChangeLabel(change: number): string {
    return change > 0
      ? `+${change.toFixed(1)} score since the last scan`
      : change < 0
        ? `−${Math.abs(change).toFixed(1)} score since the last scan`
        : '0.0 score since the last scan';
  }

  private scrolledTo?: string;

  constructor() {
    afterRenderEffect(() => {
      const key = this.highlightKey();
      if (!key || key === this.scrolledTo || !this.rows().some(row => row.key === key)) {
        return;
      }

      this.scrolledTo = key;
      this.host.querySelector('.highlighted')?.scrollIntoView?.({ block: 'center' });
    });
  }

  openProfile(row: PlayerRow): void {
    if (this.pickMode()) {
      this.pick.emit(row);
      return;
    }
    this.router.navigate(row.member.profileLink);
  }

  onLink(event: Event, row: PlayerRow): void {
    event.stopPropagation();
    if (this.pickMode()) {
      event.preventDefault();
      this.pick.emit(row);
    }
  }

  bestTitle(best: BestRunCell | undefined): string {
    return best
      ? `${best.dungeon.name} +${best.keyLevel}${best.timed ? '' : ' (over time)'} · ${best.score.toFixed(1)}`
      : '';
  }

  playedBests(row: PlayerRow): BestRunCell[] {
    return row.bests.filter((best): best is BestRunCell => best !== undefined);
  }
}
