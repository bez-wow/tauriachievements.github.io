import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, Input, OnInit, computed, inject, signal } from '@angular/core';

interface CountdownView {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
  isReleased: boolean;
}

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
export class MythicCountdownComponent implements OnInit {
  /** Slim single-row layout that sits between the ladder page panels. */
  @Input() compact = false;

  private readonly destroyRef = inject(DestroyRef);

  readonly releaseIso = MYTHIC_RELEASE_ISO;
  readonly countdown = signal<CountdownView>(this.computeCountdown(Date.now()));
  readonly countdownLabel = computed(() => {
    const { days, hours, minutes, isReleased } = this.countdown();
    return isReleased
      ? 'Mythic Emerald Nightmare is live.'
      : `Mythic Emerald Nightmare opens in ${+days} days, ${+hours} hours and ${+minutes} minutes.`;
  });

  private countdownTimer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.startCountdown();
  }

  private startCountdown(): void {
    this.tickCountdown();

    if (this.countdown().isReleased) {
      return;
    }

    this.countdownTimer = setInterval(() => this.tickCountdown(), 1000);
    this.destroyRef.onDestroy(() => this.stopCountdown());
  }

  private tickCountdown(): void {
    const next = this.computeCountdown(Date.now());
    this.countdown.set(next);

    if (next.isReleased) {
      this.stopCountdown();
    }
  }

  private stopCountdown(): void {
    if (this.countdownTimer !== undefined) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = undefined;
    }
  }

  private computeCountdown(now: number): CountdownView {
    const remaining = MYTHIC_RELEASE_MS - now;

    if (remaining <= 0) {
      return { days: '00', hours: '00', minutes: '00', seconds: '00', isReleased: true };
    }

    const totalSeconds = Math.floor(remaining / 1000);
    return {
      days: this.pad(Math.floor(totalSeconds / 86400)),
      hours: this.pad(Math.floor(totalSeconds / 3600) % 24),
      minutes: this.pad(Math.floor(totalSeconds / 60) % 60),
      seconds: this.pad(totalSeconds % 60),
      isReleased: false
    };
  }

  private pad(value: number): string {
    return String(value).padStart(2, '0');
  }
}
