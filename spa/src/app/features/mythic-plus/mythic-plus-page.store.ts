import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MythicPlusIndex, MythicPlusRun, NEWER_DATA_MESSAGE } from './mythic-plus';
import { MythicPlusDataService, NewerExportError } from './mythic-plus-data.service';

@Injectable()
export class MythicPlusPageStore {
  private readonly mythicPlusData = inject(MythicPlusDataService);
  private readonly destroyRef = inject(DestroyRef);

  readonly index = signal<MythicPlusIndex | undefined>(undefined);
  readonly runsByDungeon = signal<ReadonlyMap<string, readonly MythicPlusRun[]>>(new Map());
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly selectedDungeonId = signal<string | undefined>(undefined);
  readonly restarts = signal(0);

  readonly dungeons = computed(() => this.index()?.dungeons ?? []);
  readonly selectedDungeon = computed(() =>
    this.dungeons().find(dungeon => dungeon.id === this.selectedDungeonId()));

  private loadedIndex?: MythicPlusIndex;
  private readonly requestedDungeons = new Set<string>();
  private reloadedForNewerData = false;

  load(dungeonId: string | undefined): void {
    this.selectedDungeonId.set(dungeonId);
    this.loadIndex();
  }

  retry(): void {
    if (this.reloadedForNewerData) {
      this.startOver();
    } else if (this.index()) {
      this.loadError.set(undefined);
      this.loadScopeRuns();
    } else {
      this.loadIndex();
    }
  }

  loadScopeRuns(): void {
    const index = this.loadedIndex;
    if (!index) {
      return;
    }

    const selected = this.selectedDungeon();
    const needed = selected ? [selected] : this.dungeons();

    for (const dungeon of needed) {
      if (this.requestedDungeons.has(dungeon.id)) {
        continue;
      }

      this.requestedDungeons.add(dungeon.id);
      this.mythicPlusData.dungeonRuns(index, dungeon.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: runs => {
            if (index === this.loadedIndex) {
              this.runsByDungeon.update(loaded => new Map(loaded).set(dungeon.id, runs));
            }
          },
          error: error => {
            if (index !== this.loadedIndex) {
              return;
            }
            if (error instanceof NewerExportError) {
              this.reloadForNewerData(error);
              return;
            }
            this.requestedDungeons.delete(dungeon.id);
            this.failLoad(error);
          }
        });
    }
  }

  private loadIndex(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.mythicPlusData.index()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: index => {
          this.loadedIndex = index;
          this.index.set(index);
          this.isLoading.set(false);
          this.loadScopeRuns();
        },
        error: error => this.failLoad(error)
      });
  }

  private reloadForNewerData(error: NewerExportError): void {
    const firstTime = !this.reloadedForNewerData;
    this.reloadedForNewerData = true;
    if (firstTime) {
      this.startOver();
      return;
    }

    this.loadedIndex = undefined;
    this.failLoad(error, NEWER_DATA_MESSAGE);
  }

  private startOver(): void {
    this.mythicPlusData.refresh();
    this.loadedIndex = undefined;
    this.requestedDungeons.clear();
    this.runsByDungeon.set(new Map());
    this.restarts.update(count => count + 1);
    this.loadIndex();
  }

  private failLoad(error: unknown, message = 'The Mythic+ leaderboard could not be loaded.'): void {
    console.error('Failed to load Mythic+ leaderboard:', error);
    this.loadError.set(message);
    this.isLoading.set(false);
  }
}
