import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { UpdateBarComponent } from './update-bar.component';

type BossKey = 'nythendra' | 'ursoc' | 'elerethe-renferal' | 'ilgynoth' |
  'dragons-of-nightmare' | 'cenarius' | 'xavius';
type RealmName = 'realm-name';

interface GuildKill {
  guild: string;
  realm?: RealmName;
  date?: string;
  time?: string;
}

type EmeraldNightmareDataset = Partial<Record<BossKey, GuildKill[]>>;

interface BossView {
  key: BossKey;
  name: string;
  iconUrl: string;
  guilds: GuildKill[];
}

interface CountdownView {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
  isReleased: boolean;
}

const BOSS_DETAILS: ReadonlyArray<Omit<BossView, 'guilds'>> = [
  { key: 'nythendra', name: 'Nythendra', iconUrl: 'assets/emerald-nightmare/01-nythendra.png' },
  { key: 'ilgynoth', name: "Il'gynoth", iconUrl: "assets/emerald-nightmare/02-il'gunoth.png" },
  { key: 'elerethe-renferal', name: 'Elerethe', iconUrl: 'assets/emerald-nightmare/03-elerethe.png' },
  { key: 'ursoc', name: 'Ursoc', iconUrl: 'assets/emerald-nightmare/04-ursoc.png' },
  { key: 'dragons-of-nightmare', name: 'Dragons', iconUrl: 'assets/emerald-nightmare/05-dragons-of-nightmare.png' },
  { key: 'cenarius', name: 'Cenarius', iconUrl: 'assets/emerald-nightmare/06-cenarius.png' },
  { key: 'xavius', name: 'Xavius', iconUrl: 'assets/emerald-nightmare/07-xavious.png' }
];

/** Mythic release: 26 September 2026, 09:00 server time (CEST = UTC+2). */
const MYTHIC_RELEASE_MS = Date.UTC(2026, 8, 26, 7, 0, 0);
const MYTHIC_RELEASE_ISO = '2026-09-26T09:00:00+02:00';

@Component({
  selector: 'app-emerald-nightmare-page',
  standalone: true,
  imports: [CommonModule, UpdateBarComponent, BackToTopButtonComponent],
  templateUrl: './emerald-nightmare-page.component.html',
  styleUrls: ['./emerald-nightmare-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmeraldNightmarePageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly bosses = signal<BossView[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);

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
    this.loadData();
    this.startCountdown();
  }

  retryLoad(): void {
    this.loadData();
  }

  trackBoss(index: number, boss: BossView): BossKey {
    return boss.key;
  }

  trackGuild(index: number): number {
    return index;
  }

  formatKillDate(date: string | undefined): string {
    if (!date) {
      return '';
    }

    const parsed = new Date(`${date}T00:00:00Z`);
    return Number.isNaN(parsed.getTime())
      ? date
      : new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
      }).format(parsed);
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

  private loadData(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.http.get<EmeraldNightmareDataset>(`EmeraldNightmare.json?v=${Date.now()}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.bosses.set(BOSS_DETAILS.map(details => ({
            ...details,
            guilds: this.fiveSlots(data[details.key])
          })));
          this.isLoading.set(false);
        },
        error: error => {
          console.error('Failed to load Emerald Nightmare progression:', error);
          this.loadError.set('The Emerald Nightmare guild data could not be loaded.');
          this.isLoading.set(false);
        }
      });
  }

  private fiveSlots(guilds: GuildKill[] | undefined): GuildKill[] {
    return Array.from({ length: 5 }, (_, index) => {
      const kill = guilds?.[index];
      return {
        guild: kill?.guild?.trim() ?? '',
        realm: kill?.realm,
        date: kill?.date?.trim() || undefined,
        time: kill?.time?.trim() || undefined
      };
    });
  }
}
