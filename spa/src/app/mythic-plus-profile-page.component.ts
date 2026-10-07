import { CommonModule, Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  linkedSignal,
  signal
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { forkJoin, map, switchMap } from 'rxjs';
import { getClassCrestPath } from '../utils/classIconHelper';
import { getLocalTimeZoneLabel } from '../utils/time-zone-label';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { injectCompactViewport } from './compact-viewport';
import {
  CLASS_NAMES,
  MYTHIC_PLUS_DATA_DIR,
  MythicPlusAffix,
  MythicPlusDungeonFile,
  MythicPlusIndex,
  MythicPlusRun,
  NEWER_DATA_MESSAGE,
  PlayerScore,
  createRunDecoder,
  exportedAt,
  keystoneUpgrades,
  memberNameMatches,
  rankPlayers,
  rankRuns,
  runIncludesCharacter,
  scoreQuality,
  sharesTables,
  upgradeStars
} from './mythic-plus';
import { affixWeeks, countTicks, dungeonTimers, isTimed, weekIndexAt } from './mythic-plus-activity';
import {
  ScopeRank,
  ScoreDay,
  characterParam,
  characterProfileLink,
  findCharacters,
  formatTopPercent,
  frequentTeammates,
  pageOfRank,
  realmSlug,
  scopeRank,
  scoreOverTime,
  specsPlayed
} from './mythic-plus-profile';
import { MythicPlusRunsListComponent } from './mythic-plus-runs-list.component';
import { specIconFor } from './mythic-plus-stats';
import {
  MYTHIC_PLUS_CARDS_PAGE_SIZE,
  MYTHIC_PLUS_CARDS_QUERY,
  MYTHIC_PLUS_PAGE_SIZE,
  MemberView,
  RunRow,
  RunView,
  toMemberView,
  toRunView
} from './mythic-plus-views';
import { ScrollToEndDirective } from './scroll-to-end.directive';
import { DataFileService } from './services/data-file.service';
import { TapTooltipDirective } from './tap-tooltip.directive';
import { UpdateBarComponent } from './update-bar.component';

const TEAMMATE_COUNT = 8;
const SEARCH_RESULT_COUNT = 20;

/** One of the character's ranks, linking to the players view page that shows it. */
interface RankTile {
  scope: string;
  label: string;
  icon?: string;
  rank: number;
  total: number;
  top: string;
  queryParams: Params;
}

interface DungeonBest {
  dungeon: RunView['dungeon'];
  /** Undefined where the character hasn't played the dungeon. */
  run?: RunView;
}

interface ChartPoint {
  day: ScoreDay;
  label: string;
  longLabel: string;
  ariaLabel: string;
  showLabel: boolean;
  /** Height of the day's score, in percent of the chart. */
  bottom: number;
  /** In the right half: the tooltip opens to the left. */
  flip: boolean;
  /** In the middle third: on a phone the tooltip opens centred over it. */
  middle: boolean;
}

interface WeekBand {
  start: number;
  span: number;
  affixes: MythicPlusAffix[];
  shade: boolean;
}

interface TeammateView {
  key: string;
  member: MemberView;
  runs: number;
  dungeon: string;
  dungeonName: string;
  keyLevel: number;
  upgrades: number;
}

/** A character in the not-found search or in a list of name matches. */
interface CharacterLink {
  key: string;
  member: MemberView;
  score: number;
}

const percentOf = (part: number, whole: number) => whole > 0 ? (part / whole) * 100 : 0;
const formatScore = (score: number) => score.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * /mythic-plus/character/:realm/:name: one character's Mythic+ season. Their score and ranks,
 * best run per dungeon, score over the season, every run and who they play with most. Reads
 * the same data files as the leaderboard, all of them.
 */
@Component({
  selector: 'app-mythic-plus-profile-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    UpdateBarComponent,
    BackToTopButtonComponent,
    TapTooltipDirective,
    ScrollToEndDirective,
    MythicPlusRunsListComponent
  ],
  templateUrl: './mythic-plus-profile-page.component.html',
  styleUrl: './mythic-plus-profile-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusProfilePageComponent implements OnInit {
  private readonly dataFiles = inject(DataFileService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  /** Narrow screens list the dungeons and runs as cards (MYTHIC_PLUS_CARDS_QUERY). */
  readonly cards = injectCompactViewport(MYTHIC_PLUS_CARDS_QUERY);
  /** Phones: the chart's columns get narrower, so fewer of them carry a label. */
  private readonly phone = injectCompactViewport();
  private readonly pageSize = computed(() => this.cards() ? MYTHIC_PLUS_CARDS_PAGE_SIZE : MYTHIC_PLUS_PAGE_SIZE);

  readonly index = signal<MythicPlusIndex | undefined>(undefined);
  readonly lastEdited = computed(() => exportedAt(this.index()));
  readonly lastEditedTimeZoneLabel = computed(() => getLocalTimeZoneLabel(this.lastEdited()));
  readonly allRuns = signal<readonly MythicPlusRun[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  /** Set once files from another export made the page load everything again. */
  private reloadedForNewerData = false;

  /** A teammate's link keeps this page and only changes the parameters. */
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly urlRealm = computed(() => this.params().get('realm') ?? '');
  readonly urlName = computed(() => this.params().get('name') ?? '');

  readonly dungeons = computed(() => this.index()?.dungeons ?? []);
  private readonly dungeonsById = computed(() => new Map(this.dungeons().map(dungeon => [dungeon.id, dungeon])));
  private readonly affixesById = computed(() => new Map((this.index()?.affixes ?? []).map(affix => [affix.id, affix])));
  /** Run colours are relative to the season's best run, as on the leaderboard. */
  private readonly seasonBestScore = computed(() => Math.max(0, ...this.dungeons().map(dungeon => dungeon.bestScore)));

  /** Every character by player score, as the leaderboard's players view ranks them. */
  readonly ranking = computed(() => rankPlayers(this.allRuns()));
  private readonly characters = computed(() =>
    this.ranking().map(player => ({ name: player.member.name, realm: player.member.realm, player })));
  /** Season rank of every run, as in the leaderboard's All dungeons view. */
  private readonly runRanks = computed(() => new Map(rankRuns(this.allRuns()).map((run, position) => [run.id, position + 1])));

  /** The characters the URL names: one, none, or several when only a case-insensitive match works. */
  readonly matches = computed(() =>
    findCharacters(this.characters(), this.urlRealm(), this.urlName()).map(match => match.player));

  readonly player = computed<PlayerScore | undefined>(() => {
    const matches = this.matches();
    return matches.length === 1 ? matches[0] : undefined;
  });
  private readonly key = computed(() => this.player()?.key);
  readonly member = computed(() => {
    const player = this.player();
    return player && toMemberView(player.member);
  });
  readonly classCrest = computed(() => {
    const player = this.player();
    return player && getClassCrestPath(player.member.class);
  });
  /** The leaderboard's runs view, showing only this character's runs. */
  readonly showRunsParams = computed<Params>(() => {
    const member = this.player()?.member;
    return member ? { character: characterParam(member) } : {};
  });
  /** The realm the URL names, as the export writes it (`WoD` for `wod`). */
  readonly realmName = computed(() => {
    const slug = realmSlug(this.urlRealm());
    return this.characters().find(character => realmSlug(character.realm) === slug)?.realm ?? this.urlRealm();
  });

  readonly ambiguous = computed<CharacterLink[]>(() =>
    this.matches().length > 1 ? this.matches().map(toCharacterLink) : []);

  /** Their runs, newest first. */
  readonly runs = computed(() => {
    const key = this.key();
    return key
      ? this.allRuns().filter(run => runIncludesCharacter(run, key))
        .sort((a, b) => a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0)
      : [];
  });

  readonly quality = computed(() => scoreQuality(this.player()?.score ?? 0, this.ranking()[0]?.score ?? 0));

  readonly specs = computed(() => {
    const player = this.player();
    return player
      ? specsPlayed(this.runs(), player.key, player.member.spec)
        .map(played => ({ ...played, icon: specIconFor(played.class, played.spec) }))
      : [];
  });

  readonly summary = computed(() => {
    const runs = this.runs();
    const timers = dungeonTimers(this.dungeons());
    const timed = runs.filter(run => isTimed(run, timers));
    const highest = Math.max(0, ...timed.map(run => run.keyLevel));
    return [
      { label: 'Runs', value: runs.length.toLocaleString('en-GB') },
      { label: 'In time', value: `${Math.round(percentOf(timed.length, runs.length))}%` },
      { label: 'Highest timed key', value: highest ? `+${highest}` : '-' }
    ];
  });

  /** Players view links: a character keeps their spec ranks among players of their main spec only. */
  private readonly specRanking = computed(() => {
    const member = this.player()?.member;
    return member
      ? rankPlayers(this.allRuns(), entry => entry.class === member.class && entry.spec === member.spec)
      : [];
  });

  readonly ranks = computed<RankTile[]>(() => {
    const player = this.player();
    if (!player) {
      return [];
    }

    const { key, member } = player;
    const realm = realmSlug(member.realm);
    const className = CLASS_NAMES[member.class] ?? 'Unknown';
    const ranking = this.ranking();
    const tile = (scope: string, label: string, found: ScopeRank | undefined, filters: Params, icon?: string): RankTile[] => {
      if (!found) {
        return [];
      }

      const page = pageOfRank(found.rank, this.pageSize());
      return [{
        scope,
        label,
        icon,
        ...found,
        top: formatTopPercent(found),
        queryParams: { view: 'players', ...filters, character: characterParam(member), page: page > 1 ? page : undefined }
      }];
    };

    return [
      ...tile('Overall', 'All realms', scopeRank(ranking, key), {}),
      ...tile('Realm', member.realm, scopeRank(ranking, key, entry => realmSlug(entry.member.realm) === realm), { realm }),
      ...tile('Class', className, scopeRank(ranking, key, entry => entry.member.class === member.class),
        { class: member.class }, this.member()?.classIcon),
      ...tile('Spec', `${member.spec} ${className}`, scopeRank(this.specRanking(), key),
        { class: member.class, spec: member.spec }, specIconFor(member.class, member.spec))
    ];
  });

  readonly dungeonBests = computed<DungeonBest[]>(() => {
    const bestRuns = this.player()?.bestRuns;
    const affixes = this.affixesById();
    const bestScore = this.seasonBestScore();
    return this.dungeons().map(dungeon => {
      const run = bestRuns?.get(dungeon.id);
      return { dungeon, run: run && toRunView(run, dungeon, affixes, bestScore) };
    });
  });

  readonly upgradeStars = upgradeStars;

  // Score over the season
  private readonly weeks = computed(() => affixWeeks(this.allRuns()));
  /** The season so far, epoch ms: first and last run of anyone. */
  private readonly seasonSpan = computed(() => {
    let first = Infinity;
    let last = -Infinity;
    for (const run of this.allRuns()) {
      const at = Date.parse(run.completedAt);
      first = Math.min(first, at);
      last = Math.max(last, at);
    }
    return { first, last };
  });
  readonly timeline = computed(() => {
    const { first, last } = this.seasonSpan();
    return this.player() ? scoreOverTime(this.runs(), first, last) : [];
  });

  readonly chart = computed(() => {
    const days = this.timeline();
    if (!days.length) {
      return undefined;
    }

    const ticks = countTicks(Math.max(0, ...days.map(day => day.score)));
    const top = ticks[ticks.length - 1];
    const count = days.length;
    // About 12 date labels across a desktop chart, 6 across a phone's narrower one.
    const labelEvery = Math.max(1, Math.ceil(count / (this.phone() ? 6 : 12)));
    const weeks = this.weeks();
    const affixes = this.affixesById();
    const bands: WeekBand[] = [];
    let previousWeek: number | undefined;

    const points = days.map<ChartPoint>((day, position) => {
      const date = new Date(`${day.day}T12:00:00`);
      // As on the stats page: a reset day counts as the new week.
      const week = weekIndexAt(weeks, date.getTime());
      if (position > 0 && week === previousWeek) {
        bands[bands.length - 1].span++;
      } else {
        bands.push({
          start: position + 1,
          span: 1,
          affixes: (weeks[week]?.affixes ?? [])
            .map(id => affixes.get(id))
            .filter((affix): affix is MythicPlusAffix => affix !== undefined),
          shade: bands.length % 2 === 1
        });
      }
      previousWeek = week;

      const longLabel = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      const played = day.runs ? `, ${day.runs} ${day.runs === 1 ? 'run' : 'runs'}, +${formatScore(day.gained)}` : '';
      return {
        day,
        label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        longLabel,
        ariaLabel: `${longLabel}: ${formatScore(day.score)} points${played}`,
        showLabel: position % labelEvery === 0,
        bottom: percentOf(day.score, top),
        flip: position >= count / 2,
        middle: position >= count / 3 && position < (count * 2) / 3
      };
    });

    // One unit per day across, 100 up; the line is drawn through the middle of each day's column.
    const line = points.map((point, position) => `${position + 0.5},${(100 - point.bottom).toFixed(2)}`).join(' ');
    return {
      points,
      bands,
      viewBox: `0 0 ${count} 100`,
      line,
      area: `0.5,100 ${line} ${count - 0.5},100`,
      gridlines: ticks.map(value => ({ value: value.toLocaleString('en-GB'), position: percentOf(value, top) }))
    };
  });

  // Run history
  readonly expandedRunId = linkedSignal<string | undefined, string | undefined>({ source: this.key, computation: () => undefined });
  readonly historyLimit = linkedSignal<string | undefined, number>({ source: this.key, computation: () => this.pageSize() });
  readonly historyRows = computed<RunRow[]>(() => {
    const dungeons = this.dungeonsById();
    const affixes = this.affixesById();
    const bestScore = this.seasonBestScore();
    const ranks = this.runRanks();
    return this.runs().slice(0, this.historyLimit()).flatMap(run => {
      const dungeon = dungeons.get(run.dungeon);
      return dungeon ? [{ ...toRunView(run, dungeon, affixes, bestScore), rank: ranks.get(run.id) ?? 0 }] : [];
    });
  });
  /** How many runs "Show more" adds; 0 once every run is shown. */
  readonly nextRuns = computed(() => Math.min(this.pageSize(), Math.max(0, this.runs().length - this.historyLimit())));

  readonly teammates = computed<TeammateView[]>(() => {
    const key = this.key();
    const dungeons = this.dungeonsById();
    return key
      ? frequentTeammates(this.runs(), key, TEAMMATE_COUNT).map(mate => {
        const dungeon = dungeons.get(mate.bestRun.dungeon);
        return {
          key: mate.key,
          member: toMemberView(mate.member),
          runs: mate.runs,
          dungeon: dungeon?.shortName ?? mate.bestRun.dungeon,
          dungeonName: dungeon?.name ?? mate.bestRun.dungeon,
          keyLevel: mate.bestRun.keyLevel,
          upgrades: keystoneUpgrades(mate.bestRun.clearTimeSeconds, dungeon?.timerSeconds ?? 0)
        };
      })
      : [];
  });

  // Not found: look the character up by name
  readonly searchQuery = linkedSignal(() => this.urlName());
  readonly searchResults = computed<CharacterLink[]>(() => {
    const query = this.searchQuery().trim();
    return query
      ? this.ranking()
        .filter(player => memberNameMatches(player.member, query))
        .slice(0, SEARCH_RESULT_COUNT)
        .map(toCharacterLink)
      : [];
  });

  constructor() {
    // A typed /evermoon/progtrix that found Progtrix: show the address to share, Progtrix's own.
    effect(() => {
      const member = this.player()?.member;
      if (member && (member.name !== this.urlName() || realmSlug(member.realm) !== this.urlRealm())) {
        this.location.replaceState(this.router.serializeUrl(this.router.createUrlTree(characterProfileLink(member))));
      }
    });
  }

  ngOnInit(): void {
    this.loadData();
  }

  toggleRun(runId: string): void {
    this.expandedRunId.update(current => current === runId ? undefined : runId);
  }

  showMoreRuns(): void {
    this.historyLimit.update(limit => limit + this.pageSize());
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  trackCharacter(index: number, character: CharacterLink | TeammateView): string {
    return character.key;
  }

  loadData(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.dataFiles.getJson<MythicPlusIndex>(`${MYTHIC_PLUS_DATA_DIR}/index.json`)
      .pipe(
        switchMap(index => forkJoin(index.dungeons.map(dungeon =>
          this.dataFiles.fetchJson<MythicPlusDungeonFile>(`${MYTHIC_PLUS_DATA_DIR}/${dungeon.id}.json`)))
          .pipe(map(files => ({ index, files })))),
        takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ index, files }) => {
          // Files from another export than the index (a deploy landed while the tab was open):
          // fetch everything fresh, once. A second mismatch means the deploy is still going out.
          if (files.some(file => !sharesTables(index, file))) {
            this.dataFiles.refresh();
            if (!this.reloadedForNewerData) {
              this.reloadedForNewerData = true;
              this.loadData();
            } else {
              this.loadError.set(NEWER_DATA_MESSAGE);
              this.isLoading.set(false);
            }
            return;
          }

          const decode = createRunDecoder(index);
          this.index.set(index);
          this.allRuns.set(files.flatMap(file => decode(file)));
          this.isLoading.set(false);
        },
        error: error => {
          console.error('Failed to load Mythic+ profile:', error);
          this.loadError.set('The Mythic+ runs could not be loaded.');
          this.isLoading.set(false);
        }
      });
  }
}

function toCharacterLink(player: PlayerScore): CharacterLink {
  return { key: player.key, member: toMemberView(player.member), score: player.score };
}
