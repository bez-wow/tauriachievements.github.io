# Frontend (spa/)

Angular 21 with standalone components, signals and `OnPush`. The app is zoneless: `zone.js`
isn't installed, and there are no polyfills. It builds to static files that GitHub Pages
serves.

## Where things go

`spa/src/app/` holds the shell (`app.component.ts`, `app.config.ts`, `app.routes.ts`) and these
folders:

| Folder | Holds |
|---|---|
| `core/` | what the whole app runs on: the header (`update-bar`, `nav-sections.ts`, `page-header.ts`), the back-to-top button, `url-state.ts`, `page-links.ts` (links into one feature's pages from another's), `DataFileService`, `ObservableCache`, `time-zone-label.ts` |
| `shared/` | building blocks any page may use: the filter dropdown, the mobile filter toggle, `app-load-state`, `app-pager` and `pager.ts`, `app-icon-tips`, `appTapTooltip`, `compact-viewport.ts`, `time-format.ts`, `score-quality.ts`, `_mythic-plus-shared.scss` |
| `shared/spec-charts/` | the spec and race popularity charts the Mythic+ and Raids statistics share: `spec-popularity.ts`, `race-popularity.ts`, `app-race-by-spec`, and `spec-chart.scss`, the chart look every spec chart lists first in its `styleUrls` |
| `shared/motion/` | the motion directives and their helpers (`motion.ts`, `count-up.ts`, `decode-text.ts`) |
| `game/` | the game's own tables and links: `wow.ts`, `wow-specs.ts`, `class-colors.ts`, `armory.ts`, the class and race icon helpers, and the asset paths in `classIconHelper.ts` (class icons, class crests, spec art) |
| `players/` | the ladder's data, `Players.csv` and `RareAchievements.json`: the `Character` model, `DataSyncService`, `LadderLastUpdatedService`, the rare-achievement service, groups and summaries, the realm, faction and class filter options, and the player test fixture. The Ladder, Achievements and Realm Stats pages read it |
| `features/<area>/` | one folder per menu section (`ladder`, `achievements`, `pvp`, `raids`, `mythic-plus`, `realm-stats`), plus `guild-analysis` (the unlisted guild pages) and `support`. A feature holds its pages, their pure logic and specs, its child components, its data service and its SCSS partial |

Imports point down, never across:

- A feature never imports from another feature. When a second feature needs something, move
  it down into `shared/`, `game/`, `core/` or `players/`, with its tests.
- Only features import from `players/`.
- `core/`, `shared/` and `game/` never import from `players/` or a feature, and only the shell
  files import the features.

`scripts/app-boundaries.test.js` (part of `npm test`) checks every TypeScript import, lazy
route, `templateUrl`, `styleUrls` entry and SCSS `@use` against these rules.

A file's name says what it is:

| Name | Holds |
|---|---|
| `<name>-page.component.{ts,html,scss}` | a routed page |
| `<name>.component.*` | a child or shared component |
| `<feature>.ts` + `<feature>.spec.ts` | pure logic: types, parsing, ranking, formatting (e.g. `mythic-plus.ts`, `raid-scores.ts`, `arena-games.ts`). A big area splits it by job: the Raids keep the file formats in `raid-logs.types.ts`, decoding in `raid-logs.ts`, scores in `raid-scores.ts`, guild progression in `raid-progression.ts` and display helpers in `raid-display.ts`, with their test fixtures in `raid-logs.fixture.ts` |
| `<feature>-views.ts` | pure functions that turn the logic's results into what a page shows: rows, tiles, labels, insight text (`mythic-plus-views.ts`, `raid-talents-views.ts`) |
| `<name>.directive.ts` | an attribute directive (`app` prefix: `[appReveal]`) |
| `<name>.service.ts` | data loading shared by several pages |
| `<page>.store.ts` | one page's loading and data state: an `@Injectable()` in the page's own `providers` (`LadderPageStore`, `MythicPlusPageStore`). The component re-exposes the signals its template reads (`readonly index = this.store.index;`) |
| `_<area>-shared.scss` | SCSS mixins shared by an area's pages |
| `<page>.motion.scss` | a page's motion, as a second `styleUrls` entry |
| `<component>.phone.scss` | a component's phone and touch rules, moved whole from the end of its stylesheet into the next `styleUrls` entry (before any `.motion.scss`), so the cascade order stays the same |

Outside `app/`: `src/scss/` (`styles.scss`, `_motion.scss`) and `src/assets/`. In the assets,
`spec-art/<class>-<spec>.webp` (`hunter-beast-mastery.webp`, `death-knight-blood.webp`: the names
in lower case, spaces as hyphens, built by `getSpecArtPath`) is the art the Tier List page shows,
one per Legion spec: the images of
TierMaker's [All Class Specs](https://tiermaker.com/create/all-class-specs---world-of-warcraft-17396518-2)
template, resized to 160 px (sharp on high-density screens at the 60 px they show at) and
saved as WebP. `rogue-outlaw` is
the exception, at the owner's request: it's Legion's own Outlaw icon, `inv_sword_30` (the one
`wow-specs.ts` lists), from Blizzard's 56 px copy
(`https://render.worldofwarcraft.com/us/icons/56/inv_sword_30.jpg`). To match the others'
style it was upscaled 4× with [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN)'s
`realesrgan-x4plus-anime` model, given 10% more contrast and 25% more colour, then resized like
the rest.

"Download Tier List Image", at the end of the Tier List page's difficulty row, saves the three
lists as one PNG, laid out like the page: DPS across the top, Heal and Tank side by side below.
The PNG is drawn on a `<canvas>` from the lists' data (`raid-tier-list-image.ts`: `imageLayout`
places the tables, `renderTierListImage` draws them), at twice its layout size. It's not a
picture of the page, so what is only on the page (the button, the character count in each list's
corner) never shows in it, and the image has its own header (raid, difficulty, date, the site's
address), a heading and character count over each list, and a footer. Every image it draws must
be served from the site itself: a picture from another origin (the `legion-static` icons) taints
the canvas, and the export then fails.

Keep components thin. A ranking, filter, count or empty-state message goes into the pure
`<feature>.ts`, where a spec can pin it down without a TestBed. When a page's loading has more
to it than one request (several files, retries, recovering from a newer export), it goes into
the page's store. The component keeps the URL, the filters and the event handlers.

## Routing

- Each feature lists its routes in `features/<area>/<area>.routes.ts` (`LADDER_ROUTES`,
  `RAIDS_ROUTES`, …), and `app.routes.ts` spreads them in menu order, then the guild pages,
  then the final `'**'` redirect to the ladder.
- Every page loads lazily through `loadComponent`, except the ladder: it's the home page,
  so it ships in the initial bundle and the first visit needs no extra request. New pages are
  lazy too ([guides/howto-add-page.md](guides/howto-add-page.md)). Importing a page or its
  heavy dependency (Chart.js) from an eager file pulls it back into the initial bundle.
- A code deploy renames the page chunks and Pages deletes the old ones, so a tab left open
  across it can't load a page it hasn't opened yet. `reloadOnNewDeploy`
  (`core/new-deploy-reload.ts`, the router's navigation error handler) turns that failed
  navigation into a full load of the same address, which brings in the new deploy. It reloads
  at most once in 30 seconds, so a deploy still going out can't loop it. Data-only deploys
  keep every chunk name.
- `app.config.ts` turns on `withViewTransitions()` and `scrollPositionRestoration: 'enabled'`,
  so **every router navigation, even one that only changes query parameters, runs a full-page
  view transition and scrolls to the top.** Back and Forward return to where the reader was.
- Shared URLs never break. A renamed page keeps a `redirectTo` from its old path (as with
  `guild-realm-firsts` and `50-games-played-arenas`).
- Unlisted routes are unlisted on purpose: the guild pages (`<key>-<8 hex>`) and the Rare Items
  page. Don't add them to the nav or link to them from public pages.
- Pages hosting: GitHub Pages serves `src/404.html` for any unknown path. It redirects to
  `/?p=<path>`, and `index.html` restores the path before Angular starts. Paths that contain a
  dot aren't redirected, so route parameters can't hold dots.

## URL state

The URL holds whatever a shared link should reproduce: filters, the selected tab or
difficulty, the page number. Defaults are left out of it.

- **In-page controls** (filters, switches, tabs, pagers) write the URL without navigating, so
  the reader keeps their scroll position:

  ```ts
  private readonly replaceUrl = injectReplaceUrl();

  private writeUrl(): void {
    this.replaceUrl({ period: this.period() === 'week' ? 'week' : null, … });
  }
  ```

  `injectReplaceUrl()` (`url-state.ts`) writes the page's query parameters with
  `Location.replaceState`; a `null` leaves a parameter out. Pass `{ path }` to also write the
  canonical address (a profile found by a lowercased name), or `{ merge: true }` to keep the
  parameters the page doesn't name. Each page keeps one `writeUrl()` that names every
  parameter it owns. Read parameters with the shared parsers: `parseInteger`, `parsePage`
  (`url-state.ts`), `parseRole`, `parseClassId` (`wow.ts`), `parseSpecName` (`wow-specs.ts`).
- The ladder, Compare, Arena and Rare Achievements pages still write their filters with
  `router.navigate`, so some changes add a history entry and every change scrolls to the top.
- **Real navigation** is only for a change the Back button should undo. For example, on the
  Talent Analytics page, opening a spec's card navigates, while difficulty, boss, role and class
  use `replaceState`. On a spec's page, picking a role or a class, or pressing Reset, navigates
  back to the overview.
- The router never sees parameters written with `replaceState`. When you build a link or
  navigation from the current state, spell out every parameter you want kept.
- For the same reason `route.queryParamMap` stays silent when the reader opens the address the
  router last opened, such as the page's own header link after a switch changed the URL. A page
  that its own link should reset reads its parameters through `injectQueryParamMap()`
  (`url-state.ts`), which hands over the route's parameters after every navigation. Raid
  Statistics, Tier List and Talent Analytics do this.

The query parameters each page reads:

| Page | Parameters |
|---|---|
| `/` (ladder) | `sort`, `realm`, `faction`, `class`, `pageSize`, `search` |
| `/compare` | `a`, `b`: `Realm:Name` |
| `/rare-achievements` | `achievement`, `realm`, `class`, `search` |
| `/arena` | `bracket`: `2v2` (default) or `3v3` |
| `/rated-battleground` | `view`: `players` (default) or `matches`; `page` (the players view) |
| `/mythic-plus` | `view` (`runs`, `players`), `sort` (`best`, `latest`), `period` (`season`, `week`), `dungeon`, `realm`, `class`, `spec`, `role`, `page`, `character` (`Name-Realm`: the runs view shows only theirs, the players view picks out their row), `compare` (`Name-Realm,…`: opens compare mode with those picks) |
| `/mythic-plus/stats` | `period` |
| `/mythic-plus/records` | `dungeon` (the server firsts' filter) |
| `/mythic-plus/compare` | `players`: `Name-Realm,…`, at most four |
| `/mythic-plus/character/:realm/:name` | `spec` |
| `/mythic-plus/guild/:realm/:guild` | `period`, `dungeon`, `class`, `spec`, `role`, `character` |
| every `/raid-logs` page | `difficulty`, plus: Guilds `faction`, `realm`; Statistics `view`, `role`; Talents `boss`, `role`, `class`, `spec`; Rankings `metric`, `class`, `spec`, `realm`, `q`, `page`; a boss `tab`, `class`, `spec`, `realm`, `q`, `page`; a character `metric`, `compare=class`, `spec` (with `compare=class`: a spec of the character's class the metric ranks), `class` (an earlier character with the name, by class id; [data-pipeline.md](data-pipeline.md#raid-log-files)) |

On the Mythic+ leaderboard and guild ladder, a `spec` counts only when it belongs to the
`class` in the same URL. A `Name-Realm` value splits on its last hyphen: character names can't
hold one. Name searches ignore case and accents (`nameMatches`, `memberNameMatches`: `sosa`
finds Sósa), while a picked character matches name and realm exactly.

## Loading data

- Every data file loads through `DataFileService` ([data-pipeline.md](data-pipeline.md)):
  - `getJson()` memoizes per session;
  - `fetchJson()` is for large files the caller converts into its own structures;
  - `getText()` loads text files.
- Never add `?v=Date.now()`: that defeats the manifest's caching.
- Decode large files lazily. The M+ leaderboard's `createRunDecoder` builds views only for the
  visible page, and the ladder starts on the 25,000-row head snapshot.
- An area with several pages loads its files through one service, which decodes each file
  once per session, so moving between its pages reads nothing twice. Services memoize with
  `ObservableCache` (`core/observable-cache.ts`), which forgets a failed load so a retry
  fetches again.
- `MythicPlusDataService` loads the Mythic+ files: `season()` (the index and every dungeon's
  runs) for the stats, records, compare, profile and guild pages; `index()` and
  `dungeonRuns()` for the leaderboard (through `MythicPlusPageStore`), which loads only the
  dungeons its scope shows. Its errors go through `mythicPlusLoadError()` for the message.
  `hasScanChanges()` (`mythic-plus.ts`) says whether an index carries the previous scan's
  standings for every player, which the movement arrows on the leaderboard, guild and profile
  pages need.
- `RaidLogsDataService` loads the raid files and keeps `lastDifficulty`, so the Raids tabs
  remember the difficulty within a session. A tab opened without `?difficulty=` starts on it,
  else on `defaultDifficulty`, the hardest one with a kill. The header's Raid Statistics, Tier
  List and Talent Analytics links carry `?difficulty=mythic`, so those three always open on
  Mythic, unless Mythic has no kill yet.
- Files only some icons or names depend on (raid genders, talent tables and tooltips) fail
  soft: a file that won't load is an empty table, not an error. A kill the raid index doesn't
  list may be newer than the index this tab loaded, so it's loaded fresh once before the page
  gives up.
- When a control switches which file a page shows (the arena bracket, a boss), drop a response
  for a choice that's no longer current: a quick switch back and forth mustn't let the slower
  file land last.

### The ladder's two stages

The ladder (`LadderPageStore`, `DataSyncService`) starts on the head snapshot, the first 25,000
rows of the achievement-point order, and loads every player only when a view needs them:

- `requiresCompleteLadderDataset` (`ladder-filter-state.ts`): another sort orders players the
  head never selected on, and a realm, faction or class filter re-ranks within its cohort, so
  both need every player. The page size never does: 1,000 rows sit far inside the head.
- `isHeadFirstSearch`: a search on the default ladder shows the head's matches at once. They
  are the first rows of the full answer, so when they fill the page nothing more is loaded.
  Otherwise the page keeps them on screen (`isSearchingAllPlayers`) while the rest loads.
- Until the head can answer a view, the page shows its loading state instead of results that
  would look right and be wrong.
- A deep link straight to a sort or search loads every player in its first request, not the
  head and then the rest.
- A failed full load is retried from "Try again" only, not on every keystroke. It leaves the
  head's rows on screen; only a failure with nothing to show is an error page.
- `DataSyncService` shares one in-flight request between the components that ask on the same
  navigation, and a head response that arrives late never replaces the full set.

## Shared building blocks

Reuse these before you build anything new. Making a new shared piece is an architectural
decision (ask first).

| Building block | Use it for |
|---|---|
| `app-update-bar` (`update-bar.component`) | the site header, rendered once by the shell ([below](#the-app-shell-and-the-header-height-contract)). A page sets the timestamp on the right with `setPageHeader()` |
| `nav-sections.ts` | the header's sections and pages, a page's fixed link parameters (`queryParams`), and route matching for deep routes (`includes`) |
| `app-filter-dropdown` + `filter-dropdown.types.ts` | every dropdown filter. The page must list `FilterDropdownCoordinatorService` in its own `providers`, or it fails with NG0201. Pass `widthLabels` (every label it can ever show) to keep the trigger as wide as the longest one, so picking never cuts a name short or moves the toolbar; its container must then size to its content |
| `wow.ts` | the game's tables: `CLASS_NAMES`, `CLASSES_BY_NAME` (A–Z), `RACE_NAMES` (the three Pandaren ids all read "Pandaren"), `raceFaction` (0 Alliance, 1 Horde, none for the neutral Pandaren), `REALMS`, `realmSlug` (a realm as it appears in URLs) and the `Realm` and `Role` types. Never copy one of them into a page |
| `CLASS_FILTER_OPTIONS` (`wow.ts`) | a class dropdown's options: "All classes", then every class A–Z with its icon and colour. Filter it when a page offers fewer classes (the raid leaderboard on HPS) |
| `wow-specs.ts` | every Legion spec in the game's order with its id, class, role and icon (`LEGION_SPECS`), and `specFor`, `specById`, `specIconFor`, `specRoleFor`. It's apart from `wow.ts` so the ladder, which loads up front, doesn't carry it |
| `app-mobile-filter-toggle` | folds a page's filters behind one button on phones |
| `injectCompactViewport()` (`compact-viewport.ts`) | a signal that's true on phone-sized screens (`(max-width: 640px)`, or a wider query you pass) |
| `appTapTooltip` | makes a hover tooltip open on tap on touch screens |
| `app-icon-tips` | one fixed tooltip for every talent or trinket icon inside it ([below](#app-icon-tips)) |
| `app-raid-difficulty-switch` | the Raids pages' difficulty switch |
| `spec-charts/` | `app-race-by-spec` (the most-popular-race boxes); `specPopularity`, `shareTicks`, `formatShare` and `compareSpecLists` for a spec popularity chart's numbers and order |
| `app-mythic-plus-week-affixes` | this week's affixes with their descriptions (leaderboard and stats page). On phones it shows icons only and its tooltips position against the row around it, which needs `position: relative` |
| `app-back-to-top-button` | the floating back-to-top button |
| `app-pager` (`pager.component`) | every list split into pages: « First, ‹ Prev, Next ›, Last ». `<app-pager [page]="currentPage()" [pages]="pages()" [count]="(total() \| number) + ' characters'" [scrollTarget]="listSection" (pageChange)="goToPage($event)" />`. With `count`, it shows "Page 3 of 41 · 2,034 characters" after the buttons, and anything inside it (the M+ dungeon timer) sits there too. It emits only a page in range that differs from the current one, and the page writes it to `?page=`. Given a `scrollTarget`, the pager under a list scrolls back to the list's top after a change; give that element a `scroll-margin-top` that clears the header. `pageCount` and `pageSlice` (`pager.ts`) do the page maths. The Mythic+ leaderboard, the Raids Rankings and boss pages, and Rated Battlegrounds use it. A list that grows in place ("Show 50 more") isn't a pager |
| `appBottomBar` (`core/bottom-bar.directive.ts`) | a bar fixed to the bottom of the screen, such as the Mythic+ compare tray. It publishes its height as `--bottom-bar-height`, so on phones the page end and the back-to-top button stay above it ([below](#the-app-shell-and-the-header-height-contract)) |
| `app-load-state` | a page's loading spinner and its error box with "Try again": `<app-load-state [loading]="isLoading()" [error]="loadError()" loadingText="Reading the logs..." (retry)="loadData()" />`. It renders nothing once loaded; content inside it shows in the error box (the character page's difficulty switch). The Mythic+ and Raids pages use it; the older pages and the themed Arena, Emerald Nightmare and Rare Items pages keep their own |
| `class-colors.ts` | the one class-colour table: `getClassColor()` in code, `var(--class-<id>)` in SCSS |
| `game/armory.ts` | `getArmoryUrl()` for every armory link |
| `core/time-zone-label.ts` | the "GMT+2"-style label beside local times |
| `mythicPlusProfileLink()` (`core/page-links.ts`) | the router link to a character's Mythic+ profile, from any page |
| `formatClock()`, `formatDuration()` (`shared/time-format.ts`) | seconds as `29:07` / `1:02:05`, or the fixed-width `00:29:07` |
| `scoreQuality()` (`shared/score-quality.ts`) | a score's item-quality tier against the best score (`artifact` down to `uncommon`), for the `quality-colors` mixin |
| Raids helpers | in `raid-display.ts`: `nameMatches` for name search, `parseRoleFilter` for `?role=` (`tank`, `healer`, `dps`), the links, icon URLs and number formats, and `DIFFICULTY_COLORS` for code that draws (the same colours as `$difficulty-colors` in `_raid-logs-shared.scss`, so change both); in `raid-logs.ts`: `bossShortName` (a boss's `shortName`) for tiles, table cells and other tight spots: the name up to its first comma, or a shorter name from `BOSS_SHORT_NAMES` ("Elerethe", "Dragons"). A long boss name in a new raid gets an entry there |
| `_tables.scss` (forwarded by `_mythic-plus-shared.scss`) | the phone rules every table shares: `table-scroll`, `phone-columns` (`phone-hidden`, `narrow-phone-hidden`, `phone-only`), `phone-detail-rows`, `fluid-cell`, `fluid-identity`, `truncate`, and `$phone-breakpoint` / `$narrow-phone-breakpoint` ([Tables on phones](#tables-on-phones)) |
| `_mythic-plus-shared.scss` | mixins such as `tooltip-box`, `quality-colors`, `visually-hidden` (and `hidden-visually`, its declarations alone), `motion-safe`, `glide-pill`, `week-bands` (a chart's affix-week bands), `details-reveal` ([motion](motion-and-rendering.md)). `crest-glow` needs `isolation: isolate` on the crest's parent, so the glow sits under the crest and above the parent's background. `spotlight-card` takes the card's `::before` and `::after` |
| `_raid-logs-shared.scss` | forwards the M+ mixins, and adds `raid-table` (with the phone column rules and `phone-fluid` cells), `boss-picker($count)`, `ranking-toolbar`, `filter-reset`, `difficulty-switch`, `segmented-switch` (the difficulty switch's pill look, for any other switch beside it), and the since-the-last-scan marks: `change-pill` (a rank or count change, with `.positive` / `.negative`) and `new-tag` (the gold "new") |
| `.tap-area` (global) | an empty span inside a small link that grows its tap target |

`app-filter-bar` and `app-leaderboard-table` belong to the ladder page.

### `app-icon-tips`

- It shows one tooltip for whichever `data-tip` element inside it the mouse is over, or
  keyboard focus is on:
  - the name (`data-tip`), in `data-tip-color` if set;
  - a `data-tip-note` line;
  - for a talent, the element's `data-tip-spell` looked up in the `[spells]` input: its details
    line and description, from `talent-tooltips.json`
    ([data-pipeline.md](data-pipeline.md#talent-tooltips)).
- Every talent icon on the Raids pages carries `data-tip-spell`. A page passes its
  `talentTooltips()` signal to `[spells]`; until the file loads, tooltips show the name only.
- One element serves every icon, so a table of 25 rows doesn't carry hundreds of hidden
  tooltips.
- The tooltip is fixed to the viewport, at z-index 2001 over the header, because the tables it
  sits in scroll sideways and would clip it.
- Touch screens get no tooltip: the icons link to TauriShoot, which describes them in full.
  Screen readers read the links' own labels; the tooltip is hidden from them.
- Its listeners run outside Angular and only touch the tooltip's DOM, so moving the mouse
  across a table runs no change detection.
- A scroll (the page's or the table's own sideways one) closes a mouse tooltip. A keyboard
  focus tooltip follows its icon instead, since focusing the icon is often what scrolled it.

## The app shell and the header-height contract

- `AppComponent` is the shell: the header (`app-update-bar`), the `router-outlet`, and the
  back-to-top button. Pages don't render either; both hosts are `display: contents`.
- A page shows its timestamp with `setPageHeader()` (`page-header.ts`), called in its
  constructor:

  ```ts
  constructor() {
    setPageHeader(() => ({ lastEdited: this.lastEdited(), label: 'Latest game:' }));
  }
  ```

  `label` defaults to "Last updated:", and the time zone label to the reader's own
  (`getLocalTimeZoneLabel`). Pass `timeZone` and `timeZoneLabel` only for a time that isn't
  local (the guild pages show the scan's own zone). The header shows a timestamp only while
  `lastEdited` is set, and it clears when the page is destroyed.
- Route `data` can switch the shell off for one page: `header: false` (the Rare Items page has
  no header) and `backToTop: false` (the guild pages and the Hall of Fame).
- The header persists across navigation, so it closes its dropdown and drawer on every
  `NavigationStart`.
- The header is fixed. Its height is `--update-bar-height` (44 px, in `styles.scss`).
- Pages were designed for a 36 px header (30 px at ≤640 px). A `::before` on the routed page's
  host (`app-root > router-outlet + *::before` in `styles.scss`) takes the difference as its
  height, which pushes every page down by the right amount inside its own host, so a page's
  background still starts at the top.
- Sticky elements and `scroll-margin-top` use `var(--update-bar-height)`, never a hardcoded
  pixel value.
- The bottom of the screen has a contract too. On phones an `::after` on the routed page's host
  (`app-root > router-outlet + *::after` in `styles.scss`) ends every page with 72 px plus
  `--bottom-bar-height`, so the last row clears the back-to-top button and any bottom bar.
- A bar fixed to the bottom of the screen takes `appBottomBar`. It sets `--bottom-bar-height` on
  the document to its height plus the gap below it, and removes it when the bar goes. On phones
  the back-to-top button sits that much higher. The Mythic+ compare tray is the one bottom bar;
  on desktop that page keeps its own 110 px padding.
- `.update-bar` has a `view-transition-name`, which makes it a backdrop root: a
  `backdrop-filter` inside the header never blurs the page. Use opaque backgrounds there.
- At ≤960 px the sections give way to a menu button that opens a `<dialog>` drawer. At ≤640 px
  Support and Discord move into the drawer. The drawer opens with `showModal()`, so it sits in
  the top layer: nothing a page draws covers it, and no ancestor's transform or overflow clips
  it. The page behind it doesn't scroll while it's open.
- A mouse opens a section's dropdown by pointing at it (the click that usually follows keeps it
  open); touch and keyboard toggle it. Tabbing out of a section closes it, and a click
  elsewhere closes it through a document listener.

## Mobile

Phones come first (see the product rules in [AGENTS.md](../AGENTS.md)).

- Breakpoints in use: 359 px (narrow phones, `$narrow-phone-breakpoint`), 640 px (phones,
  `COMPACT_VIEWPORT_QUERY` / `$phone-breakpoint`), 900 px (M+ lists switch to cards,
  `MYTHIC_PLUS_CARDS_QUERY` / `$cards-breakpoint`, which must stay in step), 960 px (the
  header).
- A global `@media (pointer: coarse)` rule makes form fields 16 px, so iOS doesn't zoom in on
  focus. Don't override it.
- Wrap tooltip `:hover` rules in `@media (hover: hover)`, and add `appTapTooltip` for touch.
  Touch emulation keeps `:hover` on the last tapped element, so a plain `:hover` tooltip
  sticks.
- Tap targets: on touch screens (`@media (pointer: coarse)`) the Mythic+ pages make every
  switch, link and button at least 40 px tall. A small inline link grows its tap area with
  vertical padding and an equal negative margin, or with a `.tap-area` span, so the line it sits
  on doesn't move. A thin bar (14 px) gets an invisible strip that makes it about 34 px tall.
- A tooltip inside a sideways-scrolling container is clipped by it. Open it beside the bar
  rather than above, or place it against the viewport (`position: fixed`), as the stats page's
  affix-week table and `app-icon-tips` do. Near the middle of a phone-wide chart a tooltip opens
  centred over its column, since beside it would run past the edge.
- Long lists show fewer rows on phones, through `injectCompactViewport()`. The guild page's
  roster and the Top Gainers lists do this, and the M+ lists show 25 cards per page.
- Checking overflow: `npm run test:layout` ([below](#phone-layout-check)). By hand,
  `html, body { overflow-x: clip }` hides page overflow, so measure element rects, not
  `document.scrollWidth`. Some overflow only reproduces with mobile emulation (`isMobile`).
  Look at 768 px too; the check covers 320 to 412.
- Known traps:
  - An absolutely positioned `.visually-hidden` inside a non-positioned `overflow-x: auto`
    table escapes the clip and widens the mobile layout viewport. Give the scroller
    `position: relative`.
  - A `visibility: hidden` tooltip still widens its scroll area. Use `display: none` on
    phones.
  - A grid column that should shrink needs `minmax(0, 1fr)`, not `1fr`.
  - A scrolling container becomes the sticky reference of what's inside it: a table header
    that sticks to the page stops sticking once its table sits in an `overflow-x: auto` box.
    The guild page wraps its roster in one only when the table is wider than its column
    (`isTableOverflowing`).
  - A dropdown in a wrapping row of filters needs a column at least as wide as its menu
    (200 px), or an open menu reaches past its trigger and off the edge (the guild page's
    filters).


### Tables on phones

A table fits the screen at 320–412 px. It never scrolls sideways. The table rules live in
`shared/_tables.scss`; every page reaches them through `_mythic-plus-shared.scss`. Take these
steps in order, and stop when the table fits:

1. **The name gives way.** The cell that names the row (a character, guild or boss) takes the
   width the numbers leave and shortens with an ellipsis: `phone-fluid` on raid tables (the
   `raid-table` mixin), or `@include fluid-cell` in a page's own table. `fluid-identity` adds the
   icon-and-text layout those cells share. The ladder's names carry glow effects an ellipsis
   would clip, so below 360 px the ladder and Rare Achievements shrink their headers, padding
   and icon gaps instead.
2. **Hide what another column already says.** Use `phone-hidden` (≤640 px) or
   `narrow-phone-hidden` (≤359 px) on the `th` and every `td` of the column. Losses go before
   wins and games; item level goes before DPS.
3. **Move the rest under the name.** A `tr.phone-detail-row` after each row
   (`phone-detail-rows` mixin, `colspan` over every column) carries the moved values on one
   line, as the boss rankings do with talents and trinkets. Render the values from one
   `ng-template` in both places instead of copying them. When the whole row is a button (Rated
   Battlegrounds), put the line inside the name cell instead.
4. **Shorten labels.** Pair `<span class="phone-hidden">Shortest</span>` with
   `<span class="phone-only">Min</span>`, or the dungeon's `shortName` in an `<abbr>`.

A few things scroll sideways by design: charts over time that open at the latest point
(`appScrollToEnd`), a strip of cards you swipe through, and the Emerald Nightmare race
timeline. Each one is listed, with its reason, in `SIDEWAYS_BY_DESIGN` (`e2e/visual-pages.ts`).
Adding to that list is a product decision: ask first.

Charts follow the same rule. A bar chart with more bars than fit turns into horizontal bars on
phones: the bar's length is the `--bar` custom property, which is the height on desktop and
the width on phones (`spec-charts/spec-chart.scss`).

## Styles

- `styles.scss` holds the few global rules: the tokens, the iOS zoom rule, `.tap-area`, the
  class colours, and the styles of item tooltips injected as HTML from TauriShoot
  (`.legendary-tooltip-content`), which component styles can't reach.
- Plain SCSS per component, with no CSS framework.
- Text on a coloured cell keeps 4.5:1 contrast: the talents heatmap's gold stops at about half
  strength under its white figures. Most colours are literals. The shared
  tokens are the motion variables (`_motion.scss`), `--update-bar-height` and `--class-<id>`.
  The site colours are background `#050505`, text `#e0e0e0` and gold `#f7b500`. Body text is
  Arial, and no web fonts are loaded. Introducing a design-token system is an architectural
  decision.
- Budgets (`angular.json`, production): the initial bundle warns at 700 kB and errors at 1 MB;
  a component stylesheet warns at 16 kB and errors at 24 kB. Several page stylesheets are
  close to theirs (`npm run build` lists any over it). Don't add to either. Move a page's
  motion into `<page>.motion.scss`, its phone rules into `<component>.phone.scss` (the ladder
  table, Talent Analytics and the Mythic+ profile do), shared rules into a mixin, and anything
  a first visit doesn't need into a lazy route.

## Template and test gotchas

- In a template, `x()?.id` evaluates to `null`, not `undefined`. Passed to
  `app-filter-dropdown [selectedValue]`, a `null` leaves the label empty and turns on the
  selected highlight. Bind a `computed` that returns `undefined` instead.
- An "All …" dropdown option has `value: undefined`, so `options.find(o => o.value === filter)`
  matches it while no filter is set. Check for `undefined` first.
- In a TestBed, `location.back()` reaches the router only after
  `router.setUpLocationChangeListener()` and with `provideLocationMocks()`.
- A spec that renders counting numbers (`appCountUp`) stubs `matchMedia` to report reduced
  motion, so the numbers show their final values at once. See
  `mythic-plus-profile-page.component.spec.ts`.

## Checking a change in a real browser

1. `npm run build`.
2. Serve `spa/dist/tauri-achievements/browser` with a static server that serves real files
   first and falls back to `404.html`, as Pages does: `node e2e/serve-dist.mjs` (port 4300).
   `ng serve` resolves app routes first and hides routing problems.
3. Drive it with Playwright. The app is zoneless, so wait a tick (about 150 ms) after a click
   before reading the DOM.

## Visual check

`npm run test:visual` screenshots every page in `e2e/visual-pages.ts` at 360 px (as a phone,
with touch) and at 1280 px, and compares them with your local baseline. Use it for any change
that should look the same: a refactor, a migration, moved styles.

1. On the commit you start from: `npm run build`, then `npm run test:visual:baseline`.
2. After your change: `npm run build`, then `npm run test:visual`. A failure leaves the
   expected, actual and diff images in `e2e/.results/`, and `npx playwright show-report
   e2e/.report` shows them side by side.

To take a baseline from another commit without leaving your branch, build that commit in a
worktree (`git worktree add <dir> main`, then `npm ci` and `npm run build` in `<dir>/spa`)
and point the server at its output: `DIST_DIR=<dir>/spa/dist/tauri-achievements/browser
npm run test:visual:baseline`. Add `-- -g <name>` to capture only some pages.

An entry in `e2e/visual-pages.ts` is a URL, optionally with `clicks` (selectors clicked in
order before the screenshots, for menus, dropdowns and dialogs), `only` (one viewport), and
`fail` or `hold` (regular expressions for data paths that answer 500, or never answer), which
show a page's error and loading states.

How it stays deterministic:

- The baselines (`e2e/__screenshots__/`) are local and git-ignored: font rendering differs
  between machines, so they're never committed and CI doesn't run the check.
- The data is whatever `spa/src` holds. A data sync between the baseline and the check
  changes the pages, so take both on the same data.
- The clock is fixed (22 Oct 2026, 12:00 UTC), the time zone is Europe/Budapest, and the
  browser reports reduced motion, so counters and reveals show their end state.
- External images are cached in `e2e/.cache/` on first use, and analytics are blocked.
- Each page is compared in viewport-sized slices, not as one full-page image. Chromium
  sometimes leaves images unpainted in a very tall full-page capture.

To cover a new page or a new URL state, add it to `e2e/visual-pages.ts`.

## Phone layout check

`npm run test:layout` (`e2e/phone.layout.ts`) opens every page in `e2e/visual-pages.ts`, except
the desktop-only states and the loading and error states, as a phone at 320, 360, 390 and 412
px. It fails on:

- a box that scrolls sideways, unless `SIDEWAYS_BY_DESIGN` lists it;
- an element that runs past a box that clips it (cropped icons and text ending in an ellipsis
  pass);
- text cut off without an ellipsis;
- a link or button that sits under a bar fixed to the bottom of the screen at the end of the
  page.

It needs no baseline, so it gives the same answer on every machine. Run it against
`npm run build`, like the visual check, which shares its page setup (`e2e/page-setup.ts`).
