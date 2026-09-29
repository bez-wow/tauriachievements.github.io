import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DEFAULT_GUILD_SOURCE_LIMIT } from './guild-presence-options';
import { GuildPresenceService } from './guild-presence.service';
import { GuildPresenceData, GuildPresenceSnapshot } from './guild-presence.types';
import { LadderLastUpdatedService } from './services/ladder-last-updated.service';

@Injectable()
export class GuildPresencePageStore {
  private readonly guildPresenceService = inject(GuildPresenceService);
  private readonly ladderLastUpdatedService = inject(LadderLastUpdatedService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly snapshot = signal<GuildPresenceSnapshot | null>(null);
  private readonly sourceLimit = signal(DEFAULT_GUILD_SOURCE_LIMIT);
  private initialized = false;

  readonly guildPresence = computed<GuildPresenceData | null>(
    () => this.snapshot()?.limits[this.sourceLimit()] ?? null
  );
  readonly isLoading = signal(true);
  readonly syncMessage = signal('Loading guild rankings...');
  readonly loadError = signal<string | undefined>(undefined);
  readonly lastEdited = signal<Date | undefined>(undefined);
  readonly lastEditedTimeZoneLabel = signal('Local time');
  readonly hasSourcePlayers = computed(() => this.snapshot() !== null);

  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.loadLastUpdated();
    void this.syncData();
  }

  syncData(): Promise<void> {
    this.isLoading.set(true);
    this.syncMessage.set('Loading guild rankings...');
    this.loadError.set(undefined);

    return new Promise((resolve) => {
      this.guildPresenceService.getGuildRankings().pipe(
        takeUntilDestroyed(this.destroyRef)
      ).subscribe({
        next: (snapshot) => {
          this.snapshot.set(snapshot);
          this.isLoading.set(false);
          this.syncMessage.set('');
          resolve();
        },
        error: (error: unknown) => {
          console.error('Failed to load guild rankings:', error);
          this.loadError.set('We could not load the guild rankings right now. Please try again in a moment.');
          this.isLoading.set(false);
          this.syncMessage.set('');
          resolve();
        }
      });
    });
  }

  setSourceLimit(limit: number): void {
    this.sourceLimit.set(limit);
  }

  private loadLastUpdated(): void {
    this.ladderLastUpdatedService.getLastUpdated().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((lastUpdated) => {
      if (!lastUpdated) {
        return;
      }

      this.lastEdited.set(lastUpdated.date);
      this.lastEditedTimeZoneLabel.set(lastUpdated.timeZoneLabel);
    });
  }
}
