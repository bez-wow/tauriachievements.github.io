import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { DataSyncService } from './services/data-sync.service';
import { Player } from './models/character.model';

export interface LadderAchievement {
  name: string;
  race: number;
  gender: number;
  class: number;
  realm: string;
  guild: string;
  achievementPoints: number;
  honorableKills: number;
  mounts: number;
  faction: 'Horde' | 'Alliance';
}

@Injectable({ providedIn: 'root' })
export class LadderService {
  constructor(private dataSyncService: DataSyncService) {}

  /**
   * Get players sorted by achievement points with optional filters
   */
  getAchievements(
    realm?: string,
    faction?: string,
    playerClass?: number,
    pageNumber: number = 1,
    pageSize: number = 1000
  ): Observable<LadderAchievement[]> {
    return this.dataSyncService.getPlayers().pipe(
      map(players => {
        // Apply filters
        let filtered = this.applyFilters(players, realm, faction, playerClass);
        
        // Sort by achievement points descending
        filtered.sort((a, b) => b.achievementPoints - a.achievementPoints);
        
        // Apply pagination
        const start = (pageNumber - 1) * pageSize;
        const end = start + pageSize;
        const paginated = filtered.slice(start, end);
        
        return this.mapToLadderAchievement(paginated);
      })
    );
  }

  /**
   * Get players sorted by honorable kills with optional filters
   */
  getHonorableKills(
    realm?: string,
    faction?: string,
    playerClass?: number,
    pageNumber: number = 1,
    pageSize: number = 1000
  ): Observable<LadderAchievement[]> {
    return this.dataSyncService.getPlayers().pipe(
      map(players => {
        // Apply filters
        let filtered = this.applyFilters(players, realm, faction, playerClass);
        
        // Sort by honorable kills descending
        filtered.sort((a, b) => b.honorableKills - a.honorableKills);
        
        // Apply pagination
        const start = (pageNumber - 1) * pageSize;
        const end = start + pageSize;
        const paginated = filtered.slice(start, end);
        
        return this.mapToLadderAchievement(paginated);
      })
    );
  }

  /**
   * Get players sorted by mounts with optional filters
   */
  getMounts(
    realm?: string,
    faction?: string,
    playerClass?: number,
    pageNumber: number = 1,
    pageSize: number = 1000
  ): Observable<LadderAchievement[]> {
    return this.dataSyncService.getPlayers().pipe(
      map(players => {
        // Apply filters
        let filtered = this.applyFilters(players, realm, faction, playerClass);
        
        // Sort by mounts descending
        filtered.sort((a, b) => (b.mounts ?? 0) - (a.mounts ?? 0));
        
        // Apply pagination
        const start = (pageNumber - 1) * pageSize;
        const end = start + pageSize;
        const paginated = filtered.slice(start, end);
        
        return this.mapToLadderAchievement(paginated);
      })
    );
  }

  /**
   * Apply filters to player list
   */
  private applyFilters(
    players: Player[],
    realm?: string,
    faction?: string,
    playerClass?: number
  ): Player[] {
    return players.filter(player => {
      // Treat 'All Realms', '', undefined, or null as no filter
      if (realm && realm !== 'All Realms' && player.realm !== realm) {
        return false;
      }
      // Treat 'All Factions', '', undefined, or null as no filter
      if (faction && faction !== 'All Factions' && player.faction !== faction) {
        return false;
      }
      // Treat undefined, null, or NaN as no filter for class
      if (playerClass !== undefined && playerClass !== null && !isNaN(playerClass) && player.class !== playerClass) {
        return false;
      }
      return true;
    });
  }

  /**
   * Map Player to LadderAchievement interface
   */
  private mapToLadderAchievement(players: Player[]): LadderAchievement[] {
    return players.map(p => ({
      name: p.name,
      race: p.race,
      gender: p.gender,
      class: p.class,
      realm: p.realm,
      guild: p.guild,
      achievementPoints: p.achievementPoints,
      honorableKills: p.honorableKills,
      mounts: p.mounts ?? 0,
      faction: (p.faction || 'Horde') as 'Horde' | 'Alliance'
    }));
  }
}
