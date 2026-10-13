/** One page in the site navigation. */
export interface NavPage {
  /** Name in the section's dropdown. */
  readonly label: string;
  /** Shorter name for the section tabs under the header; the label when not set. */
  readonly tab?: string;
  readonly icon: string;
  readonly description: string;
  readonly path: string;
  /** Deeper routes that belong to this page, e.g. a character profile under its leaderboard. */
  readonly includes?: readonly string[];
  /** A small note beside the name, e.g. "Archive" for a page tied to one past event. */
  readonly tag?: string;
}

/** A top-level entry of the header. A section with one page is a plain link. */
export interface NavSection {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  /** Shows one "New" badge on the section instead of one on each of its pages. */
  readonly isNew?: boolean;
  readonly pages: readonly NavPage[];
}

/** The community Discord server, linked from the header. */
export const DISCORD_INVITE_URL = 'https://discord.gg/JMHnDmh2bP';

export interface NavLocation {
  readonly section: NavSection;
  readonly page: NavPage;
}

// Issue #107: 17 flat drawer entries grouped into 6 sections. Every URL stays as it was.
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'ladder',
    label: 'Ladder',
    icon: '🏆',
    pages: [
      { label: 'Players', icon: '🏆', path: '/', description: 'Character rankings by achievements, HKs, playtime and more' },
      { label: 'Top Gainers', tab: 'Movers', icon: '📈', path: '/top-gainers', description: 'The biggest climbers since the previous snapshot' },
      { label: 'Compare', icon: '⚖️', path: '/compare', description: 'Two ladder characters head to head' },
      { label: 'Guild Rankings', tab: 'Guilds', icon: '🛡️', path: '/guilds', description: 'Guilds ranked by how many of the top characters they hold' }
    ]
  },
  {
    id: 'achievements',
    label: 'Achievements',
    icon: '💎',
    pages: [
      { label: 'Rare Achievements', tab: 'Browse', icon: '💎', path: '/rare-achievements', description: 'Who owns the rare PvP titles, mounts and KSM' },
      { label: 'New Rare Characters', tab: 'New Discoveries', icon: '✨', path: '/new-rare-characters', description: 'Rare titles, mounts and realm firsts found in the latest scan' },
      { label: 'Hall of Fame', icon: '👑', path: '/ap-chest-looters', description: 'The AP chest looters event leaderboard', tag: 'Archive' }
    ]
  },
  {
    id: 'pvp',
    label: 'PvP',
    icon: '⚔️',
    pages: [
      { label: 'Battlegrounds', tab: 'BG Activity', icon: '⚔️', path: '/battleground', description: 'When battlegrounds start and how long matches last' },
      { label: 'Rated Battlegrounds', tab: 'Rated BG', icon: '🏅', path: '/rated-battleground', description: 'Rated matches, map trends, player rankings and scoreboards' }
    ]
  },
  {
    id: 'raids',
    label: 'Raids',
    icon: '📖',
    pages: [
      {
        label: 'Raid Logs',
        tab: 'Overview',
        icon: '📖',
        path: '/raid-logs',
        includes: ['/raid-logs/boss', '/raid-logs/log', '/raid-logs/guild'],
        description: 'Bosses, guild progression, recent kills and logs'
      },
      {
        label: 'Character Rankings',
        tab: 'Rankings',
        icon: '🎯',
        path: '/raid-logs/leaderboard',
        includes: ['/raid-logs/character'],
        description: 'DPS and HPS performance scores across the raid bosses'
      },
      { label: 'Race to Emerald Nightmare', tab: 'Race', icon: '🌿', path: '/emerald-nightmare', description: 'The guild race replayed, boss by boss' },
      { label: 'Realm First History', tab: 'History', icon: '📜', path: '/raid-history', description: 'Realm-first guilds across expansions and realms' }
    ]
  },
  {
    id: 'mythic-plus',
    label: 'Mythic+',
    icon: '🗝️',
    pages: [
      {
        label: 'Leaderboard',
        icon: '🗝️',
        path: '/mythic-plus',
        includes: ['/mythic-plus/character', '/mythic-plus/compare', '/mythic-plus/scoring'],
        description: 'Run and player rankings by dungeon and spec'
      },
      { label: 'Statistics', tab: 'Activity', icon: '⏱️', path: '/mythic-plus/stats', description: 'Runs by day, dungeon, key level and affix week' },
      { label: 'Records', icon: '🥇', path: '/mythic-plus/records', description: 'Dungeon records, server firsts and unclaimed bounties' }
    ]
  },
  {
    id: 'realm-stats',
    label: 'Realm Stats',
    icon: '📊',
    pages: [
      { label: 'Realm Stats', icon: '📊', path: '/stats', description: 'Population by class, race, faction, realm and level' }
    ]
  }
];

/** The section and page a router URL belongs to; undefined for pages outside the navigation. */
export function findNavLocation(url: string, sections: readonly NavSection[] = NAV_SECTIONS): NavLocation | undefined {
  const path = url.split(/[?#;]/, 1)[0].replace(/\/+$/, '') || '/';

  for (const section of sections) {
    for (const page of section.pages) {
      const isIncluded = page.includes?.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
      if (path === page.path || isIncluded) {
        return { section, page };
      }
    }
  }

  return undefined;
}
