import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { DataSyncService } from './services/data-sync.service';
import { Player } from './models/character.model';
import { LadderSort } from './ladder.types';

export interface LadderAchievement {
  name: string;
  race: number;
  gender: number;
  class: number;
  realm: string;
  guild: string;
  achievementPoints: number;
  achievementPointsDelta: number;
  achievementRankDelta: number;
  honorableKills: number;
  honorableKillsDelta: number;
  honorableKillsRankDelta: number;
  faction: 'Horde' | 'Alliance';
}

export interface LadderPlayerProfileSummary {
  playerKey: string;
  name: string;
  race: number;
  gender: number;
  classId: number;
  realm: string;
  guild: string;
  achievementPoints: number;
  achievementPointsDelta: number;
  achievementRank: number;
  achievementRankDelta: number;
  honorableKills: number;
  honorableKillsDelta: number;
  honorableKillRank: number;
  honorableKillRankDelta: number;
  faction: string;
}

interface IndexedLadderPlayer {
  key: string;
  view: LadderAchievement;
  nameLower: string;
  guildLower: string;
}

interface LadderIndexes {
  achievementPoints: IndexedLadderPlayer[];
  honorableKills: IndexedLadderPlayer[];
  achievementRanks: Map<string, number>;
  honorableKillRanks: Map<string, number>;
  byKey: Map<string, IndexedLadderPlayer>;
}

@Injectable({ providedIn: 'root' })
export class LadderService {
  private indexedSource?: Player[];
  private indexes?: LadderIndexes;

  constructor(private dataSyncService: DataSyncService) {}

  /**
   * Get players sorted by achievement points with optional filters
   */
  getAchievements(
    realm?: string,
    faction?: string,
    playerClass?: number,
    searchTerm?: string,
    pageNumber: number = 1,
    pageSize: number = 1000
  ): Observable<LadderAchievement[]> {
    return this.getRankedPlayers('achievementPoints', realm, faction, playerClass, searchTerm, pageNumber, pageSize);
  }

  /**
   * Get players sorted by honorable kills with optional filters
   */
  getHonorableKills(
    realm?: string,
    faction?: string,
    playerClass?: number,
    searchTerm?: string,
    pageNumber: number = 1,
    pageSize: number = 1000
  ): Observable<LadderAchievement[]> {
    return this.getRankedPlayers('honorableKills', realm, faction, playerClass, searchTerm, pageNumber, pageSize);
  }

  getPlayerProfileSummary(realm: string, name: string): Observable<LadderPlayerProfileSummary | null> {
    return this.dataSyncService.getPlayers().pipe(
      map((players) => {
        const indexes = this.getOrBuildIndexes(players);
        const playerKey = this.getPlayerKeyFromValues(realm, name);
        const indexedPlayer = indexes.byKey.get(playerKey);

        if (!indexedPlayer) {
          return null;
        }

        const player = indexedPlayer.view;

        return {
          playerKey,
          name: player.name,
          race: player.race,
          gender: player.gender,
          classId: player.class,
          realm: player.realm,
          guild: player.guild,
          achievementPoints: player.achievementPoints,
          achievementPointsDelta: player.achievementPointsDelta,
          achievementRank: indexes.achievementRanks.get(playerKey) ?? 0,
          achievementRankDelta: player.achievementRankDelta,
          honorableKills: player.honorableKills,
          honorableKillsDelta: player.honorableKillsDelta,
          honorableKillRank: indexes.honorableKillRanks.get(playerKey) ?? 0,
          honorableKillRankDelta: player.honorableKillsRankDelta,
          faction: player.faction
        };
      })
    );
  }

  private getRankedPlayers(
    sort: LadderSort,
    realm?: string,
    faction?: string,
    playerClass?: number,
    searchTerm?: string,
    pageNumber: number = 1,
    pageSize: number = 1000
  ): Observable<LadderAchievement[]> {
    return this.dataSyncService.getPlayers().pipe(
      map(players => {
        const indexes = this.getOrBuildIndexes(players);
        const sortedPlayers = sort === 'achievementPoints'
          ? indexes.achievementPoints
          : indexes.honorableKills;

        return this.collectPage(sortedPlayers, realm, faction, playerClass, searchTerm, pageNumber, pageSize);
      })
    );
  }

  private getOrBuildIndexes(players: Player[]): LadderIndexes {
    if (this.indexedSource === players && this.indexes) {
      return this.indexes;
    }

    const indexedPlayers = players.map(player => this.toIndexedLadderPlayer(player));
    const achievementPoints = [...indexedPlayers].sort((a, b) => this.compareAchievementPlayers(a.view, b.view));
    const honorableKills = [...indexedPlayers].sort((a, b) => this.compareHonorableKillPlayers(a.view, b.view));
    const indexes: LadderIndexes = {
      achievementPoints,
      honorableKills,
      achievementRanks: this.buildRankMap(achievementPoints),
      honorableKillRanks: this.buildRankMap(honorableKills),
      byKey: new Map(indexedPlayers.map((player) => [player.key, player]))
    };

    this.indexedSource = players;
    this.indexes = indexes;

    return indexes;
  }

  private collectPage(
    players: IndexedLadderPlayer[],
    realm?: string,
    faction?: string,
    playerClass?: number,
    searchTerm?: string,
    pageNumber: number = 1,
    pageSize: number = 1000
  ): LadderAchievement[] {
    const normalizedSearchTerm = searchTerm?.trim().toLowerCase();
    const safePageNumber = Number.isFinite(pageNumber) && pageNumber > 0
      ? Math.floor(pageNumber)
      : 1;
    const safePageSize = Number.isFinite(pageSize) && pageSize > 0
      ? Math.floor(pageSize)
      : 0;

    if (safePageSize === 0) {
      return [];
    }

    const start = (safePageNumber - 1) * safePageSize;
    const end = start + safePageSize;
    const results: LadderAchievement[] = [];
    let matchIndex = 0;

    // Walk the chosen sorted list once and stop as soon as the requested page is filled.
    for (const player of players) {
      if (!this.matchesFilters(player, realm, faction, playerClass, normalizedSearchTerm)) {
        continue;
      }

      if (matchIndex >= start) {
        results.push(player.view);
      }

      matchIndex++;

      if (matchIndex >= end) {
        break;
      }
    }

    return results;
  }

  private matchesFilters(
    player: IndexedLadderPlayer,
    realm?: string,
    faction?: string,
    playerClass?: number,
    normalizedSearchTerm?: string
  ): boolean {
    if (realm && realm !== 'All Realms' && player.view.realm !== realm) {
      return false;
    }

    if (faction && faction !== 'All Factions' && player.view.faction !== faction) {
      return false;
    }

    if (playerClass !== undefined && playerClass !== null && !Number.isNaN(playerClass) && player.view.class !== playerClass) {
      return false;
    }

    if (normalizedSearchTerm
      && !player.nameLower.includes(normalizedSearchTerm)
      && !player.guildLower.includes(normalizedSearchTerm)) {
      return false;
    }

    return true;
  }

  private toIndexedLadderPlayer(player: Player): IndexedLadderPlayer {
    return {
      key: this.getPlayerKeyFromValues(player.realm, player.name),
      nameLower: player.name.toLowerCase(),
      guildLower: player.guild.toLowerCase(),
      view: {
        name: player.name,
        race: player.race,
        gender: player.gender,
        class: player.class,
        realm: player.realm,
        guild: player.guild,
        achievementPoints: player.achievementPoints,
        achievementPointsDelta: player.achievementPointsDelta,
        achievementRankDelta: player.achievementRankDelta,
        honorableKills: player.honorableKills,
        honorableKillsDelta: player.honorableKillsDelta,
        honorableKillsRankDelta: player.honorableKillsRankDelta,
        faction: (player.faction || 'Horde') as 'Horde' | 'Alliance'
      }
    };
  }

  private compareAchievementPlayers(left: LadderAchievement, right: LadderAchievement): number {
    if (right.achievementPoints !== left.achievementPoints) {
      return right.achievementPoints - left.achievementPoints;
    }

    if (right.honorableKills !== left.honorableKills) {
      return right.honorableKills - left.honorableKills;
    }

    return this.getPlayerKey(left).localeCompare(this.getPlayerKey(right));
  }

  private compareHonorableKillPlayers(left: LadderAchievement, right: LadderAchievement): number {
    if (right.honorableKills !== left.honorableKills) {
      return right.honorableKills - left.honorableKills;
    }

    if (right.achievementPoints !== left.achievementPoints) {
      return right.achievementPoints - left.achievementPoints;
    }

    return this.getPlayerKey(left).localeCompare(this.getPlayerKey(right));
  }

  private getPlayerKey(player: LadderAchievement): string {
    return this.getPlayerKeyFromValues(player.realm, player.name);
  }

  private getPlayerKeyFromValues(realm: string, name: string): string {
    return `${realm}::${name}`;
  }

  private buildRankMap(players: IndexedLadderPlayer[]): Map<string, number> {
    const ranks = new Map<string, number>();

    for (let index = 0; index < players.length; index++) {
      ranks.set(players[index].key, index + 1);
    }

    return ranks;
  }
}
