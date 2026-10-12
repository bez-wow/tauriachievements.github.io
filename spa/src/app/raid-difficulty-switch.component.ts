import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { GlideDirective } from './glide.directive';
import { RaidDifficulty } from './raid-logs';

/**
 * Normal / Heroic / Mythic. A difficulty without a kill anywhere in the raid isn't shown (LFR,
 * which the servers don't log); one without a kill of this boss can't be picked.
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
        (click)="selectedChange.emit(difficulty.slug)">
        <span class="difficulty-dot" [ngClass]="difficulty.slug" aria-hidden="true"></span>
        <span>{{ difficulty.name === 'Looking For Raid' ? 'LFR' : difficulty.name }}</span>
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
  /** Kills per difficulty slug; defaults to each difficulty's raid-wide count. */
  @Input() killCounts?: ReadonlyMap<string, number>;
  @Output() readonly selectedChange = new EventEmitter<string>();

  shown: readonly RaidDifficulty[] = [];

  counts(difficulty: RaidDifficulty): number {
    return this.killCounts ? this.killCounts.get(difficulty.slug) ?? 0 : difficulty.kills;
  }

  trackDifficulty(index: number, difficulty: RaidDifficulty): string {
    return difficulty.slug;
  }
}
