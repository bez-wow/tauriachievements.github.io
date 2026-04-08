import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, distinctUntilChanged, switchMap } from 'rxjs';
import { DEFAULT_GUILD_SOURCE_LIMIT } from './guild-presence-options';
import { GuildPresenceService } from './guild-presence.service';
import { GuildPresenceData } from './guild-presence.types';
import { DataSyncService } from './services/data-sync.service';
import { LadderLastUpdatedService } from './services/ladder-last-updated.service';

@Injectable()
export class GuildPresencePageStore {
  private readonly guildPresenceService = inject(GuildPresenceService);
  private readonly dataSyncService = inject(DataSyncService);
  private readonly ladderLastUpdatedService = inject(LadderLastUpdatedService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sourcePlayerCount = signal(this.dataSyncService.getCurrentPlayers().length);
  private readonly sourceLimit$ = new BehaviorSubject<number>(DEFAULT_GUILD_SOURCE_LIMIT);
  private hasStartedSync = false;
  private initialized = false;

  readonly guildPresence = signal<GuildPresenceData | null>(null);
  readonly isLoading = signal(this.sourcePlayerCount() === 0);
  readonly syncMessage = signal(this.isLoading() ? 'Loading guild rankings...' : '');
  readonly loadError = signal<string | undefined>(undefined);
  readonly lastEdited = signal<Date | undefined>(undefined);
  readonly lastEditedTimeZoneLabel = signal('Local time');
  readonly hasSourcePlayers = computed(() => this.sourcePlayerCount() > 0);

  constructor() {
    this.bindSourcePlayers();
    this.bindSyncProgress();
    this.bindGuildPresence();
  }

  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.loadLastUpdated();
    void this.syncData();
  }

  async syncData(): Promise<void> {
    this.hasStartedSync = true;
    this.loadError.set(undefined);

    if (!this.hasSourcePlayers()) {
      this.isLoading.set(true);
      this.syncMessage.set('Loading guild rankings...');
    }

    try {
      await this.dataSyncService.syncData();
      this.loadError.set(undefined);
    } catch (error) {
      console.error('Failed to sync guild presence data:', error);
      this.loadError.set('We could not load the guild rankings right now. Please try again in a moment.');
      this.isLoading.set(false);
      this.syncMessage.set('');
    }
  }

  setSourceLimit(limit: number): void {
    this.sourceLimit$.next(limit);
  }

  private bindSourcePlayers(): void {
    this.dataSyncService.getPlayers().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((players) => {
      this.sourcePlayerCount.set(players.length);
    });
  }

  private bindSyncProgress(): void {
    this.dataSyncService.getSyncProgress().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((progress) => {
      if (!this.hasStartedSync && !progress.isLoading && !this.hasSourcePlayers()) {
        return;
      }

      this.isLoading.set(progress.isLoading);
      this.syncMessage.set(progress.message);

      if (progress.isLoading) {
        this.loadError.set(undefined);
      }
    });
  }

  private bindGuildPresence(): void {
    this.sourceLimit$.pipe(
      distinctUntilChanged(),
      switchMap((limit) => this.guildPresenceService.getGuildPresence(limit)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((guildPresence) => {
      this.guildPresence.set(guildPresence);
    });
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
