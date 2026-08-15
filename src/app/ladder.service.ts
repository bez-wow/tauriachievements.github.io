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
  appearanceCount: number;
  appearanceCountDelta: number;
  appearanceRankDelta: number;
  achievementsTotal: number;
  achievementsTotalDelta: number;
  achievementsTotalRankDelta: number;
  playedTime: number;
  playedTimeDelta: number;
  playedTimeRankDelta: number;
  ilvl: number;
  characterAge: string;
  isNewCharacter: boolean;
  faction: 'Horde' | 'Alliance';
}

export interface RankedLadderPlayer extends LadderAchievement {
  achievementRank: number;
  honorableKillRank: number;
}

interface IndexedLadderPlayer {
  view: LadderAchievement;
  nameLower: string;
  guildLower: string;
}

interface LadderIndexes {
  achievementPoints: IndexedLadderPlayer[];
  achievementsTotal: IndexedLadderPlayer[];
  honorableKills: IndexedLadderPlayer[];
  playedTime: IndexedLadderPlayer[];
  appearanceCount: IndexedLadderPlayer[];
  ilvl: IndexedLadderPlayer[];
}

@Injectable({ providedIn: 'root' })
export class LadderService {
  private indexedSource?: Player[];
  private indexes?: LadderIndexes;

  constructor(private dataSyncService: DataSyncService) {}

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

  getAppearances(
    realm?: string,
    faction?: string,
    playerClass?: number,
    searchTerm?: string,
    pageNumber: number = 1,
    pageSize: number = 1000
  ): Observable<LadderAchievement[]> {
    return this.getRankedPlayers('appearanceCount', realm, faction, playerClass, searchTerm, pageNumber, pageSize);
  }

  getAccountWideAchievements(
    realm?: string,
    faction?: string,
    playerClass?: number,
    searchTerm?: string,
    pageNumber: number = 1,
    pageSize: number = 1000
  ): Observable<LadderAchievement[]> {
    return this.getRankedPlayers('achievementsTotal', realm, faction, playerClass, searchTerm, pageNumber, pageSize);
  }

  getPlaytime(
    realm?: string,
    faction?: string,
    playerClass?: number,
    searchTerm?: string,
    pageNumber: number = 1,
    pageSize: number = 1000
  ): Observable<LadderAchievement[]> {
    return this.getRankedPlayers('playedTime', realm, faction, playerClass, searchTerm, pageNumber, pageSize);
  }

  getItemLevel(
    realm?: string,
    faction?: string,
    playerClass?: number,
    searchTerm?: string,
    pageNumber: number = 1,
    pageSize: number = 1000
  ): Observable<LadderAchievement[]> {
    return this.getRankedPlayers('ilvl', realm, faction, playerClass, searchTerm, pageNumber, pageSize);
  }

  getRankedPlayer(name: string, realm: string): Observable<RankedLadderPlayer | undefined> {
    const nameLower = name.trim().toLowerCase();
    const realmLower = realm.trim().toLowerCase();

    return this.dataSyncService.getPlayers().pipe(
      map(players => {
        const indexes = this.getOrBuildIndexes(players);
        const achievementRank = this.findRank(indexes.achievementPoints, nameLower, realmLower);
        const honorableKillRank = this.findRank(indexes.honorableKills, nameLower, realmLower);

        if (!achievementRank || !honorableKillRank) {
          return undefined;
        }

        return {
          ...indexes.achievementPoints[achievementRank - 1].view,
          achievementRank,
          honorableKillRank
        };
      })
    );
  }

  private findRank(players: IndexedLadderPlayer[], nameLower: string, realmLower: string): number {
    for (let index = 0; index < players.length; index++) {
      const player = players[index];
      if (player.nameLower === nameLower && player.view.realm.toLowerCase() === realmLower) {
        return index + 1;
      }
    }

    return 0;
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
        const sortedPlayers = indexes[sort];

        if (!this.hasCohortFilter(realm, faction, playerClass)) {
          return this.collectPage(sortedPlayers, realm, faction, playerClass, searchTerm, pageNumber, pageSize);
        }

        return this.collectFilteredPage(
          sortedPlayers,
          sort,
          realm,
          faction,
          playerClass,
          searchTerm?.trim().toLowerCase(),
          pageNumber,
          pageSize
        );
      })
    );
  }

  private collectFilteredPage(
    sortedPlayers: IndexedLadderPlayer[],
    sort: LadderSort,
    realm?: string,
    faction?: string,
    playerClass?: number,
    normalizedSearchTerm?: string,
    pageNumber: number = 1,
    pageSize: number = 1000
  ): LadderAchievement[] {
    const cohort = sortedPlayers.filter(player =>
      this.matchesFilters(player, realm, faction, playerClass, undefined)
    );

    const rankDeltaByKey = this.buildCohortRankDeltas(cohort, sort);

    const visible = normalizedSearchTerm
      ? cohort.filter(player =>
          player.nameLower.includes(normalizedSearchTerm)
          || player.guildLower.includes(normalizedSearchTerm))
      : cohort;

    return this.paginate(visible, pageNumber, pageSize).map(player =>
      this.withFilteredRankDelta(
        player.view,
        sort,
        rankDeltaByKey.get(this.getPlayerKey(player.view)) ?? 0
      )
    );
  }

  private buildCohortRankDeltas(cohort: IndexedLadderPlayer[], sort: LadderSort): Map<string, number> {
    const currentRank = new Map<string, number>();
    cohort.forEach((player, index) => {
      currentRank.set(this.getPlayerKey(player.view), index + 1);
    });

    const comparePrevious = this.getPreviousComparator(sort);

    const previousOrder = cohort
      .filter(player => !player.view.isNewCharacter)
      .sort(comparePrevious);

    const previousRank = new Map<string, number>();
    previousOrder.forEach((player, index) => {
      previousRank.set(this.getPlayerKey(player.view), index + 1);
    });

    const rankDeltaByKey = new Map<string, number>();
    for (const player of cohort) {
      const key = this.getPlayerKey(player.view);
      const previous = previousRank.get(key);
      const current = currentRank.get(key) ?? 0;
      rankDeltaByKey.set(key, previous && current ? previous - current : 0);
    }

    return rankDeltaByKey;
  }

  private withFilteredRankDelta(view: LadderAchievement, sort: LadderSort, rankDelta: number): LadderAchievement {
    switch (sort) {
      case 'achievementPoints':
        return { ...view, achievementRankDelta: rankDelta };
      case 'achievementsTotal':
        return { ...view, achievementsTotalRankDelta: rankDelta };
      case 'honorableKills':
        return { ...view, honorableKillsRankDelta: rankDelta };
      case 'playedTime':
        return { ...view, playedTimeRankDelta: rankDelta };
      case 'appearanceCount':
        return { ...view, appearanceRankDelta: rankDelta };
      case 'ilvl':
        return view;
    }
  }

  private paginate<T>(items: T[], pageNumber: number, pageSize: number): T[] {
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
    return items.slice(start, start + safePageSize);
  }

  private hasCohortFilter(realm?: string, faction?: string, playerClass?: number): boolean {
    const realmActive = !!realm && realm !== 'All Realms';
    const factionActive = !!faction && faction !== 'All Factions';
    const classActive = playerClass !== undefined && playerClass !== null && !Number.isNaN(playerClass);

    return realmActive || factionActive || classActive;
  }

  private getOrBuildIndexes(players: Player[]): LadderIndexes {
    if (this.indexedSource === players && this.indexes) {
      return this.indexes;
    }

    const indexedPlayers = players.map(player => this.toIndexedLadderPlayer(player));
    const indexes: LadderIndexes = {
      achievementPoints: [...indexedPlayers].sort((a, b) => this.compareAchievementPlayers(a.view, b.view)),
      achievementsTotal: [...indexedPlayers].sort((a, b) => this.compareAchievementsTotalPlayers(a.view, b.view)),
      honorableKills: [...indexedPlayers].sort((a, b) => this.compareHonorableKillPlayers(a.view, b.view)),
      playedTime: [...indexedPlayers].sort((a, b) => this.comparePlayedTimePlayers(a.view, b.view)),
      appearanceCount: [...indexedPlayers].sort((a, b) => this.compareAppearancePlayers(a.view, b.view)),
      ilvl: [...indexedPlayers].sort((a, b) => this.compareItemLevelPlayers(a.view, b.view))
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
        appearanceCount: player.appearanceCount,
        appearanceCountDelta: player.appearanceCountDelta,
        appearanceRankDelta: player.appearanceRankDelta,
        achievementsTotal: player.achievementsTotal,
        achievementsTotalDelta: player.achievementsTotalDelta,
        achievementsTotalRankDelta: player.achievementsTotalRankDelta,
        playedTime: player.playedTime,
        playedTimeDelta: player.playedTimeDelta,
        playedTimeRankDelta: player.playedTimeRankDelta,
        ilvl: player.ilvl,
        characterAge: player.characterAge,
        isNewCharacter: player.isNewCharacter,
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

  private compareAchievementsTotalPlayers(left: LadderAchievement, right: LadderAchievement): number {
    if (right.achievementsTotal !== left.achievementsTotal) {
      return right.achievementsTotal - left.achievementsTotal;
    }

    if (right.achievementPoints !== left.achievementPoints) {
      return right.achievementPoints - left.achievementPoints;
    }

    if (right.honorableKills !== left.honorableKills) {
      return right.honorableKills - left.honorableKills;
    }

    return this.getPlayerKey(left).localeCompare(this.getPlayerKey(right));
  }

  private comparePlayedTimePlayers(left: LadderAchievement, right: LadderAchievement): number {
    if (right.playedTime !== left.playedTime) {
      return right.playedTime - left.playedTime;
    }

    if (right.achievementPoints !== left.achievementPoints) {
      return right.achievementPoints - left.achievementPoints;
    }

    if (right.honorableKills !== left.honorableKills) {
      return right.honorableKills - left.honorableKills;
    }

    return this.getPlayerKey(left).localeCompare(this.getPlayerKey(right));
  }

  private compareAppearancePlayers(left: LadderAchievement, right: LadderAchievement): number {
    if (right.appearanceCount !== left.appearanceCount) {
      return right.appearanceCount - left.appearanceCount;
    }

    if (right.achievementPoints !== left.achievementPoints) {
      return right.achievementPoints - left.achievementPoints;
    }

    if (right.honorableKills !== left.honorableKills) {
      return right.honorableKills - left.honorableKills;
    }

    return this.getPlayerKey(left).localeCompare(this.getPlayerKey(right));
  }

  private compareItemLevelPlayers(left: LadderAchievement, right: LadderAchievement): number {
    if (right.ilvl !== left.ilvl) {
      return right.ilvl - left.ilvl;
    }

    if (right.achievementPoints !== left.achievementPoints) {
      return right.achievementPoints - left.achievementPoints;
    }

    return this.getPlayerKey(left).localeCompare(this.getPlayerKey(right));
  }

  private comparePreviousAchievementPlayers(left: LadderAchievement, right: LadderAchievement): number {
    const leftPoints = left.achievementPoints - left.achievementPointsDelta;
    const rightPoints = right.achievementPoints - right.achievementPointsDelta;
    if (rightPoints !== leftPoints) {
      return rightPoints - leftPoints;
    }

    const leftKills = left.honorableKills - left.honorableKillsDelta;
    const rightKills = right.honorableKills - right.honorableKillsDelta;
    if (rightKills !== leftKills) {
      return rightKills - leftKills;
    }

    return this.getPlayerKey(left).localeCompare(this.getPlayerKey(right));
  }

  private comparePreviousHonorableKillPlayers(left: LadderAchievement, right: LadderAchievement): number {
    const leftKills = left.honorableKills - left.honorableKillsDelta;
    const rightKills = right.honorableKills - right.honorableKillsDelta;
    if (rightKills !== leftKills) {
      return rightKills - leftKills;
    }

    const leftPoints = left.achievementPoints - left.achievementPointsDelta;
    const rightPoints = right.achievementPoints - right.achievementPointsDelta;
    if (rightPoints !== leftPoints) {
      return rightPoints - leftPoints;
    }

    return this.getPlayerKey(left).localeCompare(this.getPlayerKey(right));
  }

  private comparePreviousAchievementsTotalPlayers(left: LadderAchievement, right: LadderAchievement): number {
    const leftTotal = left.achievementsTotal - left.achievementsTotalDelta;
    const rightTotal = right.achievementsTotal - right.achievementsTotalDelta;
    if (rightTotal !== leftTotal) {
      return rightTotal - leftTotal;
    }

    const leftPoints = left.achievementPoints - left.achievementPointsDelta;
    const rightPoints = right.achievementPoints - right.achievementPointsDelta;
    if (rightPoints !== leftPoints) {
      return rightPoints - leftPoints;
    }

    const leftKills = left.honorableKills - left.honorableKillsDelta;
    const rightKills = right.honorableKills - right.honorableKillsDelta;
    if (rightKills !== leftKills) {
      return rightKills - leftKills;
    }

    return this.getPlayerKey(left).localeCompare(this.getPlayerKey(right));
  }

  private comparePreviousPlayedTimePlayers(left: LadderAchievement, right: LadderAchievement): number {
    const leftPlayed = left.playedTime - left.playedTimeDelta;
    const rightPlayed = right.playedTime - right.playedTimeDelta;
    if (rightPlayed !== leftPlayed) {
      return rightPlayed - leftPlayed;
    }

    const leftPoints = left.achievementPoints - left.achievementPointsDelta;
    const rightPoints = right.achievementPoints - right.achievementPointsDelta;
    if (rightPoints !== leftPoints) {
      return rightPoints - leftPoints;
    }

    const leftKills = left.honorableKills - left.honorableKillsDelta;
    const rightKills = right.honorableKills - right.honorableKillsDelta;
    if (rightKills !== leftKills) {
      return rightKills - leftKills;
    }

    return this.getPlayerKey(left).localeCompare(this.getPlayerKey(right));
  }

  private comparePreviousAppearancePlayers(left: LadderAchievement, right: LadderAchievement): number {
    const leftAppearances = left.appearanceCount - left.appearanceCountDelta;
    const rightAppearances = right.appearanceCount - right.appearanceCountDelta;
    if (rightAppearances !== leftAppearances) {
      return rightAppearances - leftAppearances;
    }

    const leftPoints = left.achievementPoints - left.achievementPointsDelta;
    const rightPoints = right.achievementPoints - right.achievementPointsDelta;
    if (rightPoints !== leftPoints) {
      return rightPoints - leftPoints;
    }

    const leftKills = left.honorableKills - left.honorableKillsDelta;
    const rightKills = right.honorableKills - right.honorableKillsDelta;
    if (rightKills !== leftKills) {
      return rightKills - leftKills;
    }

    return this.getPlayerKey(left).localeCompare(this.getPlayerKey(right));
  }

  private getPreviousComparator(sort: LadderSort): (left: IndexedLadderPlayer, right: IndexedLadderPlayer) => number {
    switch (sort) {
      case 'achievementPoints':
        return (left, right) => this.comparePreviousAchievementPlayers(left.view, right.view);
      case 'achievementsTotal':
        return (left, right) => this.comparePreviousAchievementsTotalPlayers(left.view, right.view);
      case 'honorableKills':
        return (left, right) => this.comparePreviousHonorableKillPlayers(left.view, right.view);
      case 'playedTime':
        return (left, right) => this.comparePreviousPlayedTimePlayers(left.view, right.view);
      case 'appearanceCount':
        return (left, right) => this.comparePreviousAppearancePlayers(left.view, right.view);
      case 'ilvl':
        return (left, right) => this.compareItemLevelPlayers(left.view, right.view);
    }
  }

  private getPlayerKey(player: LadderAchievement): string {
    return `${player.realm}::${player.name}`;
  }
}
