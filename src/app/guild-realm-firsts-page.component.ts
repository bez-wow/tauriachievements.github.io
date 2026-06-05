import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { LadderLastUpdatedService } from './services/ladder-last-updated.service';
import { UpdateBarComponent } from './update-bar.component';

interface GuildRealmFirstResult {
  guild: string | null;
  youtubeVideoUrl: string;
}

interface GuildRealmFirstAchievement {
  name: string;
  iconUrl?: string;
  results: Record<string, GuildRealmFirstResult | undefined>;
}

interface GuildRealmFirstDataset {
  realms: string[];
  achievements: GuildRealmFirstAchievement[];
}

interface GuildRealmFirstCellView {
  realm: string;
  guild: string | null;
  videoUrl: string;
  hasVideo: boolean;
}

interface GuildRealmFirstExpansionView {
  name: string;
  logoUrl: string;
}

interface GuildRealmFirstAchievementView {
  name: string;
  iconUrl: string;
  expansion: GuildRealmFirstExpansionView | null;
  showsExpansionLogo: boolean;
  expansionRowSpan: number;
  startsExpansionGroup: boolean;
  cells: GuildRealmFirstCellView[];
}

const EXPANSION_GROUPS_BY_START_ACHIEVEMENT = new Map<string, GuildRealmFirstExpansionView>([
  [
    'Realm First! Xavius',
    {
      name: 'Legion',
      logoUrl: 'https://warcraft.wiki.gg/wiki/Special:Redirect/file/Legionlogo.png?width=180'
    }
  ],
  [
    'Realm First! Imperator\'s Fall',
    {
      name: 'Warlords of Draenor',
      logoUrl: 'https://warcraft.wiki.gg/wiki/Special:Redirect/file/WoDLogo.png?width=180'
    }
  ],
  [
    'Realm First! Garrosh Hellscream (25 player)',
    {
      name: 'Mists of Pandaria',
      logoUrl: 'https://warcraft.wiki.gg/wiki/Special:Redirect/file/MoPlogo.png?width=180'
    }
  ],
  [
    'Realm First! Deathwing',
    {
      name: 'Cataclysm',
      logoUrl: 'https://warcraft.wiki.gg/wiki/Special:Redirect/file/Cataclysmlogo.png?width=180'
    }
  ],
  [
    'Realm First! Fall of the Lich King',
    {
      name: 'Wrath of the Lich King',
      logoUrl: 'https://warcraft.wiki.gg/wiki/Special:Redirect/file/WrathLogo.png?width=180'
    }
  ]
]);

const LEGION_RELEASE_LABEL = 'Legion 15. July';
const POGCHAMP_EMOTE_URL = 'assets/pogchamp.png';

@Component({
  selector: 'app-guild-realm-firsts-page',
  templateUrl: './guild-realm-firsts-page.component.html',
  styleUrls: ['./guild-realm-firsts-page.component.scss'],
  standalone: true,
  imports: [CommonModule, UpdateBarComponent, BackToTopButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GuildRealmFirstsPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly lastUpdatedService = inject(LadderLastUpdatedService);
  private readonly destroyRef = inject(DestroyRef);

  readonly dataset = signal<GuildRealmFirstDataset | null>(null);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly lastEdited = signal<Date | undefined>(undefined);
  readonly lastEditedTimeZoneLabel = signal('Local time');
  readonly legionReleaseLabel = LEGION_RELEASE_LABEL;
  readonly pogchampEmoteUrl = POGCHAMP_EMOTE_URL;
  readonly realms = computed(() => this.dataset()?.realms ?? []);
  readonly rows = computed<ReadonlyArray<GuildRealmFirstAchievementView>>(() => {
    const dataset = this.dataset();
    if (!dataset) {
      return [];
    }

    const rows: GuildRealmFirstAchievementView[] = [];
    let activeExpansion: GuildRealmFirstExpansionView | null = null;
    let activeExpansionStartRow: GuildRealmFirstAchievementView | undefined;
    let activeExpansionRowSpan = 0;
    const updateActiveExpansionRowSpan = () => {
      if (activeExpansionStartRow) {
        activeExpansionStartRow.expansionRowSpan = activeExpansionRowSpan;
      }
    };

    for (const achievement of dataset.achievements) {
      const expansion = EXPANSION_GROUPS_BY_START_ACHIEVEMENT.get(achievement.name);
      if (expansion) {
        updateActiveExpansionRowSpan();
        activeExpansion = expansion;
        activeExpansionStartRow = undefined;
        activeExpansionRowSpan = 0;
      }

      const cells = dataset.realms.map((realm) => {
        const result = achievement.results?.[realm];
        const guild = this.normalizeGuild(result?.guild);
        const videoUrl = this.normalizeVideoUrl(result?.youtubeVideoUrl);

        return {
          realm,
          guild,
          videoUrl,
          hasVideo: guild !== null && videoUrl.length > 0
        };
      });

      const showsExpansionLogo = expansion !== undefined;
      const row = {
        name: achievement.name,
        iconUrl: this.normalizeIconUrl(achievement.iconUrl),
        expansion: activeExpansion,
        showsExpansionLogo,
        expansionRowSpan: 1,
        startsExpansionGroup: showsExpansionLogo && rows.length > 0,
        cells
      };

      rows.push(row);

      if (showsExpansionLogo) {
        activeExpansionStartRow = row;
      }

      if (activeExpansionStartRow) {
        activeExpansionRowSpan++;
      }
    }

    updateActiveExpansionRowSpan();
    return rows;
  });
  readonly hasRows = computed(() => this.rows().length > 0);

  ngOnInit(): void {
    this.loadGuildRealmFirsts();

    this.lastUpdatedService.getLastUpdated().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((lastUpdated) => {
      if (!lastUpdated) {
        return;
      }

      this.lastEdited.set(lastUpdated.date);
      this.lastEditedTimeZoneLabel.set(lastUpdated.timeZoneLabel);
    });
  }

  retryLoad(): void {
    this.loadGuildRealmFirsts();
  }

  trackRow(_index: number, row: GuildRealmFirstAchievementView): string {
    return row.name;
  }

  trackCell(_index: number, cell: GuildRealmFirstCellView): string {
    return cell.realm;
  }

  getVideoTitle(row: GuildRealmFirstAchievementView, cell: GuildRealmFirstCellView): string {
    return cell.guild
      ? `Watch ${cell.guild} - ${row.name} on ${cell.realm}`
      : `No ${cell.realm} winner recorded`;
  }

  private loadGuildRealmFirsts(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);

    this.http.get<GuildRealmFirstDataset>(`RealmFirstAchievements.json?v=${Date.now()}`).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (dataset) => {
        this.dataset.set(dataset);
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        console.error('Failed to load raid history:', error);
        this.dataset.set(null);
        this.loadError.set('We could not load raid history data right now. Please try again in a moment.');
        this.isLoading.set(false);
      }
    });
  }

  private normalizeGuild(value: string | null | undefined): string | null {
    const trimmedValue = value?.trim();
    return trimmedValue ? trimmedValue : null;
  }

  private normalizeIconUrl(value: string | null | undefined): string {
    return value?.trim() ?? '';
  }

  private normalizeVideoUrl(value: string | null | undefined): string {
    const trimmedValue = value?.trim() ?? '';
    if (!trimmedValue) {
      return '';
    }

    return /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|twitch\.tv)\//i.test(trimmedValue)
      ? trimmedValue
      : '';
  }
}
