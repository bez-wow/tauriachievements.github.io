import { DOCUMENT, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ParamMap, RouterLink } from '@angular/router';
import { RaidDifficulty, RaidKillDetails, RaidLogsIndex } from './raid-logs.types';
import { defaultDifficulty } from './raid-logs';
import { SPEC_TOP_SCORES, scoresBySpecForKills } from './raid-scores';
import { FEW_PLAYERS, TIER_LIST_ROLES, describeTiers, roleTierList } from './raid-tier-list';
import { TierListImageInfo, renderTierListImage, saveImage, tierListImageName } from './raid-tier-list-image';
import { RaidLogsDataService } from './raid-logs-data.service';
import { RaidDifficultySwitchComponent } from './raid-difficulty-switch.component';
import { IconTipsComponent } from '../../shared/icon-tips.component';
import { LoadStateComponent } from '../../shared/load-state.component';
import { injectQueryParamMap, injectReplaceUrl } from '../../core/url-state';
import { setPageHeader } from '../../core/page-header';

@Component({
  selector: 'app-raid-logs-tier-list-page',
  imports: [RaidDifficultySwitchComponent, IconTipsComponent, LoadStateComponent, RouterLink, DecimalPipe],
  templateUrl: './raid-logs-tier-list-page.component.html',
  styleUrl: './raid-logs-tier-list-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaidLogsTierListPageComponent implements OnInit {
  private readonly data = inject(RaidLogsDataService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly replaceUrl = injectReplaceUrl();
  private readonly queryParamMap = injectQueryParamMap();

  readonly topScores = SPEC_TOP_SCORES;
  readonly fewPlayers = FEW_PLAYERS;
  readonly tierRule = describeTiers();
  readonly index = signal<RaidLogsIndex | undefined>(undefined);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly kills = signal<readonly RaidKillDetails[]>([]);
  readonly killsLoading = signal(false);
  readonly killsError = signal<string | undefined>(undefined);
  readonly saving = signal(false);
  readonly saveFailed = signal(false);
  readonly lastEdited = computed(() => this.index()?.generatedAt);

  private readonly requestedDifficulty = signal(this.data.lastDifficulty());

  readonly difficulty = computed(() => {
    const difficulties = this.index()?.difficulties ?? [];
    return difficulties.find(difficulty => difficulty.slug === this.requestedDifficulty() && difficulty.kills > 0)
      ?? defaultDifficulty(difficulties);
  });

  readonly tierLists = computed(() => {
    const scores = scoresBySpecForKills(this.index()?.bosses ?? [], this.kills());
    const difficulty = this.difficulty()?.slug ?? '';
    return TIER_LIST_ROLES.map(({ role, title }) => roleTierList(scores, role, title, difficulty));
  });

  readonly hasLogs = computed(() => this.tierLists().some(list => list.characterCount > 0));

  private killsRequest = 0;

  constructor() {
    setPageHeader(() => ({ lastEdited: this.lastEdited() }));
    this.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => this.applyUrl(params));
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.data.index()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: index => {
          this.index.set(index);
          this.isLoading.set(false);
          this.retryKills();
        },
        error: error => {
          console.error('Failed to load the raid logs:', error);
          this.loadError.set('The raid logs could not be loaded.');
          this.isLoading.set(false);
        }
      });
  }

  setDifficulty(slug: string): void {
    if (slug === this.difficulty()?.slug) {
      return;
    }

    this.requestedDifficulty.set(slug);
    this.data.lastDifficulty.set(slug);
    this.writeUrl();
    this.retryKills();
  }

  async download(): Promise<void> {
    const index = this.index();
    const difficulty = this.difficulty();
    if (!index || !difficulty || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.saveFailed.set(false);
    const info: TierListImageInfo = {
      raidName: index.raid.name,
      raidSlug: index.raid.slug,
      difficultySlug: difficulty.slug,
      difficultyName: difficulty.name,
      date: new Date()
    };
    try {
      saveImage(this.document, await renderTierListImage(this.document, this.tierLists(), info), tierListImageName(info));
    } catch (error) {
      console.error('Failed to save the tier list image:', error);
      this.saveFailed.set(true);
    } finally {
      this.saving.set(false);
    }
  }

  retryKills(): void {
    const index = this.index();
    const difficulty = this.difficulty();
    if (index && difficulty) {
      this.loadKills(index, difficulty);
    }
  }

  private applyUrl(params: ParamMap): void {
    const requested = params.get('difficulty');
    if (!requested) {
      return;
    }

    const shown = this.difficulty();
    this.requestedDifficulty.set(requested);
    this.data.lastDifficulty.set(requested);
    if (this.difficulty() !== shown) {
      this.retryKills();
    }
  }

  private loadKills(index: RaidLogsIndex, difficulty: RaidDifficulty): void {
    const request = ++this.killsRequest;
    this.kills.set([]);
    this.killsLoading.set(true);
    this.killsError.set(undefined);

    this.data.difficultyKills(index, difficulty)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: kills => {
          if (request !== this.killsRequest) {
            return;
          }
          this.kills.set(kills);
          this.killsLoading.set(false);
        },
        error: error => {
          if (request !== this.killsRequest) {
            return;
          }
          console.error('Failed to load the raid rosters:', error);
          this.killsError.set('The raid rosters could not be loaded.');
          this.killsLoading.set(false);
        }
      });
  }

  private writeUrl(): void {
    this.replaceUrl({ difficulty: this.difficulty()?.slug ?? null });
  }
}
