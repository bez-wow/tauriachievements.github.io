import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, computed } from '@angular/core';
import { createCountdown } from './countdown';

/** Mythic release: 23 September 2026, 09:00 server time (CEST = UTC+2). */
const MYTHIC_RELEASE_MS = Date.UTC(2026, 8, 23, 7, 0, 0);
const MYTHIC_RELEASE_ISO = '2026-09-23T09:00:00+02:00';

@Component({
  selector: 'app-mythic-countdown',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mythic-countdown.component.html',
  styleUrls: ['./mythic-countdown.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.compact]': 'compact' }
})
export class MythicCountdownComponent {
  /** Slim single-row layout that sits between the ladder page panels. */
  @Input() compact = false;

  readonly releaseIso = MYTHIC_RELEASE_ISO;
  readonly countdown = createCountdown(MYTHIC_RELEASE_MS);
  readonly countdownLabel = computed(() => {
    const { days, hours, minutes, isReleased } = this.countdown();
    return isReleased
      ? 'Mythic Emerald Nightmare is live.'
      : `Mythic Emerald Nightmare opens in ${+days} days, ${+hours} hours and ${+minutes} minutes.`;
  });
}
