import { describe, expect, it } from 'vitest';
import { NAV_SECTIONS, findNavLocation } from './nav-sections';

function locate(url: string): string | undefined {
  const location = findNavLocation(url);
  return location && `${location.section.label} / ${location.page.label}`;
}

describe('findNavLocation', () => {
  it('matches the home page only on the exact root', () => {
    expect(locate('/')).toBe('Ladder / Players');
    expect(locate('/?realm=tauri&sort=hk')).toBe('Ladder / Players');
    expect(locate('/#top')).toBe('Ladder / Players');
  });

  it('ignores query strings, fragments, matrix params and a trailing slash', () => {
    expect(locate('/mythic-plus?dungeon=3&page=2')).toBe('Mythic+ / Leaderboard');
    expect(locate('/mythic-plus/stats#weeks')).toBe('Mythic+ / Statistics');
    expect(locate('/guilds;realm=wod')).toBe('Ladder / Guild Rankings');
    expect(locate('/stats/')).toBe('Realm Stats / Realm Stats');
    expect(locate('/arena?x=1')).toBe('PvP / Arena');
  });

  it('files deeper routes under the page they belong to', () => {
    expect(locate('/mythic-plus/character/tauri/Arthas')).toBe('Mythic+ / Leaderboard');
    expect(locate('/mythic-plus/compare?a=1&b=2')).toBe('Mythic+ / Leaderboard');
    expect(locate('/mythic-plus/guild/evermoon/Skill%20Issue')).toBe('Mythic+ / Leaderboard');
    expect(locate('/raid-logs/boss/xavius-heroic')).toBe('Raids / Raid Logs');
    expect(locate('/raid-logs/log/evermoon/12345')).toBe('Raids / Raid Logs');
    expect(locate('/raid-logs/guild/tauri/Some%20Guild')).toBe('Raids / Guild Progression');
    expect(locate('/raid-logs/character/tauri/Name')).toBe('Raids / Character Rankings');
  });

  it('keeps a sibling route out of a shorter page path', () => {
    expect(locate('/raid-logs/leaderboard')).toBe('Raids / Character Rankings');
    expect(locate('/raid-logs/guilds?difficulty=heroic')).toBe('Raids / Guild Progression');
    expect(locate('/raid-logs/stats')).toBe('Raids / Raid Statistics');
    expect(locate('/raid-logs/tier-list?difficulty=normal')).toBe('Raids / Tier List');
    expect(locate('/mythic-plus/records')).toBe('Mythic+ / Records');
    expect(locate('/legion-key-history-addon')).toBe('Mythic+ / Addon');
    expect(locate('/raid-logs-old')).toBeUndefined();
  });

  it('leaves pages outside the navigation unmatched', () => {
    expect(locate('/endless-f8c2a91d')).toBeUndefined();
    expect(locate('/k7m2q9v4x8p3n6z')).toBeUndefined();
  });

  it('lists every page path once', () => {
    const paths = NAV_SECTIONS.flatMap((section) => section.pages.map((page) => page.path));

    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toHaveLength(23);
  });
});
