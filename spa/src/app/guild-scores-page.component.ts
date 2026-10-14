import { CommonModule, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { Subscription, forkJoin, of } from 'rxjs';
import { getClassIconPath } from '../utils/classIconHelper';
import { getLocalTimeZoneLabel } from '../utils/time-zone-label';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { getClassColor } from './class-colors';
import { injectCompactViewport } from './compact-viewport';
import { GuildAnalysis, GuildAnalysisKey, guildPage } from './guild-analysis';
import { GuildPageHeroComponent } from './guild-page-hero.component';
import {
  GuildMember,
  GuildRaidScoreRow,
  GuildScoreRow,
  GuildScores,
  easierDifficulty,
  guildMythicPlusScores,
  guildRaidScores
} from './guild-scores';
import { MYTHIC_PLUS_DATA_DIR, MythicPlusIndex, MythicPlusSeason, exportedAt } from './mythic-plus';
import { characterParam, characterProfileLink, pageOfRank } from './mythic-plus-profile';
import { MYTHIC_PLUS_CARDS_PAGE_SIZE, MYTHIC_PLUS_CARDS_QUERY, MYTHIC_PLUS_PAGE_SIZE } from './mythic-plus-views';
import { RaidDifficultySwitchComponent } from './raid-difficulty-switch.component';
import {
  RaidDifficulty,
  RaidLogsIndex,
  defaultDifficulty,
  raidCharacterLink,
  rankScores,
  scoreCharacters
} from './raid-logs';
import { DataFileService } from './services/data-file.service';
import { RaidLogsDataService } from './services/raid-logs-data.service';
import { UpdateBarComponent } from './update-bar.component';

interface RaidResult {
  difficulty: RaidDifficulty;
  scores: GuildScores<GuildRaidScoreRow>;
}

interface MythicPlusResult {
  season: MythicPlusSeason;
  generatedAt?: Date;
  scores: GuildScores<GuildScoreRow>;
}

/**
 * /<guild page>/scores: every level 110 member of the guild with their raid score (the raid
 * leaderboard's, on one difficulty) on the left and their Mythic+ score (the M+ players view's)
 * on the right. The raid side opens on the hardest difficulty where a member has a score;
 * `?difficulty=` picks one.
 */
@Component({
  selector: 'app-guild-scores-page',
  standalone: true,
  imports: [CommonModule, RouterLink, UpdateBarComponent, BackToTopButtonComponent, GuildPageHeroComponent, RaidDifficultySwitchComponent],
  templateUrl: './guild-scores-page.component.html',
  styleUrl: './guild-scores-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GuildScoresPageComponent {
  private readonly raidData = inject(RaidLogsDataService);
  private readonly dataFiles = inject(DataFileService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  private readonly routeData = this.route.snapshot.data;
  private readonly guild = guildPage(this.routeData['guild'] as GuildAnalysisKey | undefined);
  // Loaded by guildAnalysisResolver before the page is created; null when the load failed.
  private readonly analysis = this.routeData['analysis'] as GuildAnalysis | null | undefined;
  /** The guild file holds only level 110 characters. */
  private readonly members: readonly GuildMember[] = this.analysis?.players ?? [];

  readonly guildName = this.analysis?.guild?.name ?? this.guild.name;
  readonly realmName = this.analysis?.guild?.realm ?? this.guild.realm;
  readonly factionName = this.analysis?.guild?.faction;
  readonly loadFailed = !this.analysis;
  readonly memberCount = this.members.length;
  readonly statisticsLink = ['/', this.guild.path];

  readonly raidIndex = signal<RaidLogsIndex | undefined>(undefined);
  readonly raid = signal<RaidResult | undefined>(undefined);
  /** The difficulty being shown or loaded, so the switch moves as soon as one is picked. */
  readonly raidDifficulty = signal<string | undefined>(this.route.snapshot.queryParamMap.get('difficulty') ?? undefined);
  readonly raidLoading = signal(true);
  readonly raidError = signal<string | undefined>(undefined);
  readonly showUnscoredRaid = signal(false);

  readonly mythicPlus = signal<MythicPlusResult | undefined>(undefined);
  readonly mythicPlusLoading = signal(true);
  readonly mythicPlusError = signal<string | undefined>(undefined);
  readonly showUnscoredMythicPlus = signal(false);

  /** The newer of the two exports the scores come from. */
  readonly lastEdited = computed(() => {
    const dates = [this.raidIndex()?.generatedAt, this.mythicPlus()?.generatedAt]
      .filter((date): date is Date => date !== undefined);
    return dates.length ? new Date(Math.max(...dates.map(date => date.getTime()))) : undefined;
  });
  readonly lastEditedTimeZoneLabel = computed(() => getLocalTimeZoneLabel(this.lastEdited()));

  /** The M+ leaderboard pages by 25 below this width, by 50 above; the rank links open the right page. */
  private readonly mythicPlusCards = injectCompactViewport(MYTHIC_PLUS_CARDS_QUERY);

  readonly classIcon = getClassIconPath;
  readonly raidCharacterLink = raidCharacterLink;
  readonly mythicPlusProfileLink = (member: GuildMember) => characterProfileLink({ name: member.name, realm: this.realmName });

  private raidSubscription?: Subscription;
  private mythicPlusSubscription?: Subscription;

  constructor() {
    if (!this.loadFailed) {
      this.loadRaid();
      this.loadMythicPlus();
    }
  }

  loadRaid(): void {
    this.raidSubscription?.unsubscribe();
    this.raidLoading.set(true);
    this.raidError.set(undefined);
    this.raidSubscription = this.raidData.index()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: index => {
          this.raidIndex.set(index);
          const requested = index.difficulties.find(difficulty => difficulty.slug === this.raidDifficulty() && difficulty.kills > 0);
          const difficulty = requested ?? defaultDifficulty(index.difficulties);
          if (difficulty) {
            // Only a difficulty nobody picked steps down when no member has a score on it.
            this.loadRaidDifficulty(index, difficulty, !requested);
          } else {
            this.failRaid(undefined, 'No kills are logged yet.');
          }
        },
        error: error => this.failRaid(error)
      });
  }

  setRaidDifficulty(slug: string): void {
    const index = this.raidIndex();
    const difficulty = index?.difficulties.find(entry => entry.slug === slug);
    if (!index || !difficulty || slug === this.raidDifficulty()) {
      return;
    }

    this.loadRaidDifficulty(index, difficulty, false);
  }

  loadMythicPlus(): void {
    this.mythicPlusSubscription?.unsubscribe();
    this.mythicPlusLoading.set(true);
    this.mythicPlusError.set(undefined);
    this.mythicPlusSubscription = this.dataFiles.getJson<MythicPlusIndex>(`${MYTHIC_PLUS_DATA_DIR}/index.json`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: index => {
          const scores = guildMythicPlusScores(this.members, this.realmName, index);
          if (scores) {
            this.mythicPlus.set({ season: index.season, generatedAt: exportedAt(index), scores });
            this.mythicPlusLoading.set(false);
          } else {
            this.failMythicPlus(undefined, 'This Mythic+ export has no player scores.');
          }
        },
        error: error => this.failMythicPlus(error)
      });
  }

  classColor(member: GuildMember): string {
    return getClassColor(member.class) ?? '#e0e0e0';
  }

  /** The member on the raid leaderboard: the metric they're scored by, found by name. */
  raidLeaderboardParams(row: GuildRaidScoreRow, difficulty: RaidDifficulty): Params {
    return { difficulty: difficulty.slug, metric: row.metric === 'dps' ? null : row.metric, q: row.member.name };
  }

  raidRankLabel(row: GuildRaidScoreRow, difficulty: RaidDifficulty): string {
    return `#${row.leaderboardRank} on the ${difficulty.name} ${row.metric.toUpperCase()} leaderboard`;
  }

  /** The member's row on the M+ players view, highlighted on the page that shows it. */
  mythicPlusLeaderboardParams(row: GuildScoreRow): Params {
    const page = pageOfRank(row.leaderboardRank, this.mythicPlusCards() ? MYTHIC_PLUS_CARDS_PAGE_SIZE : MYTHIC_PLUS_PAGE_SIZE);
    return { view: 'players', character: characterParam({ name: row.member.name, realm: this.realmName }), page: page > 1 ? page : null };
  }

  trackRow(index: number, row: GuildScoreRow): string {
    return row.member.name;
  }

  trackMember(index: number, member: GuildMember): string {
    return member.name;
  }

  private loadRaidDifficulty(index: RaidLogsIndex, difficulty: RaidDifficulty, stepDown: boolean): void {
    this.raidSubscription?.unsubscribe();
    this.raidDifficulty.set(difficulty.slug);
    this.raidLoading.set(true);
    this.raidError.set(undefined);
    const files = index.bosses.map(boss => this.raidData.bossKills(index, boss, difficulty));
    this.raidSubscription = (files.length ? forkJoin(files) : of([]))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: bossKills => {
          // The leaderboard's unfiltered rankings, so each score and rank is the one it shows.
          const scores = guildRaidScores(this.members, this.realmName, {
            dps: rankScores(scoreCharacters(index.bosses, bossKills, 'dps')),
            hps: rankScores(scoreCharacters(index.bosses, bossKills, 'hps'))
          });
          const easier = stepDown && !scores.rows.length ? easierDifficulty(index.difficulties, difficulty) : undefined;
          if (easier) {
            this.loadRaidDifficulty(index, easier, true);
            return;
          }

          this.raid.set({ difficulty, scores });
          this.raidLoading.set(false);
          if (!stepDown) {
            this.writeUrl();
          }
        },
        error: error => this.failRaid(error)
      });
  }

  private failRaid(error: unknown, message = 'The raid scores could not be loaded.'): void {
    if (error !== undefined) {
      console.error('Failed to load the raid scores:', error);
    }
    this.raidError.set(message);
    this.raidLoading.set(false);
  }

  private failMythicPlus(error: unknown, message = 'The Mythic+ scores could not be loaded.'): void {
    if (error !== undefined) {
      console.error('Failed to load the Mythic+ scores:', error);
    }
    this.mythicPlusError.set(message);
    this.mythicPlusLoading.set(false);
  }

  /** A picked difficulty goes in the address bar without a navigation, so the scroll position stays. */
  private writeUrl(): void {
    const url = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: { difficulty: this.raidDifficulty() ?? null }
    });
    this.location.replaceState(this.router.serializeUrl(url));
  }
}
