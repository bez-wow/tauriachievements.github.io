import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { upgradeStars } from './mythic-plus';
import { MythicPlusRunDetailsComponent } from './mythic-plus-run-details.component';
import { MemberView, RunRow } from './mythic-plus-views';

/**
 * One page of ranked runs. A ten-column table on wide screens; on narrow ones a card per run
 * (rank, dungeon, key, time, score and the group's names) that opens the same details panel.
 */
@Component({
  selector: 'app-mythic-plus-runs-list',
  standalone: true,
  imports: [CommonModule, MythicPlusRunDetailsComponent],
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

  readonly toggleRun = output<string>();

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
