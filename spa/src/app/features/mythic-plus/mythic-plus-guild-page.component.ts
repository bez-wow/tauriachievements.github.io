import { DecimalPipe } from '@angular/common';
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
import { ActivatedRoute, Params, RouterLink } from '@angular/router';
import { getGuildArmoryUrl } from '../../game/armory';
import { injectCompactViewport } from '../../shared/compact-viewport';
import { FilterDropdownComponent } from '../../shared/filter-dropdown.component';
import { FilterDropdownCoordinatorService } from '../../shared/filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from '../../shared/filter-dropdown.types';
import { GlideDirective } from '../../shared/motion/glide.directive';
import { MobileFilterToggleComponent } from '../../shared/mobile-filter-toggle.component';
import {
  MythicPlusAffix,
  MythicPlusIndex,
  MythicPlusMember,
  MythicPlusRun,
  MythicPlusStandingEntry,
  ROLE_LABELS,
  characterKey,
  currentAffixWeek,
  exportedAt,
  hasScanChanges,
  memberNameMatches,
  rankPlayers,
  runScoreColor,
  scoreColor,
  scoreTiers,
  seasonScoreColors
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
  findCharacters,
  pageOfRank,
  parseCharacterParam
} from './mythic-plus-profile';
import {
  MYTHIC_PLUS_CARDS_PAGE_SIZE,
  MYTHIC_PLUS_CARDS_QUERY,
  MYTHIC_PLUS_PAGE_SIZE,
  PlayerRow,
  bestRunCells,
  toMemberView
} from './mythic-plus-views';
import { MythicPlusWeekAffixesComponent } from './mythic-plus-week-affixes.component';
import { MythicPlusDataService, mythicPlusLoadError } from './mythic-plus-data.service';
import { CLASS_FILTER_OPTIONS, CLASS_NAMES, parseClassId, parseRole, Role, realmSlug } from '../../game/wow';
import { LEGION_SPECS, parseSpecName } from '../../game/wow-specs';
import { injectReplaceUrl } from '../../core/url-state';
import { LoadStateComponent } from '../../shared/load-state.component';
import { setPageHeader } from '../../core/page-header';
import { mythicPlusProfileLink } from '../../core/page-links';

type LadderPeriod = 'season' | 'week';

interface SummaryTile {
  label: string;
  value: string;
  note: string;
  color?: string;
  link?: string[];
}

const TOP_OVERALL = 100;

@Component({
  selector: 'app-mythic-plus-guild-page',
  imports: [
    RouterLink,
    MythicPlusPlayersListComponent,
    MythicPlusWeekAffixesComponent,
    FilterDropdownComponent,
    MobileFilterToggleComponent,
    GlideDirective,
    DecimalPipe,
    LoadStateComponent
  ],
  templateUrl: './mythic-plus-guild-page.component.html',
  styleUrl: './mythic-plus-guild-page.component.scss',
  providers: [FilterDropdownCoordinatorService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusGuildPageComponent implements OnInit {
  private readonly mythicPlusData = inject(MythicPlusDataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly replaceUrl = injectReplaceUrl();

  readonly cards = injectCompactViewport(MYTHIC_PLUS_CARDS_QUERY);
  private readonly pageSize = computed(() => this.cards() ? MYTHIC_PLUS_CARDS_PAGE_SIZE : MYTHIC_PLUS_PAGE_SIZE);
  readonly filtersOpen = signal(false);

  readonly index = signal<MythicPlusIndex | undefined>(undefined);
  readonly lastEdited = computed(() => exportedAt(this.index()));
  readonly allRuns = signal<readonly MythicPlusRun[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly urlRealm = computed(() => this.params().get('realm') ?? '');
  readonly urlGuild = computed(() => this.params().get('guild') ?? '');

  private readonly query = this.route.snapshot.queryParamMap;
  readonly period = signal<LadderPeriod>(this.query.get('period') === 'week' ? 'week' : 'season');
  readonly selectedDungeonId = signal<string | undefined>(this.query.get('dungeon') ?? undefined);
  readonly roleFilter = signal<Role | undefined>(parseRole(this.query.get('role')));
  readonly classFilter = signal<number | undefined>(this.roleFilter() ? undefined : parseClassId(this.query.get('class')));
  readonly specFilter = signal<string | undefined>(parseSpecName(this.classFilter(), this.query.get('spec')));
  readonly search = signal('');
  private readonly highlightParam = signal(parseCharacterParam(this.query.get('character')));
  private readonly limit = signal(this.pageSize());

  readonly roles: readonly Role[] = ['tank', 'healer', 'dps'];
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

  readonly activeFilterLabels = computed(() => {
    const classId = this.classFilter();
    return classId === undefined ? [] : [[this.specFilter(), CLASS_NAMES[classId]].filter(Boolean).join(' ')];
  });

  readonly guild = computed(() => {
    const players = this.index()?.players ?? [];
    return findGuild(players.map(([, realm, guild]) => ({ realm, guild })), this.urlRealm(), this.urlGuild());
  });

  readonly realmName = computed(() => {
    const slug = realmSlug(this.urlRealm());
    return this.index()?.players.find(([, realm]) => realmSlug(realm) === slug)?.[1] ?? this.urlRealm();
  });

  readonly armoryUrl = computed(() => {
    const guild = this.guild();
    return guild && getGuildArmoryUrl(guild.name, guild.realm);
  });

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

  private readonly scoreColors = computed(() => seasonScoreColors(this.index()));

  private readonly defaultScope = computed(() =>
    this.period() === 'season' && !this.selectedDungeon() && !this.roleFilter() && this.classFilter() === undefined);

  private readonly seasonRanking = computed(() => rankPlayers(this.allRuns()));

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

  readonly filteredLadder = computed(() => {
    const query = this.search();
    const ladder = this.ladder();
    return query.trim() ? ladder.filter(entry => memberNameMatches(entry.player.member, query)) : ladder;
  });

  readonly highlightKey = computed(() => {
    const wanted = this.highlightParam();
    const members = this.ladder().map(entry => entry.player.member);
    return wanted && findCharacters(members, wanted.realm, wanted.name).map(member => characterKey(member))[0];
  });

  private readonly shownCount = computed(() => {
    const key = this.highlightKey();
    const position = key ? this.filteredLadder().findIndex(entry => entry.player.key === key) + 1 : 0;
    const size = this.pageSize();
    return Math.max(this.limit(), Math.ceil(position / size) * size);
  });

  readonly nextRows = computed(() =>
    Math.min(this.pageSize(), Math.max(0, this.filteredLadder().length - this.shownCount())));

  private readonly rankChanges = computed(() => {
    const index = this.index();
    if (!hasScanChanges(index) || !this.defaultScope()) {
      return undefined;
    }

    const standings = this.memberStandings();
    return guildRankChanges(this.ladder().map(entry => ({
      key: entry.player.key,
      rank: entry.rank,
      previousOverallRank: previousOverallRank(standings.get(entry.player.key))
    })));
  });

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

  private readonly overallFilters = computed<Params>(() => ({
    view: 'players',
    period: this.period() === 'week' ? 'week' : undefined,
    dungeon: this.selectedDungeon()?.id,
    role: this.roleFilter(),
    class: this.classFilter(),
    spec: this.specFilter()
  }));

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
        link: best && mythicPlusProfileLink(best.player.member)
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
    setPageHeader(() => ({ lastEdited: this.lastEdited() }));
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

  showRoles(on: boolean): void {
    if (on === !!this.roleFilter()) {
      return;
    }
    this.roleFilter.set(on ? 'tank' : undefined);
    this.classFilter.set(undefined);
    this.specFilter.set(undefined);
    this.resetRows();
  }

  setRole(role: Role): void {
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

  private resetRows(): void {
    this.limit.set(this.pageSize());
    this.writeUrl();
  }

  private writeUrl(): void {
    const guild = this.guild();
    if (!guild) {
      return;
    }

    const highlight = this.highlightParam();
    this.replaceUrl({
      period: this.period() === 'week' ? 'week' : null,
      dungeon: this.selectedDungeon()?.id ?? null,
      role: this.roleFilter() ?? null,
      class: this.classFilter() ?? null,
      spec: this.specFilter() ?? null,
      character: highlight ? characterParam(highlight) : null
    }, { path: guildLadderLink(guild) });
  }

  loadData(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.mythicPlusData.season()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ index, runs }) => {
          this.index.set(index);
          this.allRuns.set(runs);
          this.isLoading.set(false);
        },
        error: error => {
          console.error('Failed to load the Mythic+ guild ladder:', error);
          this.loadError.set(mythicPlusLoadError(error));
          this.isLoading.set(false);
        }
      });
  }
}
