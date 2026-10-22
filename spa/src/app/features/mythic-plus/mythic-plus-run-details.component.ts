import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ROLE_LABELS, UPGRADE_CUTOFFS } from './mythic-plus';
import { RunView } from './mythic-plus-views';

@Component({
  selector: 'app-mythic-plus-run-details',
  imports: [RouterLink, DatePipe],
  templateUrl: './mythic-plus-run-details.component.html',
  styleUrl: './mythic-plus-run-details.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusRunDetailsComponent {
  readonly run = input.required<RunView>();

  readonly roleLabels = ROLE_LABELS;
  readonly cutoffMarks = UPGRADE_CUTOFFS.filter(cutoff => cutoff.percent < 100);
}
