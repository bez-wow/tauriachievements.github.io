import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Player, PlayerRankingField, PlayerRankings } from '../../players/character.model';
import { LadderRow, LadderSort } from './ladder.types';
import { DataSyncService, PlayerDataset } from '../../players/data-sync.service';

export interface LadderQuery {
  realm?: string;
  faction?: string;
  playerClass?: number;
  search?: string;
  limit: number;
}

export interface RankedLadderPlayer extends Player {
  achievementRank: number;
  honorableKillRank: number;
}

interface IndexedLadderPlayer {
  player: Player;
  nameLower: string;
  guildLower: string;
}

type DeltaField = keyof Pick<
  Player,
  'achievementPointsDelta' | 'honorableKillsDelta' | 'appearanceCountDelta' | 'achievementsTotalDelta' | 'playedTimeDelta'
>;
type RankDeltaField = keyof Pick<
  Player,
  'achievementRankDelta' | 'honorableKillsRankDelta' | 'appearanceRankDelta' | 'achievementsTotalRankDelta' | 'playedTimeRankDelta'
>;

const DELTA_FIELD: Readonly<Record<PlayerRankingField, DeltaField | undefined>> = {
  achievementPoints: 'achievementPointsDelta',
  honorableKills: 'honorableKillsDelta',
  appearanceCount: 'appearanceCountDelta',
  achievementsTotal: 'achievementsTotalDelta',
  playedTime: 'playedTimeDelta',
  ilvl: undefined
};

const RANK_DELTA_FIELD: Readonly<Record<LadderSort, RankDeltaField | undefined>> = {
  achievementPoints: 'achievementRankDelta',
  honorableKills: 'honorableKillsRankDelta',
  appearanceCount: 'appearanceRankDelta',
  achievementsTotal: 'achievementsTotalRankDelta',
  playedTime: 'playedTimeRankDelta',
  ilvl: undefined
};

@Injectable({ providedIn: 'root' })
export class LadderService {
  private readonly dataSyncService = inject(DataSyncService);
  private indexedSource?: Player[];
  private indexedPlayers: IndexedLadderPlayer[] = [];
  private readonly sortedIndexes = new Map<LadderSort, IndexedLadderPlayer[]>();

  getLadder(sort: LadderSort, query: LadderQuery): Observable<LadderRow[]> {
    return this.dataSyncService.getDataset().pipe(
      map((dataset) => {
        const sortedPlayers = this.getSortedIndex(dataset, sort);

        return this.hasCohortFilter(query)
          ? this.collectFilteredPage(sortedPlayers, sort, dataset.rankings, query)
          : this.collectPage(sortedPlayers, query);
      })
    );
  }

  getRankedPlayer(name: string, realm: string): Observable<RankedLadderPlayer | undefined> {
    const nameLower = name.trim().toLowerCase();
    const realmLower = realm.trim().toLowerCase();

    return this.dataSyncService.getDataset().pipe(
      map((dataset) => {
        const achievementRank = this.findRank(this.getSortedIndex(dataset, 'achievementPoints'), nameLower, realmLower);
        const honorableKillRank = this.findRank(this.getSortedIndex(dataset, 'honorableKills'), nameLower, realmLower);

        if (!achievementRank || !honorableKillRank) {
          return undefined;
        }

        return {
          ...this.getSortedIndex(dataset, 'achievementPoints')[achievementRank - 1].player,
          achievementRank,
          honorableKillRank
        };
      })
    );
  }

  private findRank(players: IndexedLadderPlayer[], nameLower: string, realmLower: string): number {
    for (let index = 0; index < players.length; index++) {
      const player = players[index];
      if (player.nameLower === nameLower && player.player.realm.toLowerCase() === realmLower) {
        return index + 1;
      }
    }

    return 0;
  }

  private getSortedIndex(dataset: PlayerDataset, sort: LadderSort): IndexedLadderPlayer[] {
    if (this.indexedSource !== dataset.players) {
      this.indexedSource = dataset.players;
      this.indexedPlayers = dataset.players.map((player) => ({
        player,
        nameLower: player.name.toLowerCase(),
        guildLower: player.guild.toLowerCase()
      }));
      this.sortedIndexes.clear();
    }

    let sorted = this.sortedIndexes.get(sort);
    if (!sorted) {
      const fields = sort === 'achievementPoints' ? [] : dataset.rankings?.[sort] ?? [];
      sorted = fields.length === 0
        ? this.indexedPlayers
        : [...this.indexedPlayers].sort((left, right) => compareByFields(left.player, right.player, fields));
      this.sortedIndexes.set(sort, sorted);
    }

    return sorted;
  }

  private collectFilteredPage(
    sortedPlayers: IndexedLadderPlayer[],
    sort: LadderSort,
    rankings: PlayerRankings | undefined,
    query: LadderQuery
  ): LadderRow[] {
    const cohort = sortedPlayers.filter((player) => this.matchesFilters(player, query, undefined));
    const rankDeltaField = RANK_DELTA_FIELD[sort];
    const rankDeltaByKey = rankDeltaField
      ? this.buildCohortRankDeltas(cohort, rankings?.[sort] ?? [sort])
      : new Map<string, number>();
    const normalizedSearch = query.search?.trim().toLowerCase();

    const visible = this.collectRanked(cohort, query.limit, (player) => this.matchesSearch(player, normalizedSearch));

    return rankDeltaField
      ? visible.map(({ player, rank }) => ({
        player: { ...player, [rankDeltaField]: rankDeltaByKey.get(this.getPlayerKey(player)) ?? 0 },
        rank
      }))
      : visible;
  }

  private buildCohortRankDeltas(
    cohort: IndexedLadderPlayer[],
    fields: readonly PlayerRankingField[]
  ): Map<string, number> {
    const currentRank = new Map<string, number>();
    cohort.forEach((player, index) => {
      currentRank.set(this.getPlayerKey(player.player), index + 1);
    });

    const previousOrder = cohort
      .filter((player) => !player.player.isNewCharacter)
      .sort((left, right) =>
        compareByFields(left.player, right.player, fields, previousValue)
        || this.getPlayerKey(left.player).localeCompare(this.getPlayerKey(right.player)));

    const previousRank = new Map<string, number>();
    previousOrder.forEach((player, index) => {
      previousRank.set(this.getPlayerKey(player.player), index + 1);
    });

    const rankDeltaByKey = new Map<string, number>();
    for (const { player } of cohort) {
      const key = this.getPlayerKey(player);
      const previous = previousRank.get(key);
      const current = currentRank.get(key) ?? 0;
      rankDeltaByKey.set(key, previous && current ? previous - current : 0);
    }

    return rankDeltaByKey;
  }

  private hasCohortFilter(query: LadderQuery): boolean {
    const realmActive = !!query.realm && query.realm !== 'All Realms';
    const factionActive = !!query.faction && query.faction !== 'All Factions';
    const classActive = query.playerClass !== undefined && query.playerClass !== null && !Number.isNaN(query.playerClass);

    return realmActive || factionActive || classActive;
  }

  private collectPage(players: IndexedLadderPlayer[], query: LadderQuery): LadderRow[] {
    const normalizedSearch = query.search?.trim().toLowerCase();

    return this.collectRanked(players, query.limit, (player) => this.matchesFilters(player, query, normalizedSearch));
  }

  private collectRanked(
    ladder: IndexedLadderPlayer[],
    limit: number,
    matches: (player: IndexedLadderPlayer) => boolean
  ): LadderRow[] {
    const safeLimit = this.safeLimit(limit);
    const rows: LadderRow[] = [];

    for (let index = 0; index < ladder.length && rows.length < safeLimit; index++) {
      if (matches(ladder[index])) {
        rows.push({ player: ladder[index].player, rank: index + 1 });
      }
    }

    return rows;
  }

  private safeLimit(limit: number): number {
    return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
  }

  private matchesFilters(player: IndexedLadderPlayer, query: LadderQuery, normalizedSearch: string | undefined): boolean {
    const { realm, faction, playerClass } = query;

    if (realm && realm !== 'All Realms' && player.player.realm !== realm) {
      return false;
    }

    if (faction && faction !== 'All Factions' && player.player.faction !== faction) {
      return false;
    }

    if (playerClass !== undefined && playerClass !== null && !Number.isNaN(playerClass) && player.player.class !== playerClass) {
      return false;
    }

    return this.matchesSearch(player, normalizedSearch);
  }

  private matchesSearch(player: IndexedLadderPlayer, normalizedSearch: string | undefined): boolean {
    return !normalizedSearch
      || player.nameLower.includes(normalizedSearch)
      || player.guildLower.includes(normalizedSearch);
  }

  private getPlayerKey(player: Player): string {
    return `${player.realm}::${player.name}`;
  }
}

function currentValue(player: Player, field: PlayerRankingField): number {
  return player[field];
}

function previousValue(player: Player, field: PlayerRankingField): number {
  const deltaField = DELTA_FIELD[field];
  return deltaField ? player[field] - player[deltaField] : player[field];
}

function compareByFields(
  left: Player,
  right: Player,
  fields: readonly PlayerRankingField[],
  valueOf: (player: Player, field: PlayerRankingField) => number = currentValue
): number {
  for (const field of fields) {
    const difference = valueOf(right, field) - valueOf(left, field);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}
