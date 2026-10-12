import { CommonModule, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, forkJoin, of } from 'rxjs';
import { getArmoryUrl } from '../utils/armory';
import { getClassCrestPath, getClassIconPath } from '../utils/classIconHelper';
import { getLocalTimeZoneLabel } from '../utils/time-zone-label';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { getClassColor } from './class-colors';
import { GlideDirective } from './glide.directive';
import { CLASS_NAMES } from './mythic-plus';
import { RaidDifficultySwitchComponent } from './raid-difficulty-switch.component';
import {
  ITEM_QUALITY_COLORS,
  MAX_SCORE,
  RaidBoss,
  RaidDifficulty,
  RaidKillDetails,
  RaidLogsIndex,
  RaidMember,
  RaidMetric,
  RaidSpec,
  RankedScore,
  characterKey,
  countsFor,
  formatFightTime,
  formatPerSecond,
  logKey,
  performanceQuality,
  raidBossLink,
  raidGuildLink,
  raidLogLink,
  rankCharacters,
  rankScores,
  realmSlug,
  scoreCharacters
} from './raid-logs';
import { RaidLogsDataService } from './services/raid-logs-data.service';
import { UpdateBarComponent } from './update-bar.component';

interface Appearance {
  kill: RaidKillDetails;
  member: RaidMember;
}

interface BossRow {
  boss: RaidBoss;
  kills: number;
  /** The best kill by the metric, among the specs the metric ranks. */
  best?: Appearance;
  value: number;
  /** The value over the best anyone did on the boss: 0 to 1. */
  relative: number;
  rank?: number;
  ranked: number;
}

interface Loaded {
  difficulty: RaidDifficulty;
  /** Each boss's kills on the difficulty, by boss index. */
  bossKills: RaidKillDetails[][];
  /** The URL's character, as the boss files spell it. */
  key: string;
}

interface SummaryTile {
  label: string;
  value: string;
  note: string;
}

const RECENT_KILLS = 20;

/**
 * /raid-logs/character/:realm/:name: one character on one difficulty (`?difficulty=`, else the
 * hardest one they have kills on). Their best damage or healing on each boss and where it ranks,
 * and their latest kills. Loads the difficulty's seven boss files.
 */
@Component({
  selector: 'app-raid-logs-character-page',
  standalone: true,
  imports: [CommonModule, RouterLink, UpdateBarComponent, BackToTopButtonComponent, RaidDifficultySwitchComponent, GlideDirective],
  templateUrl: './raid-logs-character-page.component.html',
  styleUrl: './raid-logs-character-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaidLogsCharacterPageComponent {
  private readonly data = inject(RaidLogsDataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });

  readonly index = signal<RaidLogsIndex | undefined>(undefined);
  readonly loaded = signal<Loaded | undefined>(undefined);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly lastEdited = computed(() => this.index()?.generatedAt);
  readonly lastEditedTimeZoneLabel = computed(() => getLocalTimeZoneLabel(this.lastEdited()));

  private readonly requestedDifficulty = signal(this.route.snapshot.queryParamMap.get('difficulty') ?? undefined);
  /** Picked on the page; otherwise the character's main role decides. */
  private readonly pickedMetric = signal<RaidMetric | undefined>(parseMetric(this.route.snapshot.queryParamMap.get('metric')));

  readonly appearances = computed<Appearance[]>(() => {
    const loaded = this.loaded();
    if (!loaded) {
      return [];
    }

    return loaded.bossKills.flatMap(kills => kills.flatMap(kill =>
      kill.members.filter(member => characterKey(member.character) === loaded.key).map(member => ({ kill, member }))));
  });

  readonly character = computed(() => latestFirst(this.appearances())[0]?.member.character);

  /** The spec played most often, the latest kill breaking a tie. */
  readonly mainSpec = computed<RaidSpec | undefined>(() => {
    const counts = new Map<RaidSpec, number>();
    for (const { member } of latestFirst(this.appearances())) {
      if (member.spec) {
        counts.set(member.spec, (counts.get(member.spec) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  });

  readonly metric = computed<RaidMetric>(() => this.pickedMetric() ?? (this.mainSpec()?.role === 'healer' ? 'hps' : 'dps'));

  /** Everyone's score on the difficulty, as the leaderboard ranks them. */
  private readonly scores = computed<RankedScore[]>(() => {
    const loaded = this.loaded();
    const index = this.index();
    return loaded && index ? rankScores(scoreCharacters(index.bosses, loaded.bossKills, this.metric())) : [];
  });

  readonly score = computed(() => {
    const key = this.loaded()?.key;
    return this.scores().find(entry => characterKey(entry.character) === key);
  });

  readonly bossRows = computed<BossRow[]>(() => {
    const loaded = this.loaded();
    const index = this.index();
    if (!loaded || !index) {
      return [];
    }

    const metric = this.metric();
    return index.bosses.map(boss => {
      const kills = loaded.bossKills[boss.index] ?? [];
      const own = this.appearances().filter(appearance => appearance.kill.boss === boss);
      const best = own
        .filter(appearance => countsFor(metric, appearance.member.spec))
        .sort((a, b) => b.member[metric] - a.member[metric] || a.kill.killedAt - b.kill.killedAt)[0];
      const ranking = best ? rankCharacters(kills, metric) : [];
      const rank = ranking.findIndex(entry => characterKey(entry.member.character) === loaded.key) + 1;
      return {
        boss,
        kills: own.length,
        best,
        value: best?.member[metric] ?? 0,
        relative: this.score()?.bosses[boss.index]?.relative ?? 0,
        rank: rank || undefined,
        ranked: ranking.length
      };
    });
  });

  readonly recent = computed(() => latestFirst(this.appearances()).slice(0, RECENT_KILLS));

  readonly summary = computed<SummaryTile[]>(() => {
    const rows = this.bossRows();
    const killed = rows.filter(row => row.kills > 0);
    const bestRank = rows.filter(row => row.rank).sort((a, b) => a.rank! / a.ranked - b.rank! / b.ranked)[0];
    const latest = this.recent()[0];
    const spec = this.mainSpec();
    const score = this.score();
    return [
      { label: 'Bosses killed', value: `${killed.length}/${rows.length}`, note: `${this.appearances().length} kills` },
      {
        label: `${this.metric().toUpperCase()} score`,
        value: score ? String(score.score) : '-',
        note: score ? `#${score.rank} of ${this.scores().length.toLocaleString('en-US')} on the leaderboard` : 'No ranked kill'
      },
      {
        label: `Best ${this.metric() === 'hps' ? 'healing' : 'damage'} rank`,
        value: bestRank ? `#${bestRank.rank}` : '-',
        note: bestRank ? `${bestRank.boss.shortName}, of ${bestRank.ranked.toLocaleString('en-US')}` : 'No ranked kill'
      },
      { label: 'Main spec', value: spec?.name ?? '-', note: spec ? CLASS_NAMES[spec.classId] ?? '' : '' },
      { label: 'Item level', value: latest ? String(latest.member.itemLevel) : '-', note: 'At the latest kill' }
    ];
  });

  readonly armoryUrl = computed(() => {
    const character = this.character();
    return character && getArmoryUrl(character.name, character.realm);
  });

  readonly maxScore = MAX_SCORE;
  readonly logLink = raidLogLink;
  readonly bossLink = raidBossLink;
  readonly guildLink = raidGuildLink;
  readonly classIcon = getClassIconPath;
  readonly classCrest = getClassCrestPath;
  readonly formatFightTime = formatFightTime;
  readonly formatPerSecond = formatPerSecond;
  readonly className = (classId: number) => CLASS_NAMES[classId] ?? '';

  private subscription?: Subscription;

  constructor() {
    effect(() => {
      this.params();
      untracked(() => this.loadData());
    });
  }

  loadData(): void {
    this.subscription?.unsubscribe();
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.subscription = this.data.index()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: index => {
          this.index.set(index);
          const requested = index.difficulties.find(difficulty => difficulty.slug === this.requestedDifficulty() && difficulty.kills > 0);
          // Hardest first; without a requested difficulty, step down until the character shows up.
          const order = requested ? [requested] : [...index.difficulties].reverse().filter(difficulty => difficulty.kills > 0);
          this.loadDifficulty(index, order);
        },
        error: error => this.fail(error)
      });
  }

  setDifficulty(slug: string): void {
    this.requestedDifficulty.set(slug);
    this.writeUrl();
    this.loadData();
  }

  setMetric(metric: RaidMetric): void {
    this.pickedMetric.set(metric);
    this.writeUrl();
  }

  classColor(classId: number): string {
    return getClassColor(classId) ?? '#e0e0e0';
  }

  qualityColor(relative: number): string {
    return ITEM_QUALITY_COLORS[performanceQuality(relative)];
  }

  percent(relative: number): string {
    return `${Math.floor(relative * 100)}%`;
  }

  trackBoss(index: number, row: BossRow): string {
    return row.boss.slug;
  }

  trackAppearance(index: number, appearance: Appearance): string {
    return logKey(appearance.kill);
  }

  trackLabel(index: number, tile: SummaryTile): string {
    return tile.label;
  }

  private loadDifficulty(index: RaidLogsIndex, order: RaidDifficulty[]): void {
    const [difficulty, ...rest] = order;
    if (!difficulty) {
      this.loaded.set(undefined);
      this.loadError.set('This character has no kills in the raid logs.');
      this.isLoading.set(false);
      return;
    }

    const files = index.bosses.map(boss => this.data.bossKills(index, boss, difficulty));
    this.subscription = (files.length ? forkJoin(files) : of([]))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: bossKills => {
          const key = this.findCharacterKey(bossKills);
          if (!key && rest.length) {
            this.loadDifficulty(index, rest);
            return;
          }

          if (!key) {
            this.loaded.set(undefined);
            this.loadError.set(`This character has no ${difficulty.name} kills in the raid logs.`);
            this.isLoading.set(false);
            return;
          }

          this.loaded.set({ difficulty, bossKills, key });
          this.isLoading.set(false);
        },
        error: error => this.fail(error)
      });
  }

  /** The realm must match; the name exactly, else ignoring case. */
  private findCharacterKey(bossKills: RaidKillDetails[][]): string | undefined {
    const realm = realmSlug(this.params().get('realm') ?? '');
    const name = this.params().get('name') ?? '';
    const exact = `${realm}/${name}`;
    const folded = exact.toLocaleLowerCase();
    let caseless: string | undefined;

    for (const kills of bossKills) {
      for (const kill of kills) {
        for (const member of kill.members) {
          const key = characterKey(member.character);
          if (key === exact) {
            return key;
          }
          if (!caseless && key.toLocaleLowerCase() === folded) {
            caseless = key;
          }
        }
      }
    }

    return caseless;
  }

  private fail(error: unknown): void {
    console.error('Failed to load the character:', error);
    this.loadError.set('The raid logs could not be loaded.');
    this.isLoading.set(false);
  }

  private writeUrl(): void {
    const url = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: {
        difficulty: this.requestedDifficulty() ?? null,
        metric: this.pickedMetric() ?? null
      }
    });
    this.location.replaceState(this.router.serializeUrl(url));
  }
}

function latestFirst(appearances: readonly Appearance[]): Appearance[] {
  return [...appearances].sort((a, b) => b.kill.killedAt - a.kill.killedAt);
}

function parseMetric(value: string | null): RaidMetric | undefined {
  return value === 'dps' || value === 'hps' ? value : undefined;
}
