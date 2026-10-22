import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getGuildArmoryUrl } from '../../game/armory';
import { RaidDifficultySwitchComponent } from './raid-difficulty-switch.component';
import { RaidBoss, RaidDifficulty, RaidGuild, RaidKill, RaidLogsIndex } from './raid-logs.types';
import { defaultDifficulty, guildKey, logKey } from './raid-logs';
import { fastestKills, guildProgression, latestKills } from './raid-progression';
import { formatAgo, formatFightTime, raidBossLink, raidLogLink } from './raid-display';
import { RaidLogsDataService } from './raid-logs-data.service';
import { injectReplaceUrl } from '../../core/url-state';
import { LoadStateComponent } from '../../shared/load-state.component';
import { setPageHeader } from '../../core/page-header';
import { realmSlug } from '../../game/wow';

interface BossRow {
  boss: RaidBoss;
  first?: RaidKill;
  fastest?: RaidKill;
  kills: number;
}

interface SummaryTile {
  label: string;
  value: string;
  note: string;
}

const HISTORY_PREVIEW = 25;

@Component({
  selector: 'app-raid-logs-guild-page',
  imports: [RouterLink, RaidDifficultySwitchComponent, DatePipe, LoadStateComponent],
  templateUrl: './raid-logs-guild-page.component.html',
  styleUrl: './raid-logs-guild-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaidLogsGuildPageComponent {
  readonly logKey = logKey;

  private readonly data = inject(RaidLogsDataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly replaceUrl = injectReplaceUrl();

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });

  readonly index = signal<RaidLogsIndex | undefined>(undefined);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly now = signal(Date.now());
  readonly showAllKills = signal(false);
  readonly lastEdited = computed(() => this.index()?.generatedAt);
  private readonly requestedDifficulty = signal(this.route.snapshot.queryParamMap.get('difficulty') ?? undefined);

  readonly guildKills = computed<RaidKill[]>(() => {
    const realm = realmSlug(this.params().get('realm') ?? '');
    const name = this.params().get('name') ?? '';
    const onRealm = (this.index()?.kills ?? []).filter(kill => kill.guild?.name && realmSlug(kill.guild.realm) === realm);
    const exact = onRealm.filter(kill => kill.guild!.name === name);
    if (exact.length) {
      return exact;
    }

    const folded = name.toLocaleLowerCase();
    return onRealm.filter(kill => kill.guild!.name.toLocaleLowerCase() === folded);
  });

  readonly guild = computed<RaidGuild | undefined>(() => this.guildKills().at(-1)?.guild);

  readonly killCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const kill of this.guildKills()) {
      counts.set(kill.difficulty.slug, (counts.get(kill.difficulty.slug) ?? 0) + 1);
    }
    return counts;
  });

  readonly difficulty = computed<RaidDifficulty | undefined>(() => {
    const difficulties = this.index()?.difficulties ?? [];
    const counts = this.killCounts();
    const slug = defaultDifficulty(difficulties.map(difficulty => ({ ...difficulty, kills: counts.get(difficulty.slug) ?? 0 })))?.slug;
    return difficulties.find(difficulty => difficulty.slug === this.requestedDifficulty() && counts.get(difficulty.slug))
      ?? difficulties.find(difficulty => difficulty.slug === slug);
  });

  readonly kills = computed(() => this.guildKills().filter(kill => kill.difficulty === this.difficulty()));

  readonly progress = computed(() => {
    const index = this.index();
    const difficulty = this.difficulty();
    const guild = this.guild();
    if (!index || !difficulty || !guild) {
      return undefined;
    }

    const ranking = guildProgression(index.kills, difficulty.id, index.bosses.length);
    const key = guildKey(guild);
    const row = ranking.find(entry => guildKey(entry.guild) === key);
    return row && { row, of: ranking.length };
  });

  readonly bossRows = computed<BossRow[]>(() => (this.index()?.bosses ?? []).map(boss => {
    const kills = this.kills().filter(kill => kill.boss === boss);
    return { boss, first: kills[0], fastest: fastestKills(kills)[0], kills: kills.length };
  }));

  readonly history = computed(() => {
    const kills = latestKills(this.kills());
    return this.showAllKills() ? kills : kills.slice(0, HISTORY_PREVIEW);
  });

  readonly summary = computed<SummaryTile[]>(() => {
    const progress = this.progress();
    const kills = this.kills();
    const bossCount = this.index()?.bosses.length ?? 0;
    const lastFirst = progress?.row.firsts.reduce<RaidKill | undefined>(
      (latest, kill) => kill && (!latest || kill.killedAt > latest.killedAt) ? kill : latest, undefined);
    return [
      {
        label: 'Progress',
        value: progress ? `${progress.row.killed}/${bossCount}` : `0/${bossCount}`,
        note: lastFirst ? `Latest: ${lastFirst.boss.shortName}` : 'No kills yet'
      },
      {
        label: 'Rank',
        value: progress ? `#${progress.row.rank}` : '-',
        note: progress ? `of ${progress.of} guilds` : ''
      },
      { label: 'Kills', value: kills.length.toLocaleString('en-US'), note: `${this.guildKills().length.toLocaleString('en-US')} on all difficulties` },
      {
        label: 'Latest kill',
        value: kills.length ? formatAgo(latestKills(kills)[0].killedAt, this.now()) : '-',
        note: kills.length ? latestKills(kills)[0].boss.shortName : ''
      }
    ];
  });

  readonly armoryUrl = computed(() => {
    const guild = this.guild();
    return guild && getGuildArmoryUrl(guild.name, guild.realm);
  });

  readonly logLink = raidLogLink;
  readonly bossLink = raidBossLink;
  readonly formatFightTime = formatFightTime;
  readonly historyPreview = HISTORY_PREVIEW;

  constructor() {
    setPageHeader(() => ({ lastEdited: this.lastEdited() }));
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
          if (!this.guild()) {
            this.loadError.set('This guild has no kills in the raid logs.');
          }
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
    this.showAllKills.set(false);
    this.replaceUrl({ difficulty: slug });
  }
}
