import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, forkJoin, of } from 'rxjs';
import { getArmoryUrl } from '../../game/armory';
import { getClassCrestPath, getClassIconPath } from '../../game/classIconHelper';
import { getClassColor } from '../../game/class-colors';
import { GlideDirective } from '../../shared/motion/glide.directive';
import { RaidDifficultySwitchComponent } from './raid-difficulty-switch.component';
import {
  ITEM_QUALITY_COLORS,
  formatFightTime,
  formatPerSecond,
  raidBossLink,
  raidGuildLink,
  raidLogLink
} from './raid-display';
import {
  MAX_SCORE,
  RaidMetric,
  RankedScore,
  bossBest,
  bossStanding,
  countsFor,
  performanceQuality,
  rankScores,
  scoreCharacters
} from './raid-scores';
import {
  RaidBoss,
  RaidCharacter,
  RaidDifficulty,
  RaidKillDetails,
  RaidLogsIndex,
  RaidMember,
  RaidSpec
} from './raid-logs.types';
import { characterKey, formerCharactersOf, logKey } from './raid-logs';
import { RaidLogsDataService } from './raid-logs-data.service';
import { CLASS_NAMES, realmSlug } from '../../game/wow';
import { injectReplaceUrl } from '../../core/url-state';
import { LoadStateComponent } from '../../shared/load-state.component';
import { setPageHeader } from '../../core/page-header';

interface Appearance {
  kill: RaidKillDetails;
  member: RaidMember;
}

export type RaidComparison = 'all' | 'class';

interface BossRow {
  boss: RaidBoss;
  kills: number;
  best?: Appearance;
  value: number;
  relative: number;
  rank?: number;
  ranked: number;
}

interface Loaded {
  difficulty: RaidDifficulty;
  bossKills: RaidKillDetails[][];
  key: string;
}

interface SummaryTile {
  label: string;
  value: string;
  note: string;
}

interface ClassOption {
  classId: number;
  formerClassId?: number;
  active: boolean;
}

const RECENT_KILLS = 20;
const NOT_RANKED = 'Earlier character, not ranked';

@Component({
  selector: 'app-raid-logs-character-page',
  imports: [RouterLink, RaidDifficultySwitchComponent, GlideDirective, DatePipe, DecimalPipe, LoadStateComponent, NgTemplateOutlet],
  templateUrl: './raid-logs-character-page.component.html',
  styleUrl: './raid-logs-character-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaidLogsCharacterPageComponent {
  readonly logKey = logKey;

  private readonly data = inject(RaidLogsDataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly replaceUrl = injectReplaceUrl();

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });

  readonly index = signal<RaidLogsIndex | undefined>(undefined);
  readonly loaded = signal<Loaded | undefined>(undefined);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly lastEdited = computed(() => this.index()?.generatedAt);

  private readonly requestedDifficulty = signal(this.route.snapshot.queryParamMap.get('difficulty') ?? undefined);
  private readonly pickedMetric = signal<RaidMetric | undefined>(parseMetric(this.route.snapshot.queryParamMap.get('metric')));
  readonly comparison = signal<RaidComparison>(parseComparison(this.route.snapshot.queryParamMap.get('compare')));
  private readonly requestedClass = signal(parseClass(this.route.snapshot.queryParamMap.get('class')));

  private readonly classes = computed(() => {
    const index = this.index();
    const params = this.params();
    return index && formerCharactersOf(index, params.get('realm') ?? '', params.get('name') ?? '');
  });

  readonly formerClass = computed(() => {
    const requested = this.requestedClass();
    return requested !== undefined && this.classes()?.formerClassIds.includes(requested) ? requested : undefined;
  });

  readonly classOptions = computed<ClassOption[]>(() => {
    const classes = this.classes();
    const viewed = this.formerClass();
    return classes
      ? [undefined, ...classes.formerClassIds].map(formerClassId => ({
        classId: formerClassId ?? classes.classId,
        formerClassId,
        active: formerClassId === viewed
      }))
      : [];
  });

  readonly appearances = computed<Appearance[]>(() => {
    const loaded = this.loaded();
    if (!loaded) {
      return [];
    }

    return loaded.bossKills.flatMap(kills => kills.flatMap(kill =>
      kill.members.filter(member => this.isViewed(member.character) && characterKey(member.character) === loaded.key)
        .map(member => ({ kill, member }))));
  });

  readonly character = computed(() => latestFirst(this.appearances())[0]?.member.character);

  readonly comparedClass = computed(() => this.comparison() === 'class' ? this.character()?.classId : undefined);

  readonly ownClass = computed(() => {
    const classId = this.character()?.classId;
    return classId === undefined ? '' : CLASS_NAMES[classId] ?? 'Character';
  });
  readonly classPlural = computed(() => `${this.ownClass()}s`);

  readonly columnTitles = computed(() => this.comparison() === 'class'
    ? { relative: `The best kill against the best any ${this.ownClass()} did on the boss`, rank: `Among every ${this.ownClass()}'s best kill of the boss` }
    : { relative: 'The best kill against the best anyone did on the boss', rank: "Among every character's best kill of the boss" });

  readonly bossQueryParams = computed(() => ({
    difficulty: this.loaded()?.difficulty.slug,
    tab: this.metric(),
    class: this.comparedClass() ?? null
  }));

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

  private readonly scores = computed<RankedScore[]>(() => {
    const loaded = this.loaded();
    const index = this.index();
    return loaded && index ? rankScores(scoreCharacters(index.bosses, loaded.bossKills, this.metric())) : [];
  });

  readonly score = computed(() => {
    const key = this.loaded()?.key;
    return this.formerClass() === undefined ? this.scores().find(entry => characterKey(entry.character) === key) : undefined;
  });

  readonly bossRows = computed<BossRow[]>(() => {
    const loaded = this.loaded();
    const index = this.index();
    if (!loaded || !index) {
      return [];
    }

    const metric = this.metric();
    const byClass = this.comparison() === 'class';
    const earlier = this.formerClass() !== undefined;
    return index.bosses.map(boss => {
      const kills = loaded.bossKills[boss.index] ?? [];
      const own = this.appearances().filter(appearance => appearance.kill.boss === boss);
      const best = own
        .filter(appearance => countsFor(metric, appearance.member.spec))
        .sort((a, b) => b.member[metric] - a.member[metric] || a.kill.killedAt - b.kill.killedAt)[0];
      const filter = best && byClass ? { classId: best.member.character.classId } : {};
      const standing = best && !earlier ? bossStanding(kills, metric, loaded.key, filter) : undefined;
      const top = best && earlier ? bossBest(kills, metric, filter) : 0;
      return {
        boss,
        kills: own.length,
        best,
        value: best?.member[metric] ?? 0,
        relative: standing?.relative ?? (best && top > 0 ? best.member[metric] / top : 0),
        rank: standing?.rank,
        ranked: standing?.ranked ?? 0
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
    const byClass = this.comparison() === 'class';
    const unranked = this.formerClass() === undefined ? 'No ranked kill' : NOT_RANKED;
    return [
      { label: 'Bosses killed', value: `${killed.length}/${rows.length}`, note: `${this.appearances().length} kills` },
      {
        label: `${this.metric().toUpperCase()} score`,
        value: score ? String(score.score) : '-',
        note: score
          ? `#${score.rank} of ${this.scores().length.toLocaleString('en-US')} ${byClass ? 'among all players' : 'on the leaderboard'}`
          : unranked
      },
      {
        label: `Best ${this.metric() === 'hps' ? 'healing' : 'damage'} rank`,
        value: bestRank ? `#${bestRank.rank}` : '-',
        note: bestRank
          ? `${bestRank.boss.shortName}, of ${bestRank.ranked.toLocaleString('en-US')}${byClass ? ` ${this.classPlural()}` : ''}`
          : unranked
      },
      { label: 'Main spec', value: spec?.name ?? '-', note: spec ? CLASS_NAMES[spec.classId] ?? '' : '' },
      { label: 'Item level', value: latest ? String(latest.member.itemLevel) : '-', note: 'At the latest kill' }
    ];
  });

  readonly armoryUrl = computed(() => {
    const character = this.character();
    return character && !character.former ? getArmoryUrl(character.name, character.realm) : undefined;
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
    setPageHeader(() => ({ lastEdited: this.lastEdited() }));
    effect(() => {
      this.params();
      untracked(() => this.loadData());
    });
  }

  loadData(keepLooking = false): void {
    this.subscription?.unsubscribe();
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.subscription = this.data.index()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: index => {
          this.index.set(index);
          const withKills = [...index.difficulties].reverse().filter(difficulty => difficulty.kills > 0);
          const requested = withKills.find(difficulty => difficulty.slug === this.requestedDifficulty());
          const order = !requested ? withKills
            : keepLooking ? [requested, ...withKills.filter(difficulty => difficulty !== requested)]
              : [requested];
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

  setFormerClass(classId: number | undefined): void {
    if (classId === this.formerClass()) {
      return;
    }

    this.requestedClass.set(classId);
    this.writeUrl();
    this.loadData(true);
  }

  setMetric(metric: RaidMetric): void {
    this.pickedMetric.set(metric);
    this.writeUrl();
  }

  setComparison(comparison: RaidComparison): void {
    this.comparison.set(comparison);
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

          if (this.requestedDifficulty() !== undefined && this.requestedDifficulty() !== difficulty.slug) {
            this.requestedDifficulty.set(difficulty.slug);
            this.writeUrl();
          }
          this.loaded.set({ difficulty, bossKills, key });
          this.isLoading.set(false);
        },
        error: error => this.fail(error)
      });
  }

  private findCharacterKey(bossKills: RaidKillDetails[][]): string | undefined {
    const realm = realmSlug(this.params().get('realm') ?? '');
    const name = this.params().get('name') ?? '';
    const exact = `${realm}/${name}`;
    const folded = exact.toLocaleLowerCase();
    let caseless: string | undefined;

    for (const kills of bossKills) {
      for (const kill of kills) {
        for (const member of kill.members) {
          if (!this.isViewed(member.character)) {
            continue;
          }
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

  private isViewed(character: RaidCharacter): boolean {
    const formerClass = this.formerClass();
    return formerClass === undefined ? !character.former : !!character.former && character.classId === formerClass;
  }

  private fail(error: unknown): void {
    console.error('Failed to load the character:', error);
    this.loadError.set('The raid logs could not be loaded.');
    this.isLoading.set(false);
  }

  private writeUrl(): void {
    this.replaceUrl({
      difficulty: this.requestedDifficulty() ?? null,
      metric: this.pickedMetric() ?? null,
      compare: this.comparison() === 'class' ? 'class' : null,
      class: this.formerClass() ?? null
    });
  }
}

function latestFirst(appearances: readonly Appearance[]): Appearance[] {
  return [...appearances].sort((a, b) => b.kill.killedAt - a.kill.killedAt);
}

function parseMetric(value: string | null): RaidMetric | undefined {
  return value === 'dps' || value === 'hps' ? value : undefined;
}

function parseComparison(value: string | null): RaidComparison {
  return value === 'class' ? 'class' : 'all';
}

function parseClass(value: string | null): number | undefined {
  const classId = Number(value);
  return value && Number.isInteger(classId) ? classId : undefined;
}
