import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { upgradeStars } from './mythic-plus';
import { MythicPlusRunDetailsComponent } from './mythic-plus-run-details.component';
import { RunRow } from './mythic-plus-views';

@Component({
  selector: 'app-mythic-plus-runs-list',
  imports: [RouterLink, MythicPlusRunDetailsComponent, DatePipe, DecimalPipe, NgTemplateOutlet],
  templateUrl: './mythic-plus-runs-list.component.html',
  styleUrl: './mythic-plus-runs-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusRunsListComponent {
  readonly rows = input.required<readonly RunRow[]>();
  readonly expandedRunId = input<string | undefined>();
  readonly emptyMessage = input('');
  readonly cards = input(false);
  readonly caption = input('Mythic+ runs ranked by score');

  readonly completed = input(false);
  readonly runOrder = input<'best' | 'latest'>();
  readonly runOrderChange = output<'best' | 'latest'>();

  readonly toggleRun = output<string>();

  private readonly now = signal(Date.now());

  constructor() {
    const clock = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(clock));
  }

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
}
