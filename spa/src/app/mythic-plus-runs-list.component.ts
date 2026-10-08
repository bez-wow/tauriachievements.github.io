import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { upgradeStars } from './mythic-plus';
import { MythicPlusRunDetailsComponent } from './mythic-plus-run-details.component';
import { MemberView, RunRow } from './mythic-plus-views';

/**
 * One page of ranked runs. A ten-column table on wide screens; on narrow ones a card per run
 * (rank, dungeon, key, time, score and the group's names) that opens the same details panel.
 * Names link to the characters' profiles.
 */
@Component({
  selector: 'app-mythic-plus-runs-list',
  standalone: true,
  imports: [CommonModule, RouterLink, MythicPlusRunDetailsComponent],
  templateUrl: './mythic-plus-runs-list.component.html',
  styleUrl: './mythic-plus-runs-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusRunsListComponent {
  readonly rows = input.required<readonly RunRow[]>();
  readonly expandedRunId = input<string | undefined>();
  readonly emptyMessage = input('');
  /** Cards instead of the table (MYTHIC_PLUS_CARDS_QUERY). */
  readonly cards = input(false);
  /** Names the list for screen readers. */
  readonly caption = input('Mythic+ runs ranked by score');

  /** A Completed column ("12 min ago"). */
  readonly completed = input(false);
  /** Set, the Rank and Completed headers sort best / newest first (arrow on the active one). */
  readonly runOrder = input<'best' | 'latest'>();
  readonly runOrderChange = output<'best' | 'latest'>();

  readonly toggleRun = output<string>();

  /** Ticks every minute so "12 min ago" stays current. */
  private readonly now = signal(Date.now());

  constructor() {
    const clock = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(clock));
  }

  /** "12 min ago", "5 h ago", "3 d ago", like raider.io's run lists. */
  completedAgo(completedAt: string): string {
    const minutes = Math.max(0, Math.floor((this.now() - Date.parse(completedAt)) / 60_000));
    if (minutes < 1) {
      return 'just now';
    }
    if (minutes < 60) {
      return `${minutes} min ago`;
    }
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
  }

  readonly upgradeStars = upgradeStars;

  isExpanded(runId: string): boolean {
    return this.expandedRunId() === runId;
  }

  trackRow(index: number, row: RunRow): string {
    return row.id;
  }

  trackMember(index: number, member: MemberView): string {
    return `${member.name}-${member.realm}`;
  }
}
