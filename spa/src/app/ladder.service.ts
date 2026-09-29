import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Player, PlayerRankingField, PlayerRankings } from './models/character.model';
import { LadderSort } from './ladder.types';
import { DataSyncService, PlayerDataset } from './services/data-sync.service';

export interface LadderQuery {
  realm?: string;
  faction?: string;
  playerClass?: number;
  search?: string;
  /** Maximum number of rows to return. */
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

/** The change since the previous scan for each ranked field; item level has no history. */
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

/**
 * Serves the ladders. Players arrive already in achievement-point rank order, and the
 * other rankings follow the rules the build shipped with them (`PlayerRankings`): fields
 * compared highest-first, remaining ties kept in that order. Array#sort is stable, so this
 * reproduces the build's ranks exactly without the browser keeping its own comparators.
 */
@Injectable({ providedIn: 'root' })
export class LadderService {
  private readonly dataSyncService = inject(DataSyncService);
  private indexedSource?: Player[];
  private indexedPlayers: IndexedLadderPlayer[] = [];
  private readonly sortedIndexes = new Map<LadderSort, IndexedLadderPlayer[]>();

  getLadder(sort: LadderSort, query: LadderQuery): Observable<Player[]> {
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

  /** Sorted once per dataset and ranking, on first use. */
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
  ): Player[] {
    const cohort = sortedPlayers.filter((player) => this.matchesFilters(player, query, undefined));
    const rankDeltaField = RANK_DELTA_FIELD[sort];
    const rankDeltaByKey = rankDeltaField
      ? this.buildCohortRankDeltas(cohort, rankings?.[sort] ?? [sort])
      : new Map<string, number>();
    const normalizedSearch = query.search?.trim().toLowerCase();

    const visible = normalizedSearch
      ? cohort.filter((player) =>
        player.nameLower.includes(normalizedSearch) || player.guildLower.includes(normalizedSearch))
      : cohort;

    return this.take(visible, query.limit).map(({ player }) =>
      rankDeltaField
        ? { ...player, [rankDeltaField]: rankDeltaByKey.get(this.getPlayerKey(player)) ?? 0 }
        : player
    );
  }

  /**
   * Movement within a filtered population (a realm, faction or class): the current rank
   * inside the cohort against the rank the same cohort had in the previous scan.
   */
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

  private collectPage(players: IndexedLadderPlayer[], query: LadderQuery): Player[] {
    const normalizedSearch = query.search?.trim().toLowerCase();
    const limit = this.safeLimit(query.limit);
    const results: Player[] = [];

    for (const player of players) {
      if (results.length >= limit) {
        break;
      }

      if (this.matchesFilters(player, query, normalizedSearch)) {
        results.push(player.player);
      }
    }

    return results;
  }

  private take<T>(items: T[], limit: number): T[] {
    return items.slice(0, this.safeLimit(limit));
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

    if (normalizedSearch
      && !player.nameLower.includes(normalizedSearch)
      && !player.guildLower.includes(normalizedSearch)) {
      return false;
    }

    return true;
  }

  private getPlayerKey(player: Player): string {
    return `${player.realm}::${player.name}`;
  }
}

function currentValue(player: Player, field: PlayerRankingField): number {
  return player[field];
}

/** The value a field had in the previous scan. */
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
