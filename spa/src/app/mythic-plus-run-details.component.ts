import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ROLE_LABELS, UPGRADE_CUTOFFS } from './mythic-plus';
import { MemberView, RunView } from './mythic-plus-views';

/** The panel under an expanded run: result, affixes, timer and the whole group, each linking to their profile. */
@Component({
  selector: 'app-mythic-plus-run-details',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './mythic-plus-run-details.component.html',
  styleUrl: './mythic-plus-run-details.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusRunDetailsComponent {
  readonly run = input.required<RunView>();

  readonly roleLabels = ROLE_LABELS;
  readonly cutoffMarks = UPGRADE_CUTOFFS.filter(cutoff => cutoff.percent < 100);

  trackMember(index: number, member: MemberView): string {
    return `${member.name}-${member.realm}`;
  }
}
