import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { createCountdown } from './countdown';

/** Mythic+ Season 1 opens: 16 September 2026, 09:00 server time (CEST = UTC+2). */
const MYTHIC_PLUS_RELEASE_ISO = '2026-09-16T09:00:00+02:00';

/** Full-screen countdown shown over the blurred, pre-season Mythic+ page. */
@Component({
  selector: 'app-mythic-plus-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mythic-plus-preview.component.html',
  styleUrls: ['./mythic-plus-preview.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusPreviewComponent {
  readonly releaseIso = MYTHIC_PLUS_RELEASE_ISO;
  readonly countdown = createCountdown(Date.parse(MYTHIC_PLUS_RELEASE_ISO));

  readonly units = computed(() => {
    const { days, hours, minutes, seconds } = this.countdown();
    return [
      { value: days, label: 'Days' },
      { value: hours, label: 'Hours' },
      { value: minutes, label: 'Minutes' },
      { value: seconds, label: 'Seconds' }
    ];
  });

  readonly label = computed(() => {
    const { days, hours, minutes, isReleased } = this.countdown();
    return isReleased
      ? 'Mythic+ is live.'
      : `Mythic+ opens in ${+days} days, ${+hours} hours and ${+minutes} minutes.`;
  });
}
