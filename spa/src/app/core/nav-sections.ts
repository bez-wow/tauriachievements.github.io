export interface NavPage {
  readonly label: string;
  readonly tab?: string;
  readonly icon: string;
  readonly path: string;
  readonly includes?: readonly string[];
  readonly tag?: string;
}

export interface NavSection {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly isNew?: boolean;
  readonly pages: readonly NavPage[];
}

export const DISCORD_INVITE_URL = 'https://discord.gg/JMHnDmh2bP';

export interface NavLocation {
  readonly section: NavSection;
  readonly page: NavPage;
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'ladder',
    label: 'Ladder',
    icon: '🏆',
    pages: [
      { label: 'Players', icon: '🏆', path: '/' },
      { label: 'Top Gainers', tab: 'Movers', icon: '📈', path: '/top-gainers' },
      { label: 'Compare', icon: '⚖️', path: '/compare' },
      { label: 'Guild Rankings', tab: 'Guilds', icon: '🛡️', path: '/guilds' }
    ]
  },
  {
    id: 'achievements',
    label: 'Achievements',
    icon: '💎',
    pages: [
      { label: 'Rare Achievements', tab: 'Browse', icon: '💎', path: '/rare-achievements' },
      { label: 'New Rare Characters', tab: 'New Discoveries', icon: '✨', path: '/new-rare-characters' },
      { label: 'Hall of Fame', icon: '👑', path: '/ap-chest-looters', tag: 'Archive' }
    ]
  },
  {
    id: 'pvp',
    label: 'PvP',
    icon: '⚔️',
    pages: [
      { label: 'Arena', icon: '🏟️', path: '/arena' },
      { label: 'Battlegrounds', tab: 'BG Activity', icon: '⚔️', path: '/battleground' },
      { label: 'Rated Battlegrounds', tab: 'Rated BG', icon: '🏅', path: '/rated-battleground' }
    ]
  },
  {
    id: 'raids',
    label: 'Raids',
    icon: '📖',
    pages: [
      {
        label: 'Raid Logs',
        tab: 'Logs',
        icon: '📖',
        path: '/raid-logs',
        includes: ['/raid-logs/boss', '/raid-logs/log']
      },
      {
        label: 'Guild Progression',
        tab: 'Guilds',
        icon: '🏰',
        path: '/raid-logs/guilds',
        includes: ['/raid-logs/guild']
      },
      { label: 'Raid Statistics', tab: 'Statistics', icon: '🧮', path: '/raid-logs/stats' },
      { label: 'Tier List', icon: '🏅', path: '/raid-logs/tier-list' },
      { label: 'Talent Analytics', tab: 'Talents', icon: '🌳', path: '/raid-logs/talents' },
      {
        label: 'Character Rankings',
        tab: 'Rankings',
        icon: '🎯',
        path: '/raid-logs/leaderboard',
        includes: ['/raid-logs/character']
      },
      { label: 'Race to Emerald Nightmare', tab: 'Race', icon: '🌿', path: '/emerald-nightmare' },
      { label: 'Realm First History', tab: 'History', icon: '📜', path: '/raid-history' }
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
        includes: ['/mythic-plus/character', '/mythic-plus/guild', '/mythic-plus/compare', '/mythic-plus/scoring']
      },
      { label: 'Statistics', tab: 'Activity', icon: '⏱️', path: '/mythic-plus/stats' },
      { label: 'Records', icon: '🥇', path: '/mythic-plus/records' },
      { label: 'Addon', icon: '⬇️', path: '/legion-key-history-addon' }
    ]
  },
  {
    id: 'realm-stats',
    label: 'Realm Stats',
    icon: '📊',
    pages: [
      { label: 'Realm Stats', icon: '📊', path: '/stats' }
    ]
  }
];

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
