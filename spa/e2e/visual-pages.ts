export type ViewportName = 'phone' | 'desktop';

export interface VisualPage {
  readonly name: string;
  readonly path: string;
  readonly clicks?: readonly string[];
  readonly only?: ViewportName;
  readonly fail?: readonly string[];
  readonly hold?: readonly string[];
}

export const VISUAL_PAGES: readonly VisualPage[] = [
  { name: 'ladder', path: '/' },
  { name: 'ladder-filtered', path: '/?sort=honorableKills&realm=Evermoon&faction=Horde&class=8' },
  { name: 'top-gainers', path: '/top-gainers' },
  { name: 'compare', path: '/compare' },
  { name: 'guilds', path: '/guilds' },
  { name: 'rare-achievements', path: '/rare-achievements' },
  { name: 'new-rare-characters', path: '/new-rare-characters' },
  { name: 'ap-chest-looters', path: '/ap-chest-looters' },
  { name: 'arena', path: '/arena' },
  { name: 'arena-3v3', path: '/arena?bracket=3v3' },
  { name: 'battleground', path: '/battleground' },
  { name: 'rated-battleground', path: '/rated-battleground' },
  { name: 'rated-battleground-matches', path: '/rated-battleground?view=matches' },
  { name: 'raid-logs', path: '/raid-logs' },
  { name: 'raid-logs-heroic', path: '/raid-logs?difficulty=heroic' },
  { name: 'raid-logs-guilds', path: '/raid-logs/guilds' },
  { name: 'raid-logs-stats', path: '/raid-logs/stats' },
  { name: 'raid-logs-tier-list', path: '/raid-logs/tier-list' },
  { name: 'raid-logs-tier-list-normal', path: '/raid-logs/tier-list?difficulty=normal' },
  { name: 'raid-logs-talents', path: '/raid-logs/talents' },
  { name: 'raid-logs-talents-spec', path: '/raid-logs/talents?difficulty=mythic&spec=71' },
  { name: 'raid-logs-leaderboard', path: '/raid-logs/leaderboard' },
  { name: 'raid-logs-leaderboard-hps', path: '/raid-logs/leaderboard?metric=hps&difficulty=heroic' },
  { name: 'raid-logs-boss', path: '/raid-logs/boss/xavius?difficulty=mythic' },
  { name: 'raid-logs-boss-fastest', path: '/raid-logs/boss/ursoc?difficulty=heroic&tab=fastest' },
  { name: 'raid-log', path: '/raid-logs/log/tauri/1684762' },
  { name: 'raid-logs-guild', path: '/raid-logs/guild/evermoon/Miracle?difficulty=mythic' },
  { name: 'raid-logs-character', path: '/raid-logs/character/evermoon/Gankuh?difficulty=mythic&metric=dps' },
  { name: 'emerald-nightmare', path: '/emerald-nightmare' },
  { name: 'raid-history', path: '/raid-history' },
  { name: 'mythic-plus', path: '/mythic-plus' },
  { name: 'mythic-plus-players', path: '/mythic-plus?view=players' },
  { name: 'mythic-plus-filtered', path: '/mythic-plus?dungeon=arc&class=8&period=week' },
  { name: 'mythic-plus-scoring', path: '/mythic-plus/scoring' },
  { name: 'mythic-plus-stats', path: '/mythic-plus/stats' },
  { name: 'mythic-plus-stats-week', path: '/mythic-plus/stats?period=week' },
  { name: 'mythic-plus-records', path: '/mythic-plus/records' },
  { name: 'mythic-plus-compare', path: '/mythic-plus/compare?players=Pashao-Evermoon,Exkeito-Evermoon' },
  { name: 'mythic-plus-character', path: '/mythic-plus/character/evermoon/Pashao' },
  {
    name: 'mythic-plus-guild',
    path: '/mythic-plus/guild/evermoon/%D0%A5%D1%80%D0%B0%D0%BD%D0%B8%D1%82%D0%B5%D0%BB%D0%B8%20%D0%92%D0%B5%D1%87%D0%BD%D0%BE%D1%81%D1%82%D0%B8'
  },
  { name: 'addon', path: '/legion-key-history-addon' },
  { name: 'stats', path: '/stats' },
  { name: 'support', path: '/support' },
  { name: 'rare-items', path: '/k7m2q9v4x8p3n6z' },
  { name: 'guild-endless', path: '/endless-f8c2a91d' },
  { name: 'guild-competence-optional', path: '/competence-optional-a47d9c2e' },
  { name: 'guild-miracle', path: '/miracle-6e2d8f14' },
  { name: 'guild-entropy', path: '/entropy-3e8f1a62' },
  { name: 'guild-outlaws', path: '/outlaws-34c1426b' },
  { name: 'guild-impaired', path: '/impaired-c18e7b42' },
  { name: 'guild-impact', path: '/impact-94fd2a61' },
  { name: 'guild-highly-regarded', path: '/highly-regarded-d74a9e3c' },
  { name: 'guild-temerite', path: '/temerite-b93e7a41' },
  { name: 'guild-rycerze-ortalionu', path: '/rycerze-ortalionu-c1ee200b' },
  { name: 'redirect-old-arena', path: '/50-games-played-arenas' },
  { name: 'redirect-old-raid-history', path: '/guild-realm-firsts' },
  { name: 'state-menu-drawer', path: '/', clicks: ['.site-menu-toggle'], only: 'phone' },
  { name: 'state-menu-section', path: '/', clicks: ['.site-nav-trigger:has-text("Mythic+")'], only: 'desktop' },
  { name: 'state-ladder-row-details', path: '/', clicks: ['.row-toggle >> nth=0'], only: 'phone' },
  { name: 'state-ladder-search', path: '/?search=Lara' },
  { name: 'state-compare-two', path: '/compare?a=Tauri:Larahh&b=Tauri:Darkpaladino' },
  { name: 'state-mythic-plus-compare-mode', path: '/mythic-plus?compare=Pashao-Evermoon,Exkeito-Evermoon' },
  { name: 'state-mythic-plus-dropdown', path: '/mythic-plus?view=players', clicks: ['app-filter-dropdown .dropdown-trigger >> nth=0'], only: 'desktop' },
  { name: 'state-mythic-plus-filters-open', path: '/mythic-plus?view=players', clicks: ['.mobile-filter-toggle'], only: 'phone' },
  { name: 'state-mythic-plus-guild-week', path: '/mythic-plus/guild/evermoon/Miracle?period=week&role=healer' },
  { name: 'state-mythic-plus-records-dungeon', path: '/mythic-plus/records?dungeon=brh' },
  { name: 'state-battleground-starts', path: '/battleground', clicks: ['.bg-count-row >> nth=0'] },
  { name: 'state-rated-battleground-history', path: '/rated-battleground', clicks: ['.player-history-trigger >> nth=0'] },
  { name: 'state-rare-achievements-filtered', path: '/rare-achievements?realm=Tauri&class=2' },
  { name: 'state-raid-log-pickup', path: '/raid-logs/log/tauri/1329435' },
  { name: 'state-raid-logs-character-class', path: '/raid-logs/character/evermoon/Gankuh?difficulty=mythic&metric=dps&compare=class' },
  { name: 'state-raid-logs-stats-performance', path: '/raid-logs/stats?view=performance&role=healer' },
  { name: 'state-raid-logs-boss-hps-class', path: '/raid-logs/boss/xavius?difficulty=mythic&tab=hps&class=5' },
  { name: 'state-raid-logs-guilds-filtered', path: '/raid-logs/guilds?difficulty=heroic&realm=evermoon&faction=horde' },
  { name: 'state-raid-logs-talents-role', path: '/raid-logs/talents?difficulty=heroic&role=healer' },
  { name: 'state-loading-mythic-plus', path: '/mythic-plus', hold: ['mythic-plus-data/index\\.json'] },
  { name: 'state-loading-mythic-plus-runs', path: '/mythic-plus', hold: ['mythic-plus-data/(?!index)'] },
  { name: 'state-error-mythic-plus-stats', path: '/mythic-plus/stats', fail: ['mythic-plus-data/'] },
  { name: 'state-error-mythic-plus-profile', path: '/mythic-plus/character/evermoon/Pashao', fail: ['mythic-plus-data/'] },
  { name: 'state-loading-raid-logs', path: '/raid-logs', hold: ['raid-log-data/index\\.json'] },
  { name: 'state-error-raid-logs-leaderboard', path: '/raid-logs/leaderboard', fail: ['raid-log-data/'] },
  { name: 'state-error-raid-logs-character', path: '/raid-logs/character/evermoon/Gankuh?difficulty=mythic', fail: ['-mythic\\.json'] },
  { name: 'state-loading-raid-logs-talents-rosters', path: '/raid-logs/talents', hold: ['-mythic\\.json'] },
  { name: 'state-error-raid-log', path: '/raid-logs/log/tauri/1684762', fail: ['raid-log-data/'] },
  { name: 'state-error-arena', path: '/arena', fail: ['arena-games\\.json'] },
  { name: 'state-error-ladder', path: '/', fail: ['players\\.(head\\.)?snapshot\\.json'] }
];

export const VISUAL_VIEWPORTS: ReadonlyArray<{ readonly name: ViewportName; readonly width: number; readonly height: number }> = [
  { name: 'phone', width: 360, height: 780 },
  { name: 'desktop', width: 1280, height: 900 }
];

export const PHONE_WIDTHS: readonly number[] = [320, 360, 390, 412];

export const SIDEWAYS_BY_DESIGN: ReadonlyArray<{ readonly selector: string; readonly reason: string }> = [
  { selector: 'app-rated-battleground-page .match-tabs', reason: 'a swipe strip of match cards; the next card peeks in' },
  { selector: 'app-rated-battleground-page .activity-chart', reason: 'a day-by-day season chart that opens on the latest day' },
  { selector: 'app-mythic-plus-compare-page .chart-scroll', reason: 'a week-by-week score chart that opens on the latest week' },
  { selector: 'app-mythic-plus-profile-page .chart-scroll', reason: 'a week-by-week score chart that opens on the latest week' },
  { selector: 'app-mythic-plus-stats-page .chart-scroll', reason: 'a day-by-day runs chart that opens on the latest day' },
  { selector: 'app-emerald-nightmare-page .timeline-scroll', reason: 'the race timeline, 18:00 to 22:00, scrolled by hand or played back' }
];
