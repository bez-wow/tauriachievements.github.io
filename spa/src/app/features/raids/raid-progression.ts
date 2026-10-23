import { realmSlug } from '../../game/wow';
import { RaidGuild, RaidKill } from './raid-logs.types';
import { guildKey } from './raid-logs';

export function fastestKills<T extends Pick<RaidKill, 'fightMs' | 'killedAt'>>(kills: readonly T[]): T[] {
  return [...kills].sort((a, b) => a.fightMs - b.fightMs || a.killedAt - b.killedAt);
}

export function latestKills<T extends Pick<RaidKill, 'killedAt'>>(kills: readonly T[]): T[] {
  return [...kills].sort((a, b) => b.killedAt - a.killedAt);
}

export interface GuildProgress {
  rank: number;
  guild: RaidGuild;
  firsts: Array<RaidKill | undefined>;
  killed: number;
  progressedAt: number;
  kills: number;
}

export function guildProgression(
  kills: readonly RaidKill[],
  difficultyId: number,
  bossCount: number
): GuildProgress[] {
  const rows = new Map<string, Omit<GuildProgress, 'rank'>>();

  for (const kill of kills) {
    const guild = kill.guild;
    if (kill.difficulty.id !== difficultyId || !guild?.name) {
      continue;
    }

    const key = guildKey(guild);
    let row = rows.get(key);
    if (!row) {
      row = { guild, firsts: Array.from({ length: bossCount }, () => undefined), killed: 0, progressedAt: 0, kills: 0 };
      rows.set(key, row);
    }

    row.kills++;
    const first = row.firsts[kill.boss.index];
    if (!first || kill.killedAt < first.killedAt) {
      row.firsts[kill.boss.index] = kill;
    }
  }

  for (const row of rows.values()) {
    const firsts = row.firsts.filter((kill): kill is RaidKill => !!kill);
    row.killed = firsts.length;
    row.progressedAt = Math.max(0, ...firsts.map(kill => kill.killedAt));
  }

  return [...rows.values()]
    .sort((a, b) => b.killed - a.killed || a.progressedAt - b.progressedAt || a.guild.name.localeCompare(b.guild.name))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export interface ProgressionFilter {
  faction?: number;
  realm?: string;
}

export function filterProgression(rows: readonly GuildProgress[], filter: ProgressionFilter = {}): GuildProgress[] {
  return rows
    .filter(row => (filter.faction === undefined || row.guild.faction === filter.faction)
      && (filter.realm === undefined || realmSlug(row.guild.realm) === filter.realm))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export interface ProgressChange {
  isNew: boolean;
  bosses: ReadonlySet<number>;
}

export function progressionChanges(
  current: readonly GuildProgress[],
  previous: readonly GuildProgress[]
): Map<string, ProgressChange> {
  const before = new Map(previous.map(row => [guildKey(row.guild), row]));
  const changes = new Map<string, ProgressChange>();

  for (const row of current) {
    const key = guildKey(row.guild);
    const earlier = before.get(key);
    const bosses = new Set(row.firsts.flatMap((kill, boss) => kill && !earlier?.firsts[boss] ? [boss] : []));
    if (bosses.size) {
      changes.set(key, { isNew: !earlier, bosses });
    }
  }

  return changes;
}

export function speedRank(kill: Pick<RaidKill, 'realm' | 'logId'>, kills: readonly RaidKill[]): number {
  const fastest = fastestKills(kills);
  return fastest.findIndex(other => other.realm === kill.realm && other.logId === kill.logId) + 1;
}
