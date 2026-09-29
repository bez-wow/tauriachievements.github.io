import { Injectable } from '@angular/core';
import { Observable, combineLatest, map } from 'rxjs';
import { DEFAULT_GUILD_SOURCE_LIMIT } from './guild-presence-options';
import { LadderAchievement, LadderService } from './ladder.service';
import { GuildPresenceData, GuildPresenceFaction, GuildPresenceMetric, GuildPresenceRankingEntry } from './guild-presence.types';

interface GuildPresenceAccumulator {
  key: string;
  guild: string;
  realm: string;
  playerCount: number;
  metricTotal: number;
  topMemberName: string;
  topMemberMetricValue: number;
  factions: Set<'Alliance' | 'Horde'>;
}

@Injectable({ providedIn: 'root' })
export class GuildPresenceService {
  constructor(private readonly ladderService: LadderService) {}

  getGuildPresence(limit: number = DEFAULT_GUILD_SOURCE_LIMIT): Observable<GuildPresenceData> {
    return combineLatest([
      this.ladderService.getAchievements(undefined, undefined, undefined, undefined, 1, limit),
      this.ladderService.getHonorableKills(undefined, undefined, undefined, undefined, 1, limit)
    ]).pipe(
      map(([achievementPlayers, honorableKillPlayers]) => ({
        achievementLeaderboardSize: achievementPlayers.length,
        honorableKillLeaderboardSize: honorableKillPlayers.length,
        achievementGuilds: this.buildGuildRanking(achievementPlayers, 'achievementPoints'),
        honorableKillGuilds: this.buildGuildRanking(honorableKillPlayers, 'honorableKills')
      }))
    );
  }

  private buildGuildRanking(
    players: readonly LadderAchievement[],
    metric: GuildPresenceMetric
  ): GuildPresenceRankingEntry[] {
    const guilds = new Map<string, GuildPresenceAccumulator>();

    for (const player of players) {
      const guildName = player.guild.trim();
      if (!guildName) {
        continue;
      }

      const key = `${player.realm}::${guildName}`;
      const metricValue = this.getMetricValue(player, metric);
      const existing = guilds.get(key) ?? this.createGuildAccumulator(key, guildName, player.realm, player.name, metricValue);

      existing.playerCount += 1;
      existing.metricTotal += metricValue;

      if (this.shouldReplaceTopMember(existing, player.name, metricValue)) {
        existing.topMemberName = player.name;
        existing.topMemberMetricValue = metricValue;
      }

      const faction = this.normalizeFaction(player.faction);
      if (faction !== 'Mixed') {
        existing.factions.add(faction);
      }

      guilds.set(key, existing);
    }

    return Array.from(guilds.values())
      .sort((left, right) => this.compareGuildPresence(left, right))
      .map((guild, index) => this.toRankingEntry(guild, index + 1));
  }

  private compareGuildPresence(left: GuildPresenceAccumulator, right: GuildPresenceAccumulator): number {
    if (right.playerCount !== left.playerCount) {
      return right.playerCount - left.playerCount;
    }

    if (right.metricTotal !== left.metricTotal) {
      return right.metricTotal - left.metricTotal;
    }

    if (right.topMemberMetricValue !== left.topMemberMetricValue) {
      return right.topMemberMetricValue - left.topMemberMetricValue;
    }

    return left.key.localeCompare(right.key);
  }

  private getMetricValue(player: LadderAchievement, metric: GuildPresenceMetric): number {
    return metric === 'achievementPoints'
      ? player.achievementPoints
      : player.honorableKills;
  }

  private createGuildAccumulator(
    key: string,
    guild: string,
    realm: string,
    topMemberName: string,
    topMemberMetricValue: number
  ): GuildPresenceAccumulator {
    return {
      key,
      guild,
      realm,
      playerCount: 0,
      metricTotal: 0,
      topMemberName,
      topMemberMetricValue,
      factions: new Set<'Alliance' | 'Horde'>()
    };
  }

  private shouldReplaceTopMember(
    guild: GuildPresenceAccumulator,
    playerName: string,
    metricValue: number
  ): boolean {
    return metricValue > guild.topMemberMetricValue
      || (metricValue === guild.topMemberMetricValue
        && playerName.localeCompare(guild.topMemberName) < 0);
  }

  private toRankingEntry(guild: GuildPresenceAccumulator, rank: number): GuildPresenceRankingEntry {
    return {
      rank,
      key: guild.key,
      guild: guild.guild,
      realm: guild.realm,
      faction: this.getGuildFaction(guild.factions),
      playerCount: guild.playerCount,
      topMemberName: guild.topMemberName,
      topMemberMetricValue: guild.topMemberMetricValue
    };
  }

  private normalizeFaction(value: string): GuildPresenceFaction {
    if (value === 'Alliance' || value === 'Horde') {
      return value;
    }

    return 'Mixed';
  }

  private getGuildFaction(factions: Set<'Alliance' | 'Horde'>): GuildPresenceFaction {
    if (factions.size === 1) {
      return factions.has('Alliance') ? 'Alliance' : 'Horde';
    }

    return 'Mixed';
  }
}
