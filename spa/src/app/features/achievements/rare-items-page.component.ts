import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { getArmoryUrl } from '../../game/armory';
import { DataFileService } from '../../core/data-file.service';
import { getClassColor } from '../../game/class-colors';
import { Realm } from '../../game/wow';

interface RareItem {
  id: number;
  name: string;
}

interface RareItemCharacter {
  name: string;
  realm: string;
  race: number;
  gender: number;
  class: number;
  guild: string;
  items: ReadonlyArray<RareItem>;
}

interface RareItemsDataset {
  generatedAt: string;
  items: ReadonlyArray<RareItem>;
  characters: ReadonlyArray<RareItemCharacter>;
}

type RealmFilter = 'all' | Realm;

@Component({
  selector: 'app-rare-items-page',
  templateUrl: './rare-items-page.component.html',
  styleUrls: ['./rare-items-page.component.scss'],
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RareItemsPageComponent implements OnInit {
  private readonly dataFiles = inject(DataFileService);
  private readonly destroyRef = inject(DestroyRef);

  readonly dataset = signal<RareItemsDataset | undefined>(undefined);
  readonly selectedItemId = signal<number | undefined>(undefined);
  readonly selectedRealm = signal<RealmFilter>('all');
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

  getCharacterClassColor(character: RareItemCharacter): string {
    return getClassColor(character.class) ?? '#b7df86';
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);

    this.dataFiles.getJson<RareItemsDataset>('RareItems.json')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (dataset) => {
          this.dataset.set(dataset);
          this.isLoading.set(false);
        },
        error: error => {
          console.error('Failed to load rare items:', error);
          this.loadError.set('The rare-item data could not be loaded. Please try again.');
          this.isLoading.set(false);
        }
      });
  }
}
