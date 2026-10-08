import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
  memberNameMatches,
  rankPlayers,
  runIncludesCharacter,
  scoreQuality,
  sharesTables,
  upgradeStars
} from './mythic-plus';
import { affixWeeks, countTicks, dungeonTimers, isTimed, weekIndexAt } from './mythic-plus-activity';
import { COMPARE_LIMIT, compareParam, parseCompareParam, seriesColors } from './mythic-plus-compare';
import { characterParam, findCharacters, formatTopPercent, scopeRank, scoreOverTime } from './mythic-plus-profile';
import { MemberView, RunView, toMemberView, toRunView } from './mythic-plus-views';
import { ScrollToEndDirective } from './scroll-to-end.directive';
import { DataFileService } from './services/data-file.service';
import { TapTooltipDirective } from './tap-tooltip.directive';
import { UpdateBarComponent } from './update-bar.component';

const SEARCH_RESULT_COUNT = 8;
const RECENT_DAYS = 7;

interface ComparedPlayer {
  key: string;
  player: PlayerScore;
  member: MemberView;
  crest: string;
  /** Their line on the chart: the class colour, or a spare when two share a class. */
  color: string;
  quality: string;
  /** Their runs, newest first. */
  runs: MythicPlusRun[];
}

/** One line of the summary table: a cell per player, the best one marked. */
interface StatRow {
  label: string;
  hint?: string;
  /** `delta`: how far behind the best a value is, e.g. `−9.8`; only on the others. */
  cells: Array<{ text: string; sub?: string; best: boolean; delta?: string }>;
}

interface DungeonCell {
  run?: RunView;
  best: boolean;
  /** Points behind the best run in this dungeon among the compared players. */
  behind: number;
}

/** Two players: who leads in a dungeon and by how much, drawn as a bar towards the leader. */
interface Lead {
  /** Points between them; 0 is level. */
  points: number;
  /** The leader's side: 0 (left) or 1 (right). */
  side: 0 | 1;
  /** Bar length, in percent of half the column. */
  width: number;
  color: string;
}

interface DungeonRow {
  dungeon: RunView['dungeon'];
  cells: DungeonCell[];
  lead?: Lead;
}

interface ChartPoint {
  label: string;
  longLabel: string;
  showLabel: boolean;
  flip: boolean;
  middle: boolean;
  scores: Array<{ name: string; color: string; score: number; gap: number; runs: number; bottom: number }>;
}

interface WeekBand {
  start: number;
  span: number;
  affixes: MythicPlusAffix[];
  shade: boolean;
}

const percentOf = (part: number, whole: number) => whole > 0 ? (part / whole) * 100 : 0;
/** Gap axis marks, in points behind; those up to the largest gap are used. */
const GAP_TICKS = [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];

/**
 * /mythic-plus/compare?players=A-Realm,B-Realm: two to four characters side by side. Their
 * score and ranks, score over the season on one chart, and best run per dungeon with the gap to
 * the best of them.
 */
@Component({
  selector: 'app-mythic-plus-compare-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    UpdateBarComponent,
    BackToTopButtonComponent,
    TapTooltipDirective,
    ScrollToEndDirective
  ],
  templateUrl: './mythic-plus-compare-page.component.html',
  styleUrl: './mythic-plus-compare-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusComparePageComponent implements OnInit {
  private readonly dataFiles = inject(DataFileService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  private readonly phone = injectCompactViewport();
  readonly limit = COMPARE_LIMIT;

  readonly index = signal<MythicPlusIndex | undefined>(undefined);
  readonly lastEdited = computed(() => exportedAt(this.index()));
  readonly lastEditedTimeZoneLabel = computed(() => getLocalTimeZoneLabel(this.lastEdited()));
  readonly allRuns = signal<readonly MythicPlusRun[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  private reloadedForNewerData = false;

  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  private readonly wanted = computed(() => parseCompareParam(this.query().get('players')));

  readonly dungeons = computed(() => this.index()?.dungeons ?? []);
  private readonly dungeonsById = computed(() => new Map(this.dungeons().map(dungeon => [dungeon.id, dungeon])));
  private readonly affixesById = computed(() => new Map((this.index()?.affixes ?? []).map(affix => [affix.id, affix])));
  private readonly seasonBestScore = computed(() => Math.max(0, ...this.dungeons().map(dungeon => dungeon.bestScore)));
  private readonly timers = computed(() => dungeonTimers(this.dungeons()));

  readonly ranking = computed(() => rankPlayers(this.allRuns()));
  private readonly characters = computed(() =>
    this.ranking().map(player => ({ name: player.member.name, realm: player.member.realm, player })));

  /** The characters the URL names that the export has; unknown ones are listed apart. */
  readonly players = computed<ComparedPlayer[]>(() => {
    const characters = this.characters();
    const top = this.ranking()[0]?.score ?? 0;
    const found = this.wanted()
      .map(character => findCharacters(characters, character.realm, character.name)[0]?.player)
      .filter((player): player is PlayerScore => player !== undefined)
      .filter((player, position, list) => list.findIndex(other => other.key === player.key) === position);
    const members = found.map(player => toMemberView(player.member));
    const colors = seriesColors(members.map(member => member.color));
    return found.map((player, position) => ({
      key: player.key,
      player,
      member: members[position],
      crest: getClassCrestPath(player.member.class),
      color: colors[position],
      quality: scoreQuality(player.score, top),
      runs: this.allRuns().filter(run => runIncludesCharacter(run, player.key))
        .sort((a, b) => a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0)
    }));
  });
  readonly missing = computed(() => {
    const found = new Set(this.players().map(player => characterParam(player.player.member).toLowerCase()));
    return this.isLoading() ? [] : this.wanted().filter(character => !found.has(characterParam(character).toLowerCase()));
  });

  // Summary: the numbers that say who is ahead, best of each marked.
  readonly stats = computed<StatRow[]>(() => {
    const players = this.players();
    if (!players.length) {
      return [];
    }

    const ranking = this.ranking();
    const timers = this.timers();
    const recentFrom = Date.now() - RECENT_DAYS * 86_400_000;
    // Higher is better unless `lower`; ties all count as best. 0 / missing never wins.
    const row = (label: string, values: Array<number | undefined>, text: (value: number, position: number) => string,
      sub?: (value: number, position: number) => string | undefined, lower = false, hint?: string,
      delta: (gap: number) => string = gap => `−${gap.toLocaleString('en-GB', { maximumFractionDigits: 1 })}`): StatRow => {
      const valid = values.filter((value): value is number => value !== undefined && value > 0);
      const best = valid.length ? (lower ? Math.min(...valid) : Math.max(...valid)) : undefined;
      return {
        label,
        hint,
        cells: values.map((value, position) => {
          if (value === undefined) {
            return { text: '-', best: false };
          }
          const isBest = players.length > 1 && value === best;
          const gap = best === undefined ? 0 : Math.round(Math.abs(value - best) * 10) / 10;
          return {
            text: text(value, position),
            sub: sub?.(value, position),
            best: isBest,
            delta: players.length > 1 && !isBest && gap > 0 ? delta(gap) : undefined
          };
        })
      };
    };
    const behind = (gap: number) => `${gap.toLocaleString('en-GB')} behind`;

    const overall = players.map(player => scopeRank(ranking, player.key));
    const byClass = players.map(player => scopeRank(ranking, player.key, entry => entry.member.class === player.player.member.class));
    const bySpec = players.map(player => {
      const { class: classId, spec } = player.player.member;
      return scopeRank(rankPlayers(this.allRuns(), entry => entry.class === classId && entry.spec === spec), player.key);
    });
    const timed = players.map(player => player.runs.filter(run => isTimed(run, timers)));
    const bestRun = players.map(player => [...player.player.bestRuns.values()].sort((a, b) => b.score - a.score)[0]);
    const dungeons = this.dungeonsById();

    return [
      row('Score', players.map(player => player.player.score), value => value.toFixed(1)),
      row('Overall rank', overall.map(found => found?.rank), value => `#${value.toLocaleString('en-GB')}`,
        (value, position) => overall[position] && formatTopPercent(overall[position]!), true, undefined, behind),
      row('Class rank', byClass.map(found => found?.rank), value => `#${value.toLocaleString('en-GB')}`,
        (value, position) => `${CLASS_NAMES[players[position].player.member.class] ?? ''} · ${formatTopPercent(byClass[position]!)}`, true, undefined, behind),
      row('Spec rank', bySpec.map(found => found?.rank), value => `#${value.toLocaleString('en-GB')}`,
        (value, position) => `${players[position].player.member.spec} · ${formatTopPercent(bySpec[position]!)}`, true, undefined, behind),
      row('Best run', bestRun.map(run => run?.score), value => value.toFixed(1),
        (value, position) => {
          const run = bestRun[position];
          return run && `${dungeons.get(run.dungeon)?.shortName ?? run.dungeon} +${run.keyLevel}`;
        }),
      row('Highest timed key', timed.map(runs => Math.max(0, ...runs.map(run => run.keyLevel)) || undefined), value => `+${value}`),
      row('Runs', players.map(player => player.runs.length), value => value.toLocaleString('en-GB')),
      row('In time', players.map((player, position) => player.runs.length ? percentOf(timed[position].length, player.runs.length) : undefined),
        value => `${Math.round(value)}%`, (value, position) => `${timed[position].length.toLocaleString('en-GB')} timed`,
        false, undefined, gap => `−${Math.round(gap)}%`),
      row(`Last ${RECENT_DAYS} days`, players.map(player => player.runs.filter(run => Date.parse(run.completedAt) >= recentFrom).length),
        value => `${value} ${value === 1 ? 'run' : 'runs'}`, undefined, false, 'Who is playing most lately')
    ];
  });

  // Best run per dungeon, the best of them marked and the others' gap to it.
  readonly dungeonRows = computed<DungeonRow[]>(() => {
    const players = this.players();
    const affixes = this.affixesById();
    const bestScore = this.seasonBestScore();
    const rows: DungeonRow[] = this.dungeons().map(dungeon => {
      const runs = players.map(player => player.player.bestRuns.get(dungeon.id));
      const top = Math.max(0, ...runs.map(run => run?.score ?? 0));
      return {
        dungeon,
        cells: runs.map(run => ({
          run: run && toRunView(run, dungeon, affixes, bestScore),
          best: players.length > 1 && !!run && run.score === top,
          behind: Math.round((top - (run?.score ?? 0)) * 10) / 10
        }))
      };
    });

    // Two players: a bar per dungeon towards whoever leads, the longest for the biggest lead.
    if (players.length === 2) {
      const leads = rows.map(row => row.cells[1].behind - row.cells[0].behind);
      const largest = Math.max(1, ...leads.map(Math.abs));
      rows.forEach((row, index) => {
        const points = Math.round(Math.abs(leads[index]) * 10) / 10;
        const side = leads[index] >= 0 ? 0 : 1;
        row.lead = { points, side, width: (points / largest) * 100, color: players[side].color };
      });
    }
    return rows;
  });

  /** Two players: the score difference, the sum of the dungeon leads. */
  readonly totalLead = computed<Lead | undefined>(() => {
    const players = this.players();
    if (players.length !== 2) {
      return undefined;
    }
    const diff = Math.round((players[0].player.score - players[1].player.score) * 10) / 10;
    const side = diff >= 0 ? 0 : 1;
    // On the same scale as the dungeon bars, so a small overall lead looks small.
    const largest = Math.max(1, Math.abs(diff), ...this.dungeonRows().map(row => row.lead?.points ?? 0));
    return { points: Math.abs(diff), side, width: (Math.abs(diff) / largest) * 100, color: players[side].color };
  });

  // Score over the season, a line per player.
  private readonly weeks = computed(() => affixWeeks(this.allRuns()));
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

  /**
   * Score: everyone's score from 0. Gap: points behind the best of them that day, on a square-root
   * axis, so a 5-point gap late in the season shows as clearly as a 300-point one on day one.
   */
  readonly chartMode = signal<'score' | 'gap'>('score');

  readonly chart = computed(() => {
    const gapMode = this.chartMode() === 'gap';
    const players = this.players();
    const { first, last } = this.seasonSpan();
    const timelines = players.map(player => scoreOverTime(player.runs, first, last));
    const days = timelines[0] ?? [];
    if (!days.length) {
      return undefined;
    }

    // Each player's points behind the best of them, per day.
    const leader = days.map((_, position) => Math.max(0, ...timelines.map(timeline => timeline[position]?.score ?? 0)));
    const gapOf = (index: number, position: number) =>
      Math.round(((timelines[index][position]?.score ?? 0) - leader[position]) * 10) / 10;
    const largestGap = Math.max(1, ...timelines.flatMap((timeline, index) => timeline.map((_, position) => -gapOf(index, position))));
    const gapTop = Math.sqrt(GAP_TICKS.find(value => value >= largestGap) ?? largestGap);
    // The best of them sits a little under the top edge, clear of the affix icons.
    const gapPercent = (gap: number) => 90 - (Math.sqrt(Math.max(0, -gap)) / gapTop) * 90;
    // Marks at least 9% apart, so the small ones near the top don't run into each other.
    const gapTicks: number[] = [];
    for (const value of GAP_TICKS.filter(tick => tick <= largestGap)) {
      const last = gapTicks[gapTicks.length - 1];
      if (last === undefined || gapPercent(-last) - gapPercent(-value) >= 9) {
        gapTicks.push(value);
      }
    }
    const ticks = countTicks(Math.max(0, ...timelines.flatMap(timeline => timeline.map(day => day.score))));
    const top = ticks[ticks.length - 1];
    // Height in percent: score from 0 up, or the gap from the top (the best of them) down.
    const bottomOf = (index: number, position: number) => gapMode
      ? gapPercent(gapOf(index, position))
      : percentOf(timelines[index][position]?.score ?? 0, top);
    const count = days.length;
    const labelEvery = Math.max(1, Math.ceil(count / (this.phone() ? 6 : 12)));
    const weeks = this.weeks();
    const affixes = this.affixesById();
    const bands: WeekBand[] = [];
    let previousWeek: number | undefined;

    const points = days.map<ChartPoint>((day, position) => {
      const date = new Date(`${day.day}T12:00:00`);
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

      return {
        label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        longLabel: date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
        showLabel: position % labelEvery === 0,
        flip: position >= count / 2,
        middle: position >= count / 3 && position < (count * 2) / 3,
        scores: players
          .map((player, index) => {
            const at = timelines[index][position];
            return {
              name: player.member.name,
              color: player.color,
              score: at?.score ?? 0,
              gap: gapOf(index, position),
              runs: at?.runs ?? 0,
              bottom: bottomOf(index, position)
            };
          })
          .sort((a, b) => b.score - a.score)
      };
    });

    return {
      points,
      bands,
      viewBox: `0 0 ${count} 100`,
      lines: players.map((player, index) => ({
        color: player.color,
        points: timelines[index].map((day, position) => `${position + 0.5},${(100 - bottomOf(index, position)).toFixed(2)}`).join(' ')
      })),
      gridlines: gapMode
        ? gapTicks.map(value => ({ value: value ? `−${value.toLocaleString('en-GB')}` : 'Best', position: gapPercent(-value) }))
        : ticks.map(value => ({ value: value.toLocaleString('en-GB'), position: percentOf(value, top) }))
    };
  });


  // Add a player
  readonly searchQuery = signal('');
  readonly searchResults = computed(() => {
    const query = this.searchQuery().trim();
    const picked = new Set(this.players().map(player => player.key));
    return query
      ? this.ranking()
        .filter(player => !picked.has(player.key) && memberNameMatches(player.member, query))
        .slice(0, SEARCH_RESULT_COUNT)
        .map(player => ({ key: player.key, member: toMemberView(player.member), score: player.score }))
      : [];
  });

  readonly upgradeStars = upgradeStars;

  ngOnInit(): void {
    this.loadData();
  }

  /** The address with `members` compared. */
  paramsFor(members: ReadonlyArray<{ name: string; realm: string }>): { players: string | null } {
    return { players: members.length ? compareParam(members) : null };
  }

  addParams(member: { name: string; realm: string }): { players: string | null } {
    return this.paramsFor([...this.players().map(player => player.player.member), member]);
  }

  removeParams(key: string): { players: string | null } {
    return this.paramsFor(this.players().filter(player => player.key !== key).map(player => player.player.member));
  }

  /** The leaderboard's players view, picking more players, with these already picked. */
  readonly pickParams = computed(() => ({ view: 'players', compare: compareParam(this.players().map(player => player.player.member)) }));

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }


  trackKey(index: number, item: { key: string }): string {
    return item.key;
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
          console.error('Failed to load Mythic+ compare:', error);
          this.loadError.set('The Mythic+ runs could not be loaded.');
          this.isLoading.set(false);
        }
      });
  }
}
