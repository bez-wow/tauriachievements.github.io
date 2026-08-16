import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { LadderLastUpdatedService } from './services/ladder-last-updated.service';
import { UpdateBarComponent } from './update-bar.component';

type BossKey = 'nythendra' | 'ursoc' | 'elerethe-renferal' | 'ilgynoth' |
  'dragons-of-nightmare' | 'cenarius' | 'xavius';
type EmeraldNightmareDataset = Record<BossKey, string[]>;

interface BossView {
  key: BossKey;
  name: string;
  iconUrl: string;
  guilds: string[];
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
  private readonly lastUpdatedService = inject(LadderLastUpdatedService);

  readonly bosses = signal<BossView[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly lastEdited = signal<Date | undefined>(undefined);
  readonly lastEditedTimeZoneLabel = signal('Local time');

  ngOnInit(): void {
    this.loadData();
    this.lastUpdatedService.getLastUpdated().pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(lastUpdated => {
        if (lastUpdated) {
          this.lastEdited.set(lastUpdated.date);
          this.lastEditedTimeZoneLabel.set(lastUpdated.timeZoneLabel);
        }
      });
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

  private loadData(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.http.get<Partial<EmeraldNightmareDataset>>(`EmeraldNightmare.json?v=${Date.now()}`)
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

  private fiveSlots(guilds: string[] | undefined): string[] {
    return Array.from({ length: 5 }, (_, index) => guilds?.[index]?.trim() ?? '');
  }
}
