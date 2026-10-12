import { CommonModule, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { getClassIconPath } from '../utils/classIconHelper';
import { getLocalTimeZoneLabel } from '../utils/time-zone-label';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { getClassColor } from './class-colors';
import { RaidDifficultySwitchComponent } from './raid-difficulty-switch.component';
import {
  GuildProgress,
  RaidBoss,
  RaidKill,
  RaidLogsIndex,
  RaidPerformer,
  bossesInKillOrder,
  defaultDifficulty,
  encounterKey,
  fastestKills,
  formatAgo,
  formatFightTime,
  formatPerSecond,
  guildKey,
  guildProgression,
  latestKills,
  logKey,
  raidBossLink,
  raidCharacterLink,
  raidGuildLink,
  raidLogLink
} from './raid-logs';
import { RevealDirective } from './reveal.directive';
import { RaidLogsDataService } from './services/raid-logs-data.service';
import { UpdateBarComponent } from './update-bar.component';

interface BossCard {
  boss: RaidBoss;
  kills: number;
  fastest?: RaidKill;
  dps?: RaidPerformer;
  hps?: RaidPerformer;
}

interface SummaryTile {
  label: string;
  value: string;
  note: string;
}

/** How many guilds the progression table shows before "Show all". */
const PROGRESSION_PREVIEW = 20;
const RECENT_KILLS = 12;

/**
 * /raid-logs: the raid at a glance on one difficulty (`?difficulty=`): each boss's kills, fastest
 * kill and best damage and healing, the guilds' progress, and the latest kills. Reads only the
 * index; the boss pages load the members.
 */
@Component({
  selector: 'app-raid-logs-page',
  standalone: true,
  imports: [CommonModule, RouterLink, UpdateBarComponent, BackToTopButtonComponent, RaidDifficultySwitchComponent, RevealDirective],
  templateUrl: './raid-logs-page.component.html',
  styleUrl: './raid-logs-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaidLogsPageComponent implements OnInit {
  private readonly data = inject(RaidLogsDataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  readonly index = signal<RaidLogsIndex | undefined>(undefined);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly now = signal(Date.now());
  readonly lastEdited = computed(() => this.index()?.generatedAt);
  readonly lastEditedTimeZoneLabel = computed(() => getLocalTimeZoneLabel(this.lastEdited()));

  private readonly requestedDifficulty = signal(this.route.snapshot.queryParamMap.get('difficulty') ?? undefined);
  readonly showAllGuilds = signal(false);
  readonly bosses = computed(() => this.index()?.bosses ?? []);
  /** The progress squares' order: the order raiders kill the bosses. */
  readonly pipBosses = computed(() => bossesInKillOrder(this.bosses()));

  readonly difficulty = computed(() => {
    const difficulties = this.index()?.difficulties ?? [];
    return difficulties.find(difficulty => difficulty.slug === this.requestedDifficulty() && difficulty.kills > 0)
      ?? defaultDifficulty(difficulties);
  });

  readonly kills = computed(() => {
    const difficulty = this.difficulty();
    return (this.index()?.kills ?? []).filter(kill => kill.difficulty === difficulty);
  });

  readonly bossCards = computed<BossCard[]>(() => {
    const index = this.index();
    const difficulty = this.difficulty();
    if (!index || !difficulty) {
      return [];
    }

    return index.bosses.map(boss => {
      const kills = this.kills().filter(kill => kill.boss === boss);
      const top = index.top.get(encounterKey(boss.slug, difficulty.slug));
      return { boss, kills: kills.length, fastest: fastestKills(kills)[0], dps: top?.dps, hps: top?.hps };
    });
  });

  readonly progression = computed<GuildProgress[]>(() =>
    guildProgression(this.kills(), this.difficulty()?.id ?? 0, this.index()?.bosses.length ?? 0));

  readonly shownProgression = computed(() =>
    this.showAllGuilds() ? this.progression() : this.progression().slice(0, PROGRESSION_PREVIEW));

  readonly recentKills = computed(() => latestKills(this.kills()).slice(0, RECENT_KILLS));

  readonly summary = computed<SummaryTile[]>(() => {
    const kills = this.kills();
    const bossCount = this.index()?.bosses.length ?? 0;
    const progression = this.progression();
    const cleared = progression.filter(row => row.killed === bossCount);
    const latest = latestKills(kills)[0];
    const characters = kills.reduce((sum, kill) => sum + kill.memberCount, 0);
    return [
      { label: 'Kills', value: kills.length.toLocaleString('en-US'), note: `${characters.toLocaleString('en-US')} player kills` },
      {
        label: 'Guilds with a kill',
        value: String(progression.length),
        note: `${kills.filter(kill => !kill.guild).length.toLocaleString('en-US')} kills by pickup groups`
      },
      {
        label: `Full clears (${bossCount}/${bossCount})`,
        value: String(cleared.length),
        note: cleared[0] ? `First: ${cleared[0].guild.name}` : 'Nobody yet'
      },
      {
        label: 'Latest kill',
        value: latest ? formatAgo(latest.killedAt, this.now()) : '-',
        note: latest ? `${latest.boss.shortName}, ${latest.guild?.name || 'pickup group'}` : 'No kills yet'
      }
    ];
  });

  readonly bossLink = raidBossLink;
  readonly logLink = raidLogLink;
  readonly guildLink = raidGuildLink;
  readonly characterLink = raidCharacterLink;
  readonly formatFightTime = formatFightTime;
  readonly formatPerSecond = formatPerSecond;
  readonly classIcon = getClassIconPath;
  readonly previewSize = PROGRESSION_PREVIEW;

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
          this.now.set(Date.now());
          this.isLoading.set(false);
        },
        error: error => {
          console.error('Failed to load the raid logs:', error);
          this.loadError.set('The raid logs could not be loaded.');
          this.isLoading.set(false);
        }
      });
  }

  setDifficulty(slug: string): void {
    this.requestedDifficulty.set(slug);
    this.showAllGuilds.set(false);
    this.writeUrl();
  }

  classColor(classId: number): string {
    return getClassColor(classId) ?? '#e0e0e0';
  }

  ago(kill: RaidKill): string {
    return formatAgo(kill.killedAt, this.now());
  }

  /** The tooltip of a progress pip: the boss, and when the guild first killed it. */
  pipTitle(boss: RaidBoss, kill: RaidKill | undefined): string {
    return kill ? `${boss.shortName}: first kill ${new Date(kill.killedAt).toLocaleDateString('en-GB')}` : `${boss.shortName}: not killed yet`;
  }

  trackBoss(index: number, card: BossCard): string {
    return card.boss.slug;
  }

  trackGuild(index: number, row: GuildProgress): string {
    return guildKey(row.guild);
  }

  trackKill(index: number, kill: RaidKill): string {
    return logKey(kill);
  }

  trackLabel(index: number, tile: SummaryTile): string {
    return tile.label;
  }

  /** In-page filters keep the scroll position: no navigation, only the address bar changes. */
  private writeUrl(): void {
    const url = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: { difficulty: this.difficulty()?.slug ?? null }
    });
    this.location.replaceState(this.router.serializeUrl(url));
  }
}
