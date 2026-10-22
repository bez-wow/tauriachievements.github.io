import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, RouterLink } from '@angular/router';
import { getClassCrestPath } from '../../game/classIconHelper';
import { injectCompactViewport } from '../../shared/compact-viewport';
import {
  MythicPlusIndex,
  MythicPlusRun,
  PlayerScore,
  characterKey,
  exportedAt,
  keystoneUpgrades,
  memberNameMatches,
  rankPlayers,
  rankRuns,
  runIncludesCharacter,
  scoreColor,
  seasonScoreColors,
  upgradeStars,
  ROLE_LABELS
} from './mythic-plus';
import { affixWeeks, localDay } from './mythic-plus-activity';
import {
  ScopeRank,
  characterParam,
  findCharacters,
  formatTopPercent,
  frequentTeammates,
  pageOfRank,
  profileScanChange,
  rankChangeLabel,
  runSummary,
  runTimeSpan,
  scopeRank,
  scoreChangeLabel,
  scoreChart,
  scoreOverTime,
  specsPlayed
} from './mythic-plus-profile';
import { compareParam } from './mythic-plus-compare';
import { guildLadderLink, guildOf, inGuild } from './mythic-plus-guild';
import { MythicPlusRunsListComponent } from './mythic-plus-runs-list.component';
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
import { CountUpDirective } from '../../shared/motion/count-up.directive';
import { characterTransitionName } from '../../shared/motion/motion';
import { RevealDirective } from '../../shared/motion/reveal.directive';
import { ScrollToEndDirective } from '../../shared/motion/scroll-to-end.directive';
import { MythicPlusDataService, mythicPlusLoadError } from './mythic-plus-data.service';
import { SpotlightDirective } from '../../shared/motion/spotlight.directive';
import { TapTooltipDirective } from '../../shared/tap-tooltip.directive';
import { CLASS_NAMES, Role, realmSlug } from '../../game/wow';
import { specIconFor, specRoleFor } from '../../game/wow-specs';
import { injectReplaceUrl } from '../../core/url-state';
import { LoadStateComponent } from '../../shared/load-state.component';
import { setPageHeader } from '../../core/page-header';
import { mythicPlusProfileLink } from '../../core/page-links';

const TEAMMATE_COUNT = 8;
const SEARCH_RESULT_COUNT = 20;

interface RankTile {
  scope: string;
  label: string;
  link: string[];
  icon?: string;
  role?: Role;
  rank: number;
  total: number;
  top: string;
  queryParams: Params;
  rankChange?: number;
  newSinceLastScan?: boolean;
}

interface DungeonBest {
  dungeon: RunView['dungeon'];
  run?: RunView;
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

interface CharacterLink {
  key: string;
  member: MemberView;
  score: number;
}

@Component({
  selector: 'app-mythic-plus-profile-page',
  imports: [
    RouterLink,
    TapTooltipDirective,
    ScrollToEndDirective,
    MythicPlusRunsListComponent,
    CountUpDirective,
    RevealDirective,
    SpotlightDirective,
    DatePipe,
    DecimalPipe,
    NgTemplateOutlet,
    LoadStateComponent
  ],
  templateUrl: './mythic-plus-profile-page.component.html',
  styleUrls: ['./mythic-plus-profile-page.component.scss', './mythic-plus-profile-page.motion.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusProfilePageComponent implements OnInit {
  private readonly mythicPlusData = inject(MythicPlusDataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly replaceUrl = injectReplaceUrl();

  readonly cards = injectCompactViewport(MYTHIC_PLUS_CARDS_QUERY);
  private readonly phone = injectCompactViewport();
  private readonly pageSize = computed(() => this.cards() ? MYTHIC_PLUS_CARDS_PAGE_SIZE : MYTHIC_PLUS_PAGE_SIZE);

  readonly index = signal<MythicPlusIndex | undefined>(undefined);
  readonly lastEdited = computed(() => exportedAt(this.index()));
  readonly allRuns = signal<readonly MythicPlusRun[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly urlRealm = computed(() => this.params().get('realm') ?? '');
  readonly urlName = computed(() => this.params().get('name') ?? '');
  private readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  readonly dungeons = computed(() => this.index()?.dungeons ?? []);
  private readonly dungeonsById = computed(() => new Map(this.dungeons().map(dungeon => [dungeon.id, dungeon])));
  private readonly affixesById = computed(() => new Map((this.index()?.affixes ?? []).map(affix => [affix.id, affix])));
  private readonly scoreColors = computed(() => seasonScoreColors(this.index()));

  readonly ranking = computed(() => rankPlayers(this.allRuns()));
  private readonly characters = computed(() =>
    this.ranking().map(player => ({ name: player.member.name, realm: player.member.realm, player })));
  private readonly runRanks = computed(() => new Map(rankRuns(this.allRuns()).map((run, position) => [run.id, position + 1])));

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
  readonly crestTransition = computed(() => {
    const key = this.player()?.key;
    return key ? characterTransitionName(key, 'crest') : null;
  });
  readonly nameTransition = computed(() => {
    const key = this.player()?.key;
    return key ? characterTransitionName(key, 'name') : null;
  });
  readonly showRunsParams = computed<Params>(() => {
    const member = this.player()?.member;
    return member ? { character: characterParam(member) } : {};
  });
  readonly realmName = computed(() => {
    const slug = realmSlug(this.urlRealm());
    return this.characters().find(character => realmSlug(character.realm) === slug)?.realm ?? this.urlRealm();
  });

  readonly ambiguous = computed<CharacterLink[]>(() =>
    this.matches().length > 1 ? this.matches().map(toCharacterLink) : []);

  readonly runs = computed(() => {
    const key = this.key();
    return key
      ? this.allRuns().filter(run => runIncludesCharacter(run, key))
        .sort((a, b) => a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0)
      : [];
  });

  readonly scanChange = computed(() => profileScanChange(this.index(), this.key()));

  readonly specs = computed(() => {
    const player = this.player();
    return player
      ? specsPlayed(this.runs(), player.key, player.member.spec)
        .map(played => ({ ...played, icon: specIconFor(played.class, played.spec) }))
      : [];
  });

  private readonly pickedSpec = linkedSignal<{ key?: string; spec?: string }, string | undefined>({
    source: () => ({ key: this.key(), spec: this.queryParams().get('spec') ?? undefined }),
    computation: ({ spec }) => spec
  });
  readonly selectedSpec = computed(() => {
    const spec = this.pickedSpec();
    const specs = this.specs();
    return specs.length > 1 && specs.some(played => played.spec === spec) ? spec : undefined;
  });

  readonly specRuns = computed(() => {
    const spec = this.selectedSpec();
    const key = this.key();
    return spec
      ? this.runs().filter(run => run.roster.some(member => member.spec === spec && characterKey(member) === key))
      : this.runs();
  });

  private readonly specRanking = computed(() => {
    const member = this.player()?.member;
    const spec = this.selectedSpec() ?? member?.spec;
    return member
      ? rankPlayers(this.allRuns(), entry => entry.class === member.class && entry.spec === spec)
      : [];
  });

  private readonly tileRole = computed(() => {
    const member = this.player()?.member;
    return member && (specRoleFor(member.class, this.selectedSpec() ?? member.spec) ?? member.role);
  });

  private readonly roleRanking = computed(() => {
    const role = this.tileRole();
    return role ? rankPlayers(this.allRuns(), entry => entry.role === role) : [];
  });

  readonly shownScore = computed<PlayerScore | undefined>(() => {
    const key = this.key();
    return this.selectedSpec() ? this.specRanking().find(entry => entry.key === key) : this.player();
  });

  readonly color = computed(() => scoreColor(this.shownScore()?.score ?? 0, this.scoreColors().tiers));

  readonly headerScanChange = computed(() => this.selectedSpec() ? undefined : this.scanChange());

  readonly notPlayedLabel = computed(() => {
    const spec = this.selectedSpec();
    return spec ? `Not played as ${spec}` : 'Not played';
  });

  readonly summary = computed(() => runSummary(this.specRuns(), this.dungeons()));

  readonly ranks = computed<RankTile[]>(() => {
    const player = this.player();
    if (!player) {
      return [];
    }

    const { key, member } = player;
    const realm = realmSlug(member.realm);
    const className = CLASS_NAMES[member.class] ?? 'Unknown';
    const spec = this.selectedSpec() ?? member.spec;
    const role = this.tileRole();
    const ranking = this.ranking();
    const tile = (scope: string, label: string, found: ScopeRank | undefined, filters: Params, icon?: string): RankTile[] => {
      if (!found) {
        return [];
      }

      const page = pageOfRank(found.position ?? found.rank, this.pageSize());
      return [{
        scope,
        label,
        link: ['/mythic-plus'],
        icon,
        ...found,
        top: formatTopPercent(found),
        queryParams: { view: 'players', ...filters, character: characterParam(member), page: page > 1 ? page : undefined },
        rankChange: scope === 'Overall' ? this.scanChange()?.rank : undefined,
        newSinceLastScan: scope === 'Overall' && this.scanChange()?.isNew
      }];
    };

    const guild = guildOf(member);
    const isMember = guild && inGuild(guild);
    const guildRank = isMember && scopeRank(ranking, key, entry => isMember(entry.member));
    const guildTile: RankTile[] = guild && guildRank
      ? [{
        scope: 'Guild',
        label: guild.name,
        link: guildLadderLink(guild),
        ...guildRank,
        top: formatTopPercent(guildRank),
        queryParams: { character: characterParam(member) }
      }]
      : [];

    return [
      ...tile('Overall', 'All realms', scopeRank(ranking, key), {}),
      ...tile('Realm', member.realm, scopeRank(ranking, key, entry => realmSlug(entry.member.realm) === realm), { realm }),
      ...guildTile,
      ...tile('Class', className, scopeRank(ranking, key, entry => entry.member.class === member.class),
        { class: member.class }, this.member()?.classIcon),
      ...tile('Spec', `${spec} ${className}`, scopeRank(this.specRanking(), key),
        { class: member.class, spec }, specIconFor(member.class, spec)),
      ...(role ? tile('Role', ROLE_LABELS[role], scopeRank(this.roleRanking(), key), { role }).map(found => ({ ...found, role })) : [])
    ];
  });

  readonly dungeonBests = computed<DungeonBest[]>(() => {
    const bestRuns = this.shownScore()?.bestRuns;
    const affixes = this.affixesById();
    const colors = this.scoreColors();
    return this.dungeons().map(dungeon => {
      const run = bestRuns?.get(dungeon.id);
      return { dungeon, run: run && toRunView(run, dungeon, affixes, colors) };
    });
  });

  readonly upgradeStars = upgradeStars;
  readonly rankChangeLabel = rankChangeLabel;
  readonly scoreChangeLabel = scoreChangeLabel;

  private readonly weeks = computed(() => affixWeeks(this.allRuns()));
  private readonly seasonSpan = computed(() => runTimeSpan(this.allRuns()));
  readonly timeline = computed(() => {
    const { first, last } = this.seasonSpan();
    return this.player() ? scoreOverTime(this.specRuns(), first, last) : [];
  });

  readonly chart = computed(() => scoreChart(this.timeline(), this.weeks(), this.affixesById(), this.phone() ? 6 : 12));

  readonly expandedRunId = linkedSignal<string | undefined, string | undefined>({ source: this.key, computation: () => undefined });
  readonly historyLimit = linkedSignal<string | undefined, number>({ source: this.key, computation: () => this.pageSize() });
  readonly historyOrder = linkedSignal<string | undefined, 'best' | 'latest'>({ source: this.key, computation: () => 'latest' });
  readonly selectedDay = linkedSignal<string | undefined, string | undefined>({ source: this.key, computation: () => undefined });
  readonly selectedDayLabel = computed(() => {
    const day = this.selectedDay();
    return day ? new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : undefined;
  });
  readonly historyRuns = computed(() => {
    const day = this.selectedDay();
    const runs = day ? this.specRuns().filter(run => localDay(new Date(run.completedAt)) === day) : this.specRuns();
    const ranks = this.runRanks();
    const rankOf = (id: string) => ranks.get(id) || Number.MAX_SAFE_INTEGER;
    return this.historyOrder() === 'best' ? [...runs].sort((a, b) => rankOf(a.id) - rankOf(b.id)) : runs;
  });
  readonly historyRows = computed<RunRow[]>(() => {
    const dungeons = this.dungeonsById();
    const affixes = this.affixesById();
    const colors = this.scoreColors();
    const ranks = this.runRanks();
    return this.historyRuns().slice(0, this.historyLimit()).flatMap(run => {
      const dungeon = dungeons.get(run.dungeon);
      return dungeon ? [{ ...toRunView(run, dungeon, affixes, colors), rank: ranks.get(run.id) ?? 0 }] : [];
    });
  });
  readonly nextRuns = computed(() => Math.min(this.pageSize(), Math.max(0, this.historyRuns().length - this.historyLimit())));

  readonly teammates = computed<TeammateView[]>(() => {
    const key = this.key();
    const dungeons = this.dungeonsById();
    return key
      ? frequentTeammates(this.specRuns(), key, TEAMMATE_COUNT).map(mate => {
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

  readonly compareOpen = linkedSignal<string | undefined, boolean>({ source: this.key, computation: () => false });
  readonly compareQuery = linkedSignal<string | undefined, string>({ source: this.key, computation: () => '' });
  readonly compareResults = computed<CharacterLink[]>(() => {
    const query = this.compareQuery().trim();
    const key = this.key();
    return query
      ? this.ranking()
        .filter(player => player.key !== key && memberNameMatches(player.member, query))
        .slice(0, 8)
        .map(toCharacterLink)
      : [];
  });
  readonly comparePickParams = computed<Params>(() => {
    const member = this.player()?.member;
    return member ? { view: 'players', compare: characterParam(member) } : {};
  });

  compareParams(other: { name: string; realm: string }): Params {
    const member = this.player()?.member;
    return { players: compareParam(member ? [member, other] : [other]) };
  }

  onCompareSearch(event: Event): void {
    this.compareQuery.set((event.target as HTMLInputElement).value);
  }

  constructor() {
    setPageHeader(() => ({ lastEdited: this.lastEdited() }));
    effect(() => {
      const member = this.player()?.member;
      if (member && (member.name !== this.urlName() || realmSlug(member.realm) !== this.urlRealm())) {
        untracked(() => this.writeUrl(member));
      }
    });
  }

  private writeUrl(member: { name: string; realm: string }): void {
    this.replaceUrl({ spec: this.selectedSpec() ?? null }, { path: mythicPlusProfileLink(member) });
  }

  ngOnInit(): void {
    this.loadData();
  }

  selectSpec(spec: string | undefined): void {
    const member = this.player()?.member;
    const next = spec === this.selectedSpec() ? undefined : spec;
    if (!member || next === this.selectedSpec()) {
      return;
    }

    this.pickedSpec.set(next);
    this.selectedDay.set(undefined);
    this.historyLimit.set(this.pageSize());
    this.expandedRunId.set(undefined);
    this.writeUrl(member);
  }

  toggleRun(runId: string): void {
    this.expandedRunId.update(current => current === runId ? undefined : runId);
  }

  selectDay(day: string | undefined, runs = 1): void {
    if (!runs) {
      return;
    }
    this.selectedDay.update(current => current === day ? undefined : day);
    this.historyLimit.set(this.pageSize());
    this.expandedRunId.set(undefined);
  }

  setHistoryOrder(order: 'best' | 'latest'): void {
    if (order === this.historyOrder()) {
      return;
    }
    this.historyOrder.set(order);
    this.historyLimit.set(this.pageSize());
    this.expandedRunId.set(undefined);
  }

  showMoreRuns(): void {
    this.historyLimit.update(limit => limit + this.pageSize());
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
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
          console.error('Failed to load Mythic+ profile:', error);
          this.loadError.set(mythicPlusLoadError(error));
          this.isLoading.set(false);
        }
      });
  }
}

function toCharacterLink(player: PlayerScore): CharacterLink {
  return { key: player.key, member: toMemberView(player.member), score: player.score };
}
