import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take } from 'rxjs';
import { getArmoryUrl, getGuildArmoryUrl } from '../utils/armory';
import { getClassIconPath } from '../utils/classIconHelper';
import { getRaceIconPath } from '../utils/raceIconHelper';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { ComparisonResult, ComparisonRow, buildPlayerComparison, getClassColor } from './compare';
import { LadderAchievement, LadderService, RankedLadderPlayer } from './ladder.service';
import { DataSyncService } from './services/data-sync.service';
import { LadderLastUpdatedService } from './services/ladder-last-updated.service';
import { UpdateBarComponent } from './update-bar.component';

type SlotId = 'a' | 'b';

const MAX_SUGGESTIONS = 8;
const MIN_SEARCH_LENGTH = 2;

@Component({
  selector: 'app-compare-page',
  templateUrl: './compare-page.component.html',
  styleUrls: ['./compare-page.component.scss'],
  standalone: true,
  imports: [CommonModule, UpdateBarComponent, BackToTopButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ComparePageComponent implements OnInit {
  private readonly ladderService = inject(LadderService);
  private readonly dataSyncService = inject(DataSyncService);
  private readonly ladderLastUpdatedService = inject(LadderLastUpdatedService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly lastEdited = signal<Date | undefined>(undefined);
  readonly lastEditedTimeZoneLabel = signal('Local time');

  private readonly allPlayers = signal<ReadonlyArray<LadderAchievement>>([]);
  readonly slotA = signal<RankedLadderPlayer | undefined>(undefined);
  readonly slotB = signal<RankedLadderPlayer | undefined>(undefined);
  readonly searchA = signal('');
  readonly searchB = signal('');

  readonly suggestionsA = computed(() => this.buildSuggestions(this.searchA(), this.slotB()));
  readonly suggestionsB = computed(() => this.buildSuggestions(this.searchB(), this.slotA()));
  readonly bothSelected = computed(() => !!this.slotA() && !!this.slotB());
  readonly comparison = computed<ComparisonResult | null>(() => {
    const a = this.slotA();
    const b = this.slotB();
    return a && b ? buildPlayerComparison(a, b) : null;
  });

  readonly getArmoryUrl = getArmoryUrl;
  readonly getGuildArmoryUrl = getGuildArmoryUrl;
  readonly getClassIconPath = getClassIconPath;
  readonly getRaceIconPath = getRaceIconPath;
  readonly getClassColor = getClassColor;

  ngOnInit(): void {
    this.bindPlayers();
    this.loadLastUpdated();
    void this.loadData();
  }

  retryLoad(): void {
    void this.loadData();
  }

  onSearch(slot: SlotId, value: string): void {
    if (slot === 'a') {
      this.searchA.set(value);
    } else {
      this.searchB.set(value);
    }
  }

  selectPlayer(slot: SlotId, player: LadderAchievement): void {
    this.ladderService.getRankedPlayer(player.name, player.realm).pipe(
      take(1),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((ranked) => {
      if (!ranked) {
        return;
      }

      this.setSlot(slot, ranked);
      this.onSearch(slot, '');
      this.updateUrl();
    });
  }

  clearSlot(slot: SlotId): void {
    this.setSlot(slot, undefined);
    this.onSearch(slot, '');
    this.updateUrl();
  }

  swap(): void {
    const a = this.slotA();
    this.slotA.set(this.slotB());
    this.slotB.set(a);
    this.updateUrl();
  }

  displayValue(row: ComparisonRow, slot: SlotId): string {
    if (row.kind === 'info') {
      return slot === 'a' ? row.aText : row.bText;
    }

    const value = slot === 'a' ? row.aValue : row.bValue;
    return value.toLocaleString();
  }

  isWinner(row: ComparisonRow, slot: SlotId): boolean {
    return row.kind === 'metric' && row.outcome === slot;
  }

  trackSuggestion(_index: number, player: LadderAchievement): string {
    return `${player.realm}::${player.name}`;
  }

  trackRow(_index: number, row: ComparisonRow): string {
    return row.label;
  }

  onImageError(event: Event): void {
    const image = event.target as HTMLImageElement | null;
    console.error('Failed to load image:', image?.src ?? 'unknown image');
  }

  private buildSuggestions(
    term: string,
    excluded: RankedLadderPlayer | undefined
  ): LadderAchievement[] {
    const normalized = term.trim().toLowerCase();
    if (normalized.length < MIN_SEARCH_LENGTH) {
      return [];
    }

    const excludedKey = excluded ? this.playerKey(excluded.realm, excluded.name) : '';
    const matches: LadderAchievement[] = [];

    for (const player of this.allPlayers()) {
      if (this.playerKey(player.realm, player.name) === excludedKey) {
        continue;
      }

      if (player.name.toLowerCase().includes(normalized) || player.guild.toLowerCase().includes(normalized)) {
        matches.push(player);
        if (matches.length >= MAX_SUGGESTIONS) {
          break;
        }
      }
    }

    return matches;
  }

  private setSlot(slot: SlotId, player: RankedLadderPlayer | undefined): void {
    if (slot === 'a') {
      this.slotA.set(player);
    } else {
      this.slotB.set(player);
    }
  }

  private bindPlayers(): void {
    this.ladderService.getAchievements(undefined, undefined, undefined, undefined, 1, Number.MAX_SAFE_INTEGER).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((players) => {
      this.allPlayers.set(players);
    });
  }

  private async loadData(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(undefined);

    try {
      await this.dataSyncService.syncData();
      this.isLoading.set(false);
      this.applyQueryParams(this.route.snapshot.queryParamMap);
    } catch (error) {
      console.error('Failed to load player comparison:', error);
      this.loadError.set('We could not load player data right now. Please try again in a moment.');
      this.isLoading.set(false);
    }
  }

  private applyQueryParams(params: ParamMap): void {
    const a = params.get('a');
    const b = params.get('b');

    if (a) {
      this.resolveIntoSlot('a', a);
    }

    if (b) {
      this.resolveIntoSlot('b', b);
    }
  }

  private resolveIntoSlot(slot: SlotId, key: string): void {
    const separator = key.indexOf(':');
    if (separator === -1) {
      return;
    }

    const realm = key.slice(0, separator);
    const name = key.slice(separator + 1);
    if (!realm || !name) {
      return;
    }

    this.ladderService.getRankedPlayer(name, realm).pipe(
      take(1),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((player) => {
      if (player) {
        this.setSlot(slot, player);
      }
    });
  }

  private updateUrl(): void {
    const a = this.slotA();
    const b = this.slotB();

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        a: a ? `${a.realm}:${a.name}` : null,
        b: b ? `${b.realm}:${b.name}` : null
      },
      replaceUrl: true
    });
  }

  private playerKey(realm: string, name: string): string {
    return `${realm}::${name}`.toLowerCase();
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
