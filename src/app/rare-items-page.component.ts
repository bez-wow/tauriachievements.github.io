import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, from } from 'rxjs';
import { getArmoryUrl } from '../utils/armory';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { DataSyncService } from './services/data-sync.service';

interface RareItem {
  id: number;
  name: string;
}

interface RareItemCharacter {
  name: string;
  realm: string;
  items: ReadonlyArray<RareItem>;
}

interface RareItemsDataset {
  generatedAt: string;
  items: ReadonlyArray<RareItem>;
  characters: ReadonlyArray<RareItemCharacter>;
}

type RealmFilter = 'all' | 'Evermoon' | 'Tauri' | 'WoD';

const CLASS_COLORS: Readonly<Record<number, string>> = {
  1: '#C69B6D',
  2: '#F48CBA',
  3: '#AAD372',
  4: '#FFF468',
  5: '#FFFFFF',
  6: '#C41E3A',
  7: '#0070DD',
  8: '#3FC7EB',
  9: '#8788EE',
  10: '#00FF98',
  11: '#FF7C0A',
  12: '#A330C9'
};

@Component({
  selector: 'app-rare-items-page',
  templateUrl: './rare-items-page.component.html',
  styleUrls: ['./rare-items-page.component.scss'],
  standalone: true,
  imports: [CommonModule, BackToTopButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RareItemsPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dataSyncService = inject(DataSyncService);
  private readonly destroyRef = inject(DestroyRef);

  readonly dataset = signal<RareItemsDataset | undefined>(undefined);
  readonly selectedItemId = signal<number | undefined>(undefined);
  readonly selectedRealm = signal<RealmFilter>('all');
  readonly playerClasses = signal<ReadonlyMap<string, number>>(new Map());
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);

  readonly selectedItem = computed(() =>
    this.dataset()?.items.find(item => item.id === this.selectedItemId())
  );
  readonly matchingCharacters = computed(() => {
    const itemId = this.selectedItemId();
    if (itemId === undefined) {
      return [];
    }

    return (this.dataset()?.characters ?? [])
      .filter(character =>
        character.items.some(item => item.id === itemId)
        && (this.selectedRealm() === 'all' || character.realm === this.selectedRealm())
      )
      .sort((left, right) => {
        const realmResult = left.realm.localeCompare(right.realm);
        return realmResult || left.name.localeCompare(right.name);
      });
  });

  readonly getArmoryUrl = getArmoryUrl;

  ngOnInit(): void {
    this.loadData();
  }

  selectItem(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedItemId.set(value ? Number(value) : undefined);
  }

  selectRealm(event: Event): void {
    this.selectedRealm.set((event.target as HTMLSelectElement).value as RealmFilter);
  }

  retryLoad(): void {
    this.loadData();
  }

  trackCharacter(_index: number, character: RareItemCharacter): string {
    return `${character.realm}::${character.name}`;
  }

  getCharacterClassColor(character: RareItemCharacter): string {
    const classId = this.playerClasses().get(this.buildCharacterKey(character.name, character.realm));
    return classId === undefined ? '#b7df86' : (CLASS_COLORS[classId] ?? '#b7df86');
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);

    forkJoin({
      dataset: this.http.get<RareItemsDataset>(`RareItems.json?v=${Date.now()}`),
      playerSync: from(this.dataSyncService.ensureCompleteData())
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ dataset }) => {
          this.dataset.set(dataset);
          this.playerClasses.set(new Map(
            this.dataSyncService.getCurrentPlayers().map(player => [
              this.buildCharacterKey(player.name, player.realm),
              player.class
            ])
          ));
          this.isLoading.set(false);
        },
        error: error => {
          console.error('Failed to load rare items:', error);
          this.loadError.set('The rare-item data could not be loaded. Please try again.');
          this.isLoading.set(false);
        }
      });
  }

  private buildCharacterKey(name: string, realm: string): string {
    return `${realm}::${name}`;
  }
}
