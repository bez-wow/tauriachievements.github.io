import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, from } from 'rxjs';
import { getArmoryUrl, getGuildArmoryUrl } from '../utils/armory';
import { getClassIconPath } from '../utils/classIconHelper';
import { getRaceIconPath } from '../utils/raceIconHelper';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { buildRareAchievementCharacterKey } from './rare-achievement-groups';
import {
  buildRareAchievementNamesById,
  GLADIATOR_MOUNT_IDS,
  GLADIATOR_TITLE_IDS,
  REALM_FIRST_IDS,
  summarizeRareAchievements
} from './rare-achievement-summary';
import { RareAchievementsService } from './rare-achievements.service';
import {
  RareAchievementCharacter,
  RareAchievementsDataset,
  RareAchievementSummary
} from './rare-achievements.types';
import { Player } from './models/character.model';
import { DataSyncService } from './services/data-sync.service';
import { LadderLastUpdatedService } from './services/ladder-last-updated.service';
import { UpdateBarComponent } from './update-bar.component';

interface NewRareCharacterView {
  rank: number;
  name: string;
  realm: string;
  guild: string;
  race: number;
  gender: number;
  classId: number;
  faction: string;
  raceIcon: string;
  classIcon: string;
  achievementPoints: number;
  rareCount: number;
  gladiatorTitleCount: number;
  gladiatorMountCount: number;
  realmFirstCount: number;
  rareAchievementNames: ReadonlyArray<string>;
}

type RareDiscoveryCategory = 'gladiatorTitle' | 'gladiatorMount' | 'realmFirst';

@Component({
  selector: 'app-new-rare-characters-page',
  templateUrl: './new-rare-characters-page.component.html',
  styleUrls: ['./new-rare-characters-page.component.scss'],
  standalone: true,
  imports: [CommonModule, UpdateBarComponent, BackToTopButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NewRareCharactersPageComponent implements OnInit {
  private readonly dataSyncService = inject(DataSyncService);
  private readonly rareAchievementsService = inject(RareAchievementsService);
  private readonly ladderLastUpdatedService = inject(LadderLastUpdatedService);
  private readonly destroyRef = inject(DestroyRef);

  readonly players = signal<ReadonlyArray<Player>>([]);
  readonly rareAchievementsDataset = signal<RareAchievementsDataset | undefined>(undefined);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly lastEdited = signal<Date | undefined>(undefined);
  readonly lastEditedTimeZoneLabel = signal('Local time');
  readonly newRareCharacters = computed<ReadonlyArray<NewRareCharacterView>>(() => {
    const dataset = this.rareAchievementsDataset();
    if (!dataset) {
      return [];
    }

    const achievementNamesById = buildRareAchievementNamesById(dataset.achievements ?? []);
    const newPlayersByKey = new Map(
      this.players()
        .filter((player) => player.isNewCharacter)
        .map((player) => [buildRareAchievementCharacterKey(player.name, player.realm), player] as const)
    );

    return (dataset.characters ?? [])
      .map((character) => this.toNewRareCharacterView(character, newPlayersByKey, achievementNamesById))
      .filter((character): character is NewRareCharacterView => character !== undefined)
      .sort((left, right) => this.compareNewRareCharacters(left, right))
      .map((character, index) => ({
        ...character,
        rank: index + 1
      }));
  });
  readonly newRareCharacterCount = computed(() => this.newRareCharacters().length);
  readonly showEmptyState = computed(() => !this.isLoading() && !this.loadError() && this.newRareCharacterCount() === 0);

  readonly getArmoryUrl = getArmoryUrl;
  readonly getGuildArmoryUrl = getGuildArmoryUrl;

  ngOnInit(): void {
    this.loadData();
  }

  retryLoad(): void {
    this.loadData();
  }

  trackCharacter(_index: number, character: NewRareCharacterView): string {
    return `${character.realm}::${character.name}`;
  }

  trackRareAchievementName(index: number, _name: string): number {
    return index;
  }

  getCharacterLinkTitle(character: NewRareCharacterView): string {
    return `New rare character found\n${character.rareAchievementNames.join('\n')}`;
  }

  onImageError(event: Event): void {
    const image = event.target as HTMLImageElement | null;
    console.error('Failed to load image:', image?.src ?? 'unknown image');
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);

    forkJoin({
      sync: from(this.dataSyncService.syncData()),
      rareAchievementsDataset: this.rareAchievementsService.getRareAchievements(),
      lastUpdated: this.ladderLastUpdatedService.getLastUpdated()
    }).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: ({ rareAchievementsDataset, lastUpdated }) => {
        this.players.set(this.dataSyncService.getCurrentPlayers());
        this.rareAchievementsDataset.set(rareAchievementsDataset);
        this.lastEdited.set(lastUpdated?.date);
        this.lastEditedTimeZoneLabel.set(lastUpdated?.timeZoneLabel ?? 'Local time');
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        console.error('Failed to load new rare characters:', error);
        this.players.set([]);
        this.rareAchievementsDataset.set(undefined);
        this.loadError.set('We could not load the new rare characters right now. Please try again in a moment.');
        this.isLoading.set(false);
      }
    });
  }

  private toNewRareCharacterView(
    character: RareAchievementCharacter,
    newPlayersByKey: ReadonlyMap<string, Player>,
    achievementNamesById: ReadonlyMap<number, string>
  ): NewRareCharacterView | undefined {
    const player = newPlayersByKey.get(buildRareAchievementCharacterKey(character.name, character.realm));
    if (!player) {
      return undefined;
    }

    const summary = summarizeRareAchievements(character, achievementNamesById);
    if (!this.hasTrackedRareDiscovery(summary)) {
      return undefined;
    }

    const rareAchievementNames = this.collectRareDiscoveryAchievementNames(character, achievementNamesById);
    if (rareAchievementNames.length === 0) {
      return undefined;
    }

    return {
      rank: 0,
      name: player.name,
      realm: player.realm,
      guild: player.guild,
      race: player.race,
      gender: player.gender,
      classId: player.class,
      faction: player.faction,
      raceIcon: getRaceIconPath(player.race, player.gender),
      classIcon: getClassIconPath(player.class),
      achievementPoints: player.achievementPoints,
      rareCount: rareAchievementNames.length,
      gladiatorTitleCount: summary?.gladiatorTitleCount ?? 0,
      gladiatorMountCount: summary?.gladiatorMountCount ?? 0,
      realmFirstCount: summary?.realmFirstCount ?? 0,
      rareAchievementNames
    };
  }

  private hasTrackedRareDiscovery(summary: RareAchievementSummary | undefined): boolean {
    return !!summary && (
      summary.gladiatorTitleCount > 0
      || summary.gladiatorMountCount > 0
      || summary.realmFirstCount > 0
    );
  }

  private collectRareDiscoveryAchievementNames(
    character: RareAchievementCharacter,
    achievementNamesById: ReadonlyMap<number, string>
  ): string[] {
    return character.achievements
      .filter((achievement) => this.getRareDiscoveryCategory(achievement.id) !== undefined)
      .sort((left, right) => this.compareRareDiscoveryAchievements(left.id, right.id))
      .map((achievement) => achievementNamesById.get(achievement.id) ?? `Achievement #${achievement.id}`);
  }

  private compareRareDiscoveryAchievements(leftId: number, rightId: number): number {
    const leftCategory = this.getRareDiscoveryCategory(leftId);
    const rightCategory = this.getRareDiscoveryCategory(rightId);
    const categoryResult = this.getRareDiscoveryCategoryRank(leftCategory)
      - this.getRareDiscoveryCategoryRank(rightCategory);

    if (categoryResult !== 0) {
      return categoryResult;
    }

    return leftId - rightId;
  }

  private getRareDiscoveryCategory(achievementId: number): RareDiscoveryCategory | undefined {
    if (GLADIATOR_TITLE_IDS.has(achievementId)) {
      return 'gladiatorTitle';
    }

    if (GLADIATOR_MOUNT_IDS.has(achievementId)) {
      return 'gladiatorMount';
    }

    if (REALM_FIRST_IDS.has(achievementId)) {
      return 'realmFirst';
    }

    return undefined;
  }

  private getRareDiscoveryCategoryRank(category: RareDiscoveryCategory | undefined): number {
    switch (category) {
      case 'gladiatorTitle':
        return 0;
      case 'gladiatorMount':
        return 1;
      case 'realmFirst':
        return 2;
      default:
        return 3;
    }
  }

  private compareNewRareCharacters(left: NewRareCharacterView, right: NewRareCharacterView): number {
    if (right.rareCount !== left.rareCount) {
      return right.rareCount - left.rareCount;
    }

    if (right.achievementPoints !== left.achievementPoints) {
      return right.achievementPoints - left.achievementPoints;
    }

    const realmResult = left.realm.localeCompare(right.realm);
    if (realmResult !== 0) {
      return realmResult;
    }

    return left.name.localeCompare(right.name);
  }
}
