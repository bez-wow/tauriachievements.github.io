# AGENTS.md

Guidance for AI coding agents, and for people, working in this repository. `CLAUDE.md` imports
this file, so Claude Code reads it at the start of every session.

## Working principles (mandatory)

1. **Verify, don't guess.** Every claim about the code, the data or the Tauri API comes from
   the source, the data files or a real API response, read first. Label anything you haven't
   checked. Sizes, timings and counts go stale with every data sync: measure them again, never
   quote them from old notes.
2. **Read the guidance, then meet the bar.** Before planning a change, read the doc below that
   covers it. Then make sure the change:
   - follows the established pattern and reuses the shared building blocks
     ([docs/frontend.md](docs/frontend.md)), never a parallel mechanism;
   - keeps the browser cheap: work over the 200k-row ladder belongs in `prepare-app.js` or an
     exporter, not on page load; pages are lazy-loaded; the bundle budgets hold;
   - works on phones: `npm run test:layout` passes at 320, 360, 390 and 412 px;
   - is the right fix, not the quick one. If the right fix is bigger, say so and let the owner
     decide.
3. **Ask before architectural decisions.** Stop, present the options with a recommendation, and
   let the owner choose, even when one option looks obvious. That covers:
   - a new dependency, or a new shared component, service, directive or SCSS partial;
   - a new data file, a new Players.csv column, or any change to a data file's format;
   - a new console app, or a change to the daily update's steps;
   - a change to routing, URL parameters or the navigation structure;
   - a change to a scoring or ranking rule ([docs/scoring.md](docs/scoring.md));
   - departing from a pattern these docs describe.

   Don't ask about the mechanical steps of an approach that's already agreed.
4. **State the product choices you make.** When a request leaves a choice open (a threshold, a
   counting rule, a default), pick one, say which in your reply, and list it under
   "Choices to confirm" in the PR.
5. **Build shared things once.** When a second page needs something, move it into the shared
   file and reuse it there (see the building blocks in [docs/frontend.md](docs/frontend.md) and
   `Tauri.Core` in [docs/data-pipeline.md](docs/data-pipeline.md)). Don't copy it.
6. **Leave the docs true.** When a change makes a doc wrong or incomplete, update that doc in
   the same PR: a rule in its topic doc, a new shared building block in
   [docs/frontend.md](docs/frontend.md), a trap that cost time under "Gotchas" below. If no doc
   covers it yet, add it where the next person will look. Write down what is true now, not
   the story of how it got there.

## Repository layout

- `spa/` is the Angular 21 single-page app served by GitHub Pages at
  <https://tauriachievements.github.io/>. App code sits in `spa/src/app/`: `core/`, `shared/`,
  `game/`, `players/`, and one folder per menu section under `features/`
  ([docs/frontend.md](docs/frontend.md#where-things-go)).
- `api/` holds .NET 10 console apps (batch jobs, not a web API). They call the Tauri API and
  write the data files into `spa/src/`. Solution: `api/AchievementLadder.sln`. Shared code is
  in `api/Tauri.Core`, tests in `api/tests`.
- `.github/workflows/`:
  - `static1.yml` deploys Pages on every push to `main` (`npm test`, then `npm run build`).
  - `test.yml` runs the same `npm test` and production build on pull requests, so a PR that
    breaks the build or a bundle budget fails before it merges.
  - `api-ci.yml` checks CSharpier formatting, then builds and tests the solution, on every
    push and PR.
  - `discord-on-push.yml` posts to Discord after a deploy whose commit message is exactly
    `sync data`.
- `docs/` holds the topic docs below.
- `.claude/skills/angular-developer/` is Angular's agent skill, copied unchanged from
  [angular/skills](https://github.com/angular/skills). To update it, copy that folder again.
  Where it disagrees with this file or `docs/`, these win: `npm run build`, not `ng build`.

There is no root package manager; each half has its own toolchain.

## Docs: read the one that covers your change, and update it when the change makes it wrong

- [docs/data-pipeline.md](docs/data-pipeline.md): which job writes which file, the daily
  update, data commit messages, `prepare-app.js`, the data manifest, publishing safety.
- [docs/frontend.md](docs/frontend.md): spa conventions, shared building blocks, URL state,
  the header-height contract, mobile rules, style budgets.
- [docs/motion-and-rendering.md](docs/motion-and-rendering.md): the motion system, and the
  browser behaviour that silently breaks it.
- [docs/tauri-api.md](docs/tauri-api.md): request shape, realms, error codes and each
  endpoint's quirks.
- [docs/scoring.md](docs/scoring.md): every ranking and score rule, where it lives, and which
  test pins it.
- How-to guides: [add a page](docs/guides/howto-add-page.md),
  [add a guild page](docs/guides/howto-add-guild-page.md),
  [add an exporter or data file](docs/guides/howto-add-exporter.md).

## Commands

### Frontend (from `spa/`)

- `npm install`
- `npm start`: runs `prepare-app.js`, then `ng serve -o` on <http://localhost:4200/>.
- `npm test`: the Angular unit tests (Vitest through `@angular/build:unit-test`), then
  `node --test` over `scripts/*.test.js`. For one run without watch mode:
  `npx ng test --watch=false` and `npm run test:scripts`. Bare `npx vitest` is not the runner
  and fails.
- `npm run build`: the production build. Always use `npm run build`, never plain `ng build`:
  the `prebuild` step generates data files the app needs.
- `npm run test:visual:baseline`, then `npm run test:visual` after a change: Playwright
  screenshots of every page at 360 and 1280 px against a local baseline, for changes that
  should look the same ([docs/frontend.md](docs/frontend.md#visual-check)). Both run against
  the last `npm run build`. The first run needs `npx playwright install chromium`.
- `npm run test:layout`: opens the same pages as a phone at 320, 360, 390 and 412 px and fails
  on anything that scrolls sideways, runs past a box that clips it, or ends under a bottom bar
  ([docs/frontend.md](docs/frontend.md#phone-layout-check)). It runs against the last
  `npm run build` and needs no baseline.

### Backend (from `api/`)

- `dotnet tool restore`, then `dotnet build AchievementLadder.sln` and
  `dotnet test AchievementLadder.sln`.
- `dotnet csharpier check .` must pass (CI enforces it). `dotnet csharpier format .` fixes it.
- Credentials: copy `AchievementLadder/appsettings.example.json` to
  `AchievementLadder/appsettings.json` (git-ignored; every job reads it), or set
  `TAURI_API_APIKEY` and `TAURI_API_SECRET`.
- The daily update is `api/Run-DailyUpdate.cmd`
  ([docs/data-pipeline.md](docs/data-pipeline.md)). It commits and pushes to `main`, so run
  it only when the owner asks.

## Conventions

- **No comments in code.** That covers every source file: TypeScript, templates, SCSS, C#,
  scripts and tests. Names, types and small functions say what the code does. The why goes in
  the doc that covers it, the commit message or the PR. The only exception is a directive a
  tool reads (`// eslint-disable-next-line`, `#pragma`). When you change code that has
  comments, delete them and move anything still worth knowing into its doc.

### Frontend

- Standalone components with `ChangeDetectionStrategy.OnPush`, signals for state, and
  `inject()` for dependencies (constructors only set up effects and listeners). Inputs,
  outputs and queries are the signal functions `input()`, `output()` and `viewChild()`, not
  decorators; a value derived from inputs is a `computed`, not a getter. A spec sets an input
  with `fixture.componentRef.setInput()`.
- Templates use the built-in control flow: `@if`, `@for`, `@switch`. A `@for` tracks a key of
  the item (`track row.id`), not a method. A block inside running text stays on one line
  (`side by side@if (season) { · {{ season }}}.`): a line break inside it renders as a space.
- A feature never imports from another feature; what two features share moves down into
  `shared/`, `game/`, `core/` or `players/`. `scripts/app-boundaries.test.js` enforces this
  ([docs/frontend.md](docs/frontend.md#where-things-go)).
- Pure logic lives in `<feature>.ts` with `<feature>.spec.ts` beside it, for example
  `arena-games.ts` next to `arena-games-page.component.ts`. Components stay thin. Most tests
  cover the pure functions.
- Strict TypeScript, no `any`. Single quotes and 2-space indents (`.editorconfig`). There is no
  Prettier or ESLint config, so match the file you're in.

### Backend

- Format with the repo's CSharpier (`api/dotnet-tools.json`).
- API calls go through `ITauriApiClient` (retries, concurrency gate, API error codes). Files are
  written through `AtomicFile` or `JsonLineWriter`, so a failed run never leaves half a file.
  Players.csv is read and written only through `PlayerCsvFormat`, and characters are scanned
  only through `CharacterScanner`.
- An exporter publishes everything or nothing, and refuses to publish when its output shrinks
  suspiciously (see [docs/data-pipeline.md](docs/data-pipeline.md)).
- Tests use xUnit with a fake `ITauriApiClient`. They never call the live API.

### Git, PRs and issues

- Branch from `main` as `feat/<issue>-<kebab-name>` or `fix/<issue>-<kebab-name>` (leave out
  the number when there is no issue).
- Commit messages: a conventional prefix (`feat:`, `fix:`, `chore:`, `perf:`, `refactor:`,
  `style:`, `docs:`), an optional scope (`feat(raid-logs):`), then a plain sentence.
- PR body: `Closes #N`, why the change exists, what changed (tables for numbers), a test plan,
  the docs it updated (or "no doc change"), and "Choices to confirm". PRs are squash-merged.
- Push to `origin` (`tauriachievements/tauriachievements.github.io`). The `hugoredinho` remote
  is a fork that refuses pushes.
- Issues: a conventional-prefix title, then `## Description` and `## Suggested fix`, with
  measurements in tables.
- Data commits (`sync data`, `sync mythic plus data`, `sync raid logs data`,
  `sync guilds statistics`) come from the scripts, on `main`. Never hand-edit or hand-merge a
  generated data file: rerun its job. A feature branch commits refreshed data only when it
  changes that data's format.

## Product rules (from the owner)

- **Phones come first.** Many players use the site on a phone. No page or table scrolls
  sideways at 320–412 px: on narrow screens a table hides or moves columns
  ([docs/frontend.md](docs/frontend.md#tables-on-phones)). Ask before adding anything else that
  scrolls sideways. A mobile fix leaves the desktop layout alone unless asked.
- **Promo and info pages are marketing.** The Addon and Support pages use plain benefit copy:
  no commands, file paths or install steps. Link out for the how-to.
- **In-page controls keep the scroll position.** Filters, tabs and pagers write the URL with
  `Location.replaceState` ([docs/frontend.md](docs/frontend.md)).
- **No entrance animation on leaderboard table rows.** Everything that moves respects
  `prefers-reduced-motion`.
- **WoW class colours** for class names and charts, from `class-colors.ts`.
- **Scoring rules are the owner's decisions**, and some deliberately match other sites
  ([docs/scoring.md](docs/scoring.md)). Don't "fix" them.
- **Support page lists:** new donors and quotes go at the bottom.

## Gotchas that have cost real time

- A deployed data folder or file named like a route wins over the app on GitHub Pages (the
  page gets served raw JSON). `ng serve` doesn't show this, so test deep links against the
  built `dist/`. See [docs/data-pipeline.md](docs/data-pipeline.md).
- `404.html` doesn't redirect paths that contain a dot, so route parameters can't hold dots.
- Every `router.navigate`, even a query-parameter-only one, runs a full view transition and
  scrolls to the top. Back and Forward restore the scroll position instead
  ([docs/frontend.md](docs/frontend.md)).
- A tab left open across a code deploy asks for page chunks Pages no longer has. The router
  reloads the page once instead of ignoring the tap ([docs/frontend.md](docs/frontend.md)).
- A component `@keyframes` referenced inside `@media` silently doesn't run. Keyframes live in
  `_motion.scss` ([docs/motion-and-rendering.md](docs/motion-and-rendering.md)).
- The app is zoneless: right after a click the DOM still shows the old state, so browser checks
  wait a tick.
- Several page stylesheets sit at the 16 kB `anyComponentStyle` warning budget. Put a page's
  motion in `<page>.motion.scss` and its phone rules in `<component>.phone.scss`, as further
  `styleUrls` entries.
- A cold full `ng test` run can time out a few DOM specs at 5 s. Rerun them before treating it
  as a regression.
- Windows: `core.autocrlf=true`, and working files mix CRLF and LF, so exact-string
  replacements in the shell are fragile; use an EOL-tolerant edit. In Git Bash, `node -e '…'`
  strips backslashes (write scripts to files), and `/route` arguments get path-converted (set
  `MSYS_NO_PATHCONV=1`). A stopped `ng serve` can leave node holding the port; kill it by PID.
