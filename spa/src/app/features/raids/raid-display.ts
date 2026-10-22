import { formatClock } from '../../shared/time-format';
import { parseRole, realmSlug, Role } from '../../game/wow';
import { RaidBoss, RaidGuild, RaidKill, RaidCharacter } from './raid-logs.types';

export type RoleFilter = Role | 'all';

export const FACTION_NAMES: Readonly<Record<number, string>> = { 0: 'Alliance', 1: 'Horde' };


export const ROLE_NAMES: Readonly<Record<Role, string>> = { tank: 'Tank', healer: 'Healer', dps: 'Damage' };

export const ITEM_QUALITY_COLORS: ReadonlyArray<string> = [
  '#9d9d9d', '#ffffff', '#1eff00', '#0070dd', '#a335ee', '#ff8000', '#e6cc80', '#00ccff'
];

const ICON_BASE = 'https://legion-static.tauri.hu/images/icons/';

export function itemIconUrl(icon: string, size: 'medium' | 'large' = 'large'): string {
  return `${ICON_BASE}${size}/${icon || 'inv_misc_questionmark'}.png`;
}

export function iconSrcset(icon: string): string {
  return `${itemIconUrl(icon, 'medium')} 36w, ${itemIconUrl(icon)} 56w`;
}

export function itemUrl(itemId: number): string {
  return `https://legion-shoot.tauri.hu/?item=${itemId}`;
}

export function spellUrl(spellId: number): string {
  return `https://legion-shoot.tauri.hu/?spell=${spellId}`;
}

export function parseRoleFilter(value: string | null | undefined): RoleFilter {
  return parseRole(value) ?? 'all';
}

export function raidLogLink(kill: Pick<RaidKill, 'realm' | 'logId'>): Array<string | number> {
  return ['/raid-logs', 'log', realmSlug(kill.realm), kill.logId];
}

export function raidBossLink(boss: Pick<RaidBoss, 'slug'>): string[] {
  return ['/raid-logs', 'boss', boss.slug];
}

export function raidGuildLink(guild: Pick<RaidGuild, 'name' | 'realm'>): string[] {
  return ['/raid-logs', 'guild', realmSlug(guild.realm), guild.name];
}

export function raidCharacterLink(character: Pick<RaidCharacter, 'name' | 'realm'>): string[] {
  return ['/raid-logs', 'character', realmSlug(character.realm), character.name];
}

export function formatFightTime(milliseconds: number): string {
  return formatClock(Math.round(milliseconds / 1000));
}

export function formatPerSecond(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return String(Math.round(value));
}

export function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return String(Math.round(value));
}

export function formatAgo(at: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
}

export function nameMatches(name: string, query: string): boolean {
  const wanted = foldText(query.trim());
  return !wanted || foldText(name).includes(wanted);
}

function foldText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

export const RAID_PAGE_SIZE = 50;

export function pageCount(total: number, pageSize: number = RAID_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
