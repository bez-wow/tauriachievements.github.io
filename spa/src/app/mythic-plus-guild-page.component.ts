import { CommonModule, Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { forkJoin, map, switchMap } from 'rxjs';
import { getGuildArmoryUrl } from '../utils/armory';
import { getLocalTimeZoneLabel } from '../utils/time-zone-label';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { injectCompactViewport } from './compact-viewport';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { FilterDropdownCoordinatorService } from './filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from './filter-dropdown.types';
import { GlideDirective } from './glide.directive';
import { MobileFilterToggleComponent } from './mobile-filter-toggle.component';
import {
  CLASS_FILTER_OPTIONS,
  CLASS_NAMES,
  MYTHIC_PLUS_DATA_DIR,
  MythicPlusAffix,
  MythicPlusDungeon,
  MythicPlusDungeonFile,
  MythicPlusIndex,
  MythicPlusMember,
  MythicPlusRole,
  MythicPlusRun,
  MythicPlusStandingEntry,
  NEWER_DATA_MESSAGE,
  ROLE_LABELS,
  characterKey,
  createRunDecoder,
  currentAffixWeek,
  exportedAt,
  memberNameMatches,
  rankPlayers,
  runScoreColor,
  scoreColor,
  scoreTiers,
  seasonScoreColors,
  sharesTables
} from './mythic-plus';
import {
  GuildLadderEntry,
  findGuild,
  guildLadder,
  guildLadderLink,
  guildRankChanges,
  inGuild,
  previousOverallRank
} from './mythic-plus-guild';
import { MythicPlusPlayersListComponent } from './mythic-plus-players-list.component';
import {
  characterParam,
  characterProfileLink,
  findCharacters,
  pageOfRank,
  parseCharacterParam,
  realmSlug
} from './mythic-plus-profile';
import { LEGION_SPECS } from './mythic-plus-stats';
import {
  MYTHIC_PLUS_CARDS_PAGE_SIZE,
  MYTHIC_PLUS_CARDS_QUERY,
  MYTHIC_PLUS_PAGE_SIZE,
  PlayerRow,
  bestRunCells,
  toMemberView
} from './mythic-plus-views';
import { MythicPlusWeekAffixesComponent } from './mythic-plus-week-affixes.component';
import { DataFileService } from './services/data-file.service';
import { UpdateBarComponent } from './update-bar.component';

/** Season: every run. Week: only runs with the current week's affixes. */
type LadderPeriod = 'season' | 'week';

interface SummaryTile {
  label: string;
  value: string;
  note: string;
  color?: string;
  link?: string[];
}

/** How many members of a guild in the top this many of the leaderboard the header counts. */
const TOP_OVERALL = 100;

function parseRole(value: string | null): MythicPlusRole | undefined {
  return value === 'tank' || value === 'healer' || value === 'dps' ? value : undefined;
}

function parseClass(value: string | null): number | undefined {
  const classId = Number(value);
  return value && CLASS_NAMES[classId] ? classId : undefined;
}

/** A spec from the URL only counts when it belongs to the class filter. */
function parseSpec(classId: number | undefined, value: string | null): string | undefined {
  return LEGION_SPECS.find(spec => spec.classId === classId && spec.spec === value)?.spec;
}

/**
 * /mythic-plus/guild/:realm/:guild: one guild's own Mythic+ ladder, so its members can compete
 * with each other instead of the whole server. Scores are the leaderboard's; ranks are counted
 * again inside the guild, with each member's overall rank beside theirs. Reads every data file.
 */
@Component({
  selector: 'app-mythic-plus-guild-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    UpdateBarComponent,
    BackToTopButtonComponent,
    MythicPlusPlayersListComponent,
    MythicPlusWeekAffixesComponent,
    FilterDropdownComponent,
    MobileFilterToggleComponent,
    GlideDirective
  ],
  templateUrl: './mythic-plus-guild-page.component.html',
  styleUrl: './mythic-plus-guild-page.component.scss',
  // Keeps one of this page's dropdowns open at a time.
  providers: [FilterDropdownCoordinatorService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusGuildPageComponent implements OnInit {
  private readonly dataFiles = inject(DataFileService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  /** Narrow screens list the members as cards (MYTHIC_PLUS_CARDS_QUERY). */
  readonly cards = injectCompactViewport(MYTHIC_PLUS_CARDS_QUERY);
  /** Rows "Show more" adds; also the leaderboard's page size, for the overall-rank links. */
  private readonly pageSize = computed(() => this.cards() ? MYTHIC_PLUS_CARDS_PAGE_SIZE : MYTHIC_PLUS_PAGE_SIZE);
  /** Phones: whether the class and spec filters are shown, or folded behind the Filters button. */
  readonly filtersOpen = signal(false);

  readonly index = signal<MythicPlusIndex | undefined>(undefined);
  readonly lastEdited = computed(() => exportedAt(this.index()));
  readonly lastEditedTimeZoneLabel = computed(() => getLocalTimeZoneLabel(this.lastEdited()));
  readonly allRuns = signal<readonly MythicPlusRun[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  /** Set once files from another export made the page load everything again. */
  private reloadedForNewerData = false;

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly urlRealm = computed(() => this.params().get('realm') ?? '');
  readonly urlGuild = computed(() => this.params().get('guild') ?? '');

  // The filters, read from the URL once and written back without navigating (see writeUrl).
  private readonly query = this.route.snapshot.queryParamMap;
  readonly period = signal<LadderPeriod>(this.query.get('period') === 'week' ? 'week' : 'season');
  readonly selectedDungeonId = signal<string | undefined>(this.query.get('dungeon') ?? undefined);
  /** Roles: each member scored only on their runs as a tank, a healer or DPS. Undefined is Players. */
  readonly roleFilter = signal<MythicPlusRole | undefined>(parseRole(this.query.get('role')));
  readonly classFilter = signal<number | undefined>(this.roleFilter() ? undefined : parseClass(this.query.get('class')));
  readonly specFilter = signal<string | undefined>(parseSpec(this.classFilter(), this.query.get('spec')));
  readonly search = signal('');
  /** The member `?character=` picks out, e.g. from the Guild tile on their profile. */
  private readonly highlightParam = signal(parseCharacterParam(this.query.get('character')));
  /** Rows shown before "Show more". */
  private readonly limit = signal(this.pageSize());

  readonly roles: readonly MythicPlusRole[] = ['tank', 'healer', 'dps'];
  readonly roleLabels = ROLE_LABELS;

  readonly classOptions = CLASS_FILTER_OPTIONS;

  readonly specOptions = computed<FilterDropdownOption[]>(() => {
    const classId = this.classFilter();
    return [
      { value: undefined, label: 'All specs' },
      ...LEGION_SPECS
        .filter(spec => spec.classId === classId)
        .map(spec => ({ value: spec.spec, label: spec.spec, icon: spec.icon }))
    ];
  });

  /** The class / spec filter in use, as a chip under the phone Filters button. */
  readonly activeFilterLabels = computed(() => {
    const classId = this.classFilter();
    return classId === undefined ? [] : [[this.specFilter(), CLASS_NAMES[classId]].filter(Boolean).join(' ')];
  });

  /** The guild the URL names, written as the export writes it. Undefined when nobody in the export is in it. */
  readonly guild = computed(() => {
    const players = this.index()?.players ?? [];
    return findGuild(players.map(([, realm, guild]) => ({ realm, guild })), this.urlRealm(), this.urlGuild());
  });

  /** The realm the URL names, as the export writes it (`WoD` for `wod`), for the not-found message. */
  readonly realmName = computed(() => {
    const slug = realmSlug(this.urlRealm());
    return this.index()?.players.find(([, realm]) => realmSlug(realm) === slug)?.[1] ?? this.urlRealm();
  });

  readonly armoryUrl = computed(() => {
    const guild = this.guild();
    return guild && getGuildArmoryUrl(guild.name, guild.realm);
  });

  /** The guild's characters in the export, each with their standing: everyone with a run this season. */
  private readonly memberStandings = computed(() => {
    const index = this.index();
    const guild = this.guild();
    const standings = new Map<string, MythicPlusStandingEntry | undefined>();
    if (!index || !guild) {
      return standings;
    }

    const isMember = inGuild(guild);
    index.players.forEach(([name, realm, guildName], position) => {
      if (isMember({ realm, guild: guildName })) {
        standings.set(characterKey({ name, realm }), index.standings?.[position]);
      }
    });
    return standings;
  });

  readonly dungeons = computed(() => this.index()?.dungeons ?? []);
  readonly selectedDungeon = computed(() => this.dungeons().find(dungeon => dungeon.id === this.selectedDungeonId()));
  /** Dungeons the table has a best-run column for: the selected one, or all of them. */
  readonly ladderDungeons = computed(() => {
    const dungeon = this.selectedDungeon();
    return dungeon ? [dungeon] : this.dungeons();
  });

  private readonly affixesById = computed(() => new Map((this.index()?.affixes ?? []).map(affix => [affix.id, affix])));
  readonly affixWeek = computed(() => currentAffixWeek(this.allRuns()));
  readonly weekAffixes = computed(() => {
    const affixes = this.affixesById();
    return (this.affixWeek()?.affixes ?? [])
      .map(id => affixes.get(id))
      .filter((affix): affix is MythicPlusAffix => affix !== undefined);
  });

  /** Raider.IO-style score colours from this season's standings. */
  private readonly scoreColors = computed(() => seasonScoreColors(this.index()));

  /** Season, all dungeons, no role, class or spec: the scope the standings' changes describe. */
  private readonly defaultScope = computed(() =>
    this.period() === 'season' && !this.selectedDungeon() && !this.roleFilter() && this.classFilter() === undefined);

  /** Every character's season, for the header; also the ladder's ranking in the default scope. */
  private readonly seasonRanking = computed(() => rankPlayers(this.allRuns()));

  /** Every character in the selected scope, as the leaderboard's players view ranks them. */
  private readonly ranking = computed(() => {
    if (this.defaultScope()) {
      return this.seasonRanking();
    }

    const since = this.period() === 'week' ? this.affixWeek()?.since : undefined;
    const dungeon = this.selectedDungeon();
    const runs = this.allRuns().filter(run =>
      (!dungeon || run.dungeon === dungeon.id) && (since === undefined || Date.parse(run.completedAt) >= since));
    const role = this.roleFilter();
    const classId = this.classFilter();
    const spec = this.specFilter();
    // A spec (or role) scores each character on the runs they played as that spec (role) only.
    const include = role === undefined && classId === undefined
      ? undefined
      : (member: MythicPlusMember) => (role === undefined || member.role === role)
        && (classId === undefined || (member.class === classId && (spec === undefined || member.spec === spec)));
    return rankPlayers(runs, include);
  });

  readonly ladder = computed<GuildLadderEntry[]>(() => {
    const guild = this.guild();
    return guild ? guildLadder(this.ranking(), guild) : [];
  });

  /** The ladder, narrowed by the name search; like the leaderboard's, it keeps the ranks. */
  readonly filteredLadder = computed(() => {
    const query = this.search();
    const ladder = this.ladder();
    return query.trim() ? ladder.filter(entry => memberNameMatches(entry.player.member, query)) : ladder;
  });

  /** `characterKey` of the member `?character=` names, matched without regard to case. */
  readonly highlightKey = computed(() => {
    const wanted = this.highlightParam();
    const members = this.ladder().map(entry => entry.player.member);
    return wanted && findCharacters(members, wanted.realm, wanted.name).map(member => characterKey(member))[0];
  });

  /** Rows shown: up to the limit, and always down to the highlighted member. */
  private readonly shownCount = computed(() => {
    const key = this.highlightKey();
    const position = key ? this.filteredLadder().findIndex(entry => entry.player.key === key) + 1 : 0;
    const size = this.pageSize();
    return Math.max(this.limit(), Math.ceil(position / size) * size);
  });

  /** How many rows "Show more" adds; 0 once every member is shown. */
  readonly nextRows = computed(() =>
    Math.min(this.pageSize(), Math.max(0, this.filteredLadder().length - this.shownCount())));

  /** Guild-rank changes since the previous scan; undefined outside the scope the standings describe. */
  private readonly rankChanges = computed(() => {
    const index = this.index();
    if (!index?.previousGeneratedAt || index.standings?.length !== index.players.length || !this.defaultScope()) {
      return undefined;
    }

    const standings = this.memberStandings();
    return guildRankChanges(this.ladder().map(entry => ({
      key: entry.player.key,
      rank: entry.rank,
      previousOverallRank: previousOverallRank(standings.get(entry.player.key))
    })));
  });

  /** A score's colour: the run scale for one dungeon, this week's players for this week, else the season's. */
  private readonly playerColor = computed(() => {
    const colors = this.scoreColors();
    if (this.selectedDungeon()) {
      return (score: number) => runScoreColor(score, colors);
    }

    const tiers = this.period() === 'week' ? scoreTiers(this.ranking().map(player => player.score)) : colors.tiers;
    return (score: number) => scoreColor(score, tiers);
  });

  readonly rows = computed<PlayerRow[]>(() => {
    const dungeons = this.ladderDungeons();
    const playerColor = this.playerColor();
    const changes = this.rankChanges();
    const standings = this.memberStandings();
    const overallFilters = this.overallFilters();
    const pageSize = this.pageSize();

    return this.filteredLadder().slice(0, this.shownCount()).map(({ player, rank, overallRank, overallPosition }) => {
      const rankChange = changes?.get(player.key);
      const page = pageOfRank(overallPosition, pageSize);
      return {
        key: player.key,
        rank,
        member: toMemberView({ ...player.member, spec: player.primarySpec }),
        score: player.score,
        color: playerColor(player.score),
        change: rankChange === undefined ? undefined : { rank: rankChange, score: standings.get(player.key)?.[2] ?? 0 },
        newSinceLastScan: !!changes && rankChange === undefined,
        overall: {
          rank: overallRank,
          queryParams: { ...overallFilters, character: characterParam(player.member), page: page > 1 ? page : undefined }
        },
        bests: bestRunCells(player.bestRuns, dungeons)
      };
    });
  });

  /** The leaderboard's players view in the same scope, for the overall-rank links. */
  private readonly overallFilters = computed<Params>(() => ({
    view: 'players',
    period: this.period() === 'week' ? 'week' : undefined,
    dungeon: this.selectedDungeon()?.id,
    role: this.roleFilter(),
    class: this.classFilter(),
    spec: this.specFilter()
  }));

  /** The header: who is in the guild this season, its best score and its share of the top 100. */
  readonly summary = computed<SummaryTile[]>(() => {
    const guild = this.guild();
    if (!guild) {
      return [];
    }

    const season = guildLadder(this.seasonRanking(), guild);
    const best = season[0];
    const inTop = season.filter(entry => entry.overallRank <= TOP_OVERALL).length;
    const members = this.memberStandings().size;
    return [
      {
        label: 'Characters',
        value: members.toLocaleString('en-GB'),
        note: 'with a run this season'
      },
      {
        label: 'Best score',
        value: best ? best.player.score.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '-',
        note: best ? best.player.member.name : '',
        color: best && scoreColor(best.player.score, this.scoreColors().tiers),
        link: best && characterProfileLink(best.player.member)
      },
      {
        label: `Top ${TOP_OVERALL}`,
        value: inTop.toLocaleString('en-GB'),
        note: inTop === 1 ? 'member overall' : 'members overall'
      }
    ];
  });

  readonly resultUnit = computed(() => this.filteredLadder().length === 1 ? 'member' : 'members');

  readonly emptyMessage = computed(() => {
    const guild = this.guild()?.name ?? '';
    const query = this.search().trim();
    const dungeon = this.selectedDungeon();
    const where = `${dungeon ? ` in ${dungeon.name}` : ''}${this.period() === 'week' ? ' this week' : ''}`;
    if (query) {
      return `No member of ${guild} matching "${query}".`;
    }

    const classId = this.classFilter();
    const role = this.roleFilter();
    const who = role ? (role === 'dps' ? 'DPS player' : role)
      : classId === undefined ? 'member' : [this.specFilter(), CLASS_NAMES[classId]].filter(Boolean).join(' ');
    return `No ${who} of ${guild} has a run${where || ' yet'}.`;
  });

  constructor() {
    // A typed /evermoon/skill issue that found Skill Issue: show the address to share, the guild's own.
    effect(() => {
      const guild = this.guild();
      if (guild && (guild.name !== this.urlGuild() || realmSlug(guild.realm) !== this.urlRealm())) {
        untracked(() => this.writeUrl());
      }
    });
  }

  ngOnInit(): void {
    this.loadData();
  }

  setPeriod(period: LadderPeriod): void {
    if (period === this.period()) {
      return;
    }
    this.period.set(period);
    this.resetRows();
  }

  selectDungeon(dungeonId: string | undefined): void {
    if (dungeonId === this.selectedDungeonId()) {
      return;
    }
    this.selectedDungeonId.set(dungeonId);
    this.resetRows();
  }

  /** Players: everyone on all their runs. Roles: tanks first, and class and spec don't apply. */
  showRoles(on: boolean): void {
    if (on === !!this.roleFilter()) {
      return;
    }
    this.roleFilter.set(on ? 'tank' : undefined);
    this.classFilter.set(undefined);
    this.specFilter.set(undefined);
    this.resetRows();
  }

  setRole(role: MythicPlusRole): void {
    if (role === this.roleFilter()) {
      return;
    }
    this.roleFilter.set(role);
    this.resetRows();
  }

  setClassFilter(value: FilterDropdownValue): void {
    const classId = typeof value === 'number' ? value : undefined;
    if (classId === this.classFilter()) {
      return;
    }
    this.classFilter.set(classId);
    this.specFilter.set(undefined);
    this.resetRows();
  }

  setSpecFilter(value: FilterDropdownValue): void {
    const spec = typeof value === 'string' ? value : undefined;
    if (spec === this.specFilter()) {
      return;
    }
    this.specFilter.set(spec);
    this.resetRows();
  }

  resetFilters(): void {
    this.classFilter.set(undefined);
    this.specFilter.set(undefined);
    this.resetRows();
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.limit.set(this.pageSize());
  }

  showMore(): void {
    this.limit.set(this.shownCount() + this.pageSize());
  }

  trackDungeon(index: number, dungeon: MythicPlusDungeon): string {
    return dungeon.id;
  }

  trackLabel(index: number, tile: SummaryTile): string {
    return tile.label;
  }

  /** After a filter change: back to the first rows, and the filters into the address bar. */
  private resetRows(): void {
    this.limit.set(this.pageSize());
    this.writeUrl();
  }

  /**
   * The guild's own address with the filters. Written straight into the address bar: navigating
   * would scroll to the top and run a full-page view transition.
   */
  private writeUrl(): void {
    const guild = this.guild();
    if (!guild) {
      return;
    }

    const highlight = this.highlightParam();
    const url = this.router.createUrlTree(guildLadderLink(guild), {
      queryParams: {
        period: this.period() === 'week' ? 'week' : null,
        dungeon: this.selectedDungeon()?.id ?? null,
        role: this.roleFilter() ?? null,
        class: this.classFilter() ?? null,
        spec: this.specFilter() ?? null,
        character: highlight ? characterParam(highlight) : null
      }
    });
    this.location.replaceState(this.router.serializeUrl(url));
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
          console.error('Failed to load the Mythic+ guild ladder:', error);
          this.loadError.set('The Mythic+ runs could not be loaded.');
          this.isLoading.set(false);
        }
      });
  }
}
