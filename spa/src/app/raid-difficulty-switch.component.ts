import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { GlideDirective } from './glide.directive';
import { RaidDifficulty } from './raid-logs';

/**
 * Normal / Heroic / Mythic. Each difficulty's kill count is a tooltip that shows at once on hover
 * or keyboard focus, and part of the button's label for screen readers. A difficulty without a
 * kill anywhere in the raid isn't shown (LFR, which the servers don't log); one without a kill of
 * this boss can't be picked.
 */
@Component({
  selector: 'app-raid-difficulty-switch',
  standalone: true,
  imports: [CommonModule, GlideDirective],
  template: `
    <div class="difficulty-switch" role="group" [attr.aria-label]="label" appGlide>
      <button
        type="button"
        *ngFor="let difficulty of shown; trackBy: trackDifficulty"
        [class.active]="difficulty.slug === selected"
        [attr.aria-pressed]="difficulty.slug === selected"
        [disabled]="!counts(difficulty)"
        [attr.aria-label]="tooltip(difficulty) ? difficulty.name + ', ' + tooltip(difficulty) : null"
        (click)="selectedChange.emit(difficulty.slug)">
        <span class="difficulty-dot" [ngClass]="difficulty.slug" aria-hidden="true"></span>
        <span>{{ difficulty.name === 'Looking For Raid' ? 'LFR' : difficulty.name }}</span>
        <span class="difficulty-tooltip" *ngIf="tooltip(difficulty) as text" aria-hidden="true">{{ text }}</span>
      </button>
    </div>
  `,
  styles: [`
    @use './raid-logs-shared' as *;
    :host { display: inline-block; max-width: 100%; }
    @include difficulty-switch;
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaidDifficultySwitchComponent {
  @Input({ required: true }) set difficulties(value: readonly RaidDifficulty[]) {
    this.shown = value.filter(difficulty => difficulty.kills > 0);
  }
  @Input() selected?: string;
  @Input() label = 'Difficulty';
  @Input() showCounts = true;
  /** Kills per difficulty slug; defaults to each difficulty's raid-wide count. */
  @Input() killCounts?: ReadonlyMap<string, number>;
  @Output() readonly selectedChange = new EventEmitter<string>();

  shown: readonly RaidDifficulty[] = [];

  counts(difficulty: RaidDifficulty): number {
    return this.killCounts ? this.killCounts.get(difficulty.slug) ?? 0 : difficulty.kills;
  }

  /** "3,527 kills"; without counts, only the reason a difficulty can't be picked. */
  tooltip(difficulty: RaidDifficulty): string | undefined {
    const kills = this.counts(difficulty);
    if (!kills) {
      return `No ${difficulty.name} kills are logged`;
    }
    return this.showCounts ? `${kills.toLocaleString('en-US')} ${kills === 1 ? 'kill' : 'kills'}` : undefined;
  }

  trackDifficulty(index: number, difficulty: RaidDifficulty): string {
    return difficulty.slug;
  }
}
