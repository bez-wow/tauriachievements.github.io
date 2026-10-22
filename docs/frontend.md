# Frontend (spa/)

Angular 21 with standalone components, signals and `OnPush`. `zone.js` isn't in the polyfills,
so the app is zoneless. It builds to static files that GitHub Pages serves.

## Where things go

Everything sits flat in `spa/src/app/`. A file's name says what it is:

| Name | Holds |
|---|---|
| `<name>-page.component.{ts,html,scss}` | a routed page |
| `<name>.component.*` | a child or shared component |
| `<feature>.ts` + `<feature>.spec.ts` | pure logic: types, parsing, ranking, formatting (e.g. `mythic-plus.ts`, `raid-logs.ts`, `arena-games.ts`) |
| `<name>.directive.ts` | an attribute directive (`app` prefix: `[appReveal]`) |
| `services/<name>.service.ts` | data loading shared by several pages |
| `_<area>-shared.scss` | SCSS mixins shared by an area's pages |
| `<page>.motion.scss` | a page's motion, as a second `styleUrls` entry |

Outside `app/`: `src/utils/` (`armory.ts`, class and race icon helpers, `time-zone-label.ts`)
and `src/scss/` (`styles.scss`, `_motion.scss`).

Keep components thin. A ranking, filter or count goes into the pure `<feature>.ts`, where a
spec can pin it down without a TestBed.

## Routing

- `app.routes.ts` loads the oldest pages eagerly. Every page added since then uses
  `loadComponent`, and new pages are lazy too
  ([guides/howto-add-page.md](guides/howto-add-page.md)).
- `app.config.ts` turns on `withViewTransitions()` and `scrollPositionRestoration: 'top'`, so
  **every router navigation, even one that only changes query parameters, runs a full-page
  view transition and scrolls to the top.**
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
  const url = this.router.createUrlTree([], { relativeTo: this.route, queryParams: { … } });
  this.location.replaceState(this.router.serializeUrl(url));
  ```

  `syncQueryParams()` in `mythic-plus-page.component.ts` is the reference.
- **Real navigation** is only for a change the Back button should undo. For example, on the
  Talent Analytics page, opening a spec's card navigates, while difficulty, boss, role and class
  use `replaceState`. On a spec's page, picking a role or a class, or pressing Reset, navigates
  back to the overview.
- The router never sees parameters written with `replaceState`. When you build a link or
  navigation from the current state, spell out every parameter you want kept.

## Loading data

- Every data file loads through `DataFileService` ([data-pipeline.md](data-pipeline.md)):
  - `getJson()` memoizes per session;
  - `fetchJson()` is for large files the caller converts into its own structures;
  - `getText()` loads text files.
- Never add `?v=Date.now()`: that defeats the manifest's caching.
- Decode large files lazily. The M+ leaderboard's `createRunDecoder` builds views only for the
  visible page, and the ladder starts on the 25,000-row head snapshot.
- `RaidLogsDataService` loads the raid files and keeps `lastDifficulty`, so the Raids tabs
  remember the difficulty within a session.

## Shared building blocks

Reuse these before you build anything new. Making a new shared piece is an architectural
decision (ask first).

| Building block | Use it for |
|---|---|
| `app-update-bar` (`update-bar.component`) | the site header; every page renders it. `lastEditedLabel` / `lastEdited` set the timestamp on the right |
| `nav-sections.ts` | the header's sections and pages, and route matching for deep routes (`includes`) |
| `app-filter-dropdown` + `filter-dropdown.types.ts` | every dropdown filter. The page must list `FilterDropdownCoordinatorService` in its own `providers`, or it fails with NG0201 |
| `CLASS_FILTER_OPTIONS` (`mythic-plus.ts`) | a class dropdown's options: "All classes", then every class A–Z with its icon and colour. Filter it when a page offers fewer classes (the raid leaderboard on HPS) |
| `app-mobile-filter-toggle` | folds a page's filters behind one button on phones |
| `injectCompactViewport()` (`compact-viewport.ts`) | a signal that's true on phone-sized screens (`(max-width: 640px)`, or a wider query you pass) |
| `appTapTooltip` | makes a hover tooltip open on tap on touch screens |
| `app-icon-tips` | one fixed tooltip for every talent or trinket icon inside it ([below](#app-icon-tips)) |
| `app-raid-difficulty-switch`, `app-race-by-spec` | the raid difficulty switch; the most-popular-race boxes |
| `app-back-to-top-button` | the floating back-to-top button |
| `class-colors.ts` | the one class-colour table: `getClassColor()` in code, `var(--class-<id>)` in SCSS |
| `utils/armory.ts` | `getArmoryUrl()` for every armory link |
| `utils/time-zone-label.ts` | the "GMT+2"-style label beside local times |
| `raid-logs.ts` helpers | `nameMatches`, `realmSlug`, `RAID_REALMS` for name search and realm URLs; `parseRoleFilter` for `?role=` (`tank`, `healer`, `dps`); `bossShortName` (a boss's `shortName`) for tiles, table cells and other tight spots: the name up to its first comma, or a shorter name from `BOSS_SHORT_NAMES` ("Elerethe", "Dragons"). A long boss name in a new raid gets an entry there |
| `_mythic-plus-shared.scss` | mixins such as `tooltip-box`, `quality-colors`, `visually-hidden`, `motion-safe`, `glide-pill`, `table-scroll` |
| `_raid-logs-shared.scss` | forwards the M+ mixins, and adds `raid-table`, `ranking-toolbar`, `filter-reset`, `pager`, `difficulty-switch`, and `segmented-switch` (the difficulty switch's pill look, for any other switch beside it) |
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

## The header-height contract

- The header is fixed. Its height is `--update-bar-height` (44 px, in `styles.scss`).
- Pages were designed for a 36 px header (30 px at ≤640 px). `app-update-bar`'s host takes the
  difference as its height, which pushes every page down by the right amount.
- Sticky elements and `scroll-margin-top` use `var(--update-bar-height)`, never a hardcoded
  pixel value.
- `.update-bar` has a `view-transition-name`, which makes it a backdrop root: a
  `backdrop-filter` inside the header never blurs the page. Use opaque backgrounds there.
- At ≤960 px the sections give way to a menu button that opens a `<dialog>` drawer. At ≤640 px
  Support and Discord move into the drawer.

## Mobile

Phones come first (see the product rules in [AGENTS.md](../AGENTS.md)).

- Breakpoints in use: 640 px (phones, `COMPACT_VIEWPORT_QUERY`), 900 px (M+ lists switch to
  cards, `MYTHIC_PLUS_CARDS_QUERY` / `$cards-breakpoint`, which must stay in step), 960 px (the
  header).
- A global `@media (pointer: coarse)` rule makes form fields 16 px, so iOS doesn't zoom in on
  focus. Don't override it.
- Wrap tooltip `:hover` rules in `@media (hover: hover)`, and add `appTapTooltip` for touch.
  Touch emulation keeps `:hover` on the last tapped element, so a plain `:hover` tooltip
  sticks.
- Long lists show fewer rows on phones, through `injectCompactViewport()`. The guild page's
  roster and the Top Gainers lists do this, and the M+ lists show 25 cards per page.
- Checking overflow: `html, body { overflow-x: clip }` hides page overflow, so measure element
  rects, not `document.scrollWidth`. Some overflow only reproduces with mobile emulation
  (`isMobile`). Test at 320, 360, 390, 412 and 768 px.
- Known traps:
  - An absolutely positioned `.visually-hidden` inside a non-positioned `overflow-x: auto`
    table escapes the clip and widens the mobile layout viewport. Give the scroller
    `position: relative`.
  - A `visibility: hidden` tooltip still widens its scroll area. Use `display: none` on
    phones.
  - A grid column that should shrink needs `minmax(0, 1fr)`, not `1fr`.

## Styles

- Plain SCSS per component, with no CSS framework. Most colours are literals. The shared
  tokens are the motion variables (`_motion.scss`), `--update-bar-height` and `--class-<id>`.
  The site colours are background `#050505`, text `#e0e0e0` and gold `#f7b500`. Body text is
  Arial, and no web fonts are loaded. Introducing a design-token system is an architectural
  decision.
- Budgets (`angular.json`, production): the initial bundle warns at 700 kB and errors at 1 MB;
  a component stylesheet warns at 16 kB and errors at 24 kB. The initial bundle is already
  past its warning, and several page stylesheets are at or past theirs (`npm run build` lists
  them). Don't add to either. Move a page's motion into `<page>.motion.scss`, shared rules
  into a mixin, and anything a first visit doesn't need into a lazy route.

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
   first and falls back to `404.html`, as Pages does. `ng serve` resolves app routes first and
   hides routing problems.
3. Drive it with Playwright. The app is zoneless, so wait a tick (about 150 ms) after a click
   before reading the DOM.
