# Data pipeline

The site has no server. Console apps in `api/` call the Tauri API and write data files into
`spa/src/`. Scripts commit those files to `main`, and every push to `main` rebuilds and deploys
the site.

```
Tauri API ──► api/ console apps ──► spa/src/ data files ──► commit on main ──► Pages deploy
                                            │
                            spa/scripts/prepare-app.js (npm start / npm run build)
                                            ▼
                         spa/src/assets/data/ (generated, git-ignored)
                                            ▼
                         DataFileService in the browser (file?v=<content hash>)
```

## Who writes what

| File or folder in `spa/src/` | Written by | Commit message | Read by |
|---|---|---|---|
| `Players.csv`, `lastUpdated.txt`, `RareAchievements.json` | `AchievementLadder`, `MissingPlayerFinder` | `sync data` | `prepare-app.js`, the ladder pages |
| `RareItems.json` | `AchievementLadder` | `sync data` | Rare Items page |
| `battlegrounds.json`, `battleground-collector-state.json`, `rated-battlegrounds.json`, `rated-2v2-arena-games.json`, `rated-3v3-arena-games.json` | `BattlegroundCollector` | `sync data` | Battleground, Rated Battleground and Arena pages |
| `mythic-plus-data/` | `MythicPlusExporter` | `sync data`, or `sync mythic plus data` from `Run-MythicPlus.cmd` | `/mythic-plus/*` |
| `raid-log-data/` | `RaidLogExporter` | `sync data`, or `sync raid logs data` from `Run-RaidLogs.cmd` | `/raid-logs/*` |
| `guild-analysis/<key>.json` | `Guildkukker` through `api/guild-analysis.cmd` | `sync guilds statistics` | the hidden guild pages |
| `EmeraldNightmare.json`, `RealmFirstAchievements.json`, `ap-chest-looters.json` | edited by hand | `chore:` / `feat:` | Race to Emerald Nightmare, Realm First History, Hall of Fame |

The scan inputs live under `api/AchievementLadder/Data/`. `BattlegroundCollector` and the two
`*GuildAndCharScan` jobs append new guilds and guildless characters to the realm lists;
`GuildCharacterExporter` removes guilds that no longer exist; `RealmFirstAchievements` rewrites
`valid-realm-first-characters.txt`. `sync data` commits these lists too.

## The daily update

`api/Run-DailyUpdate.cmd` runs `Run-DailyUpdate.ps1`, which builds once and then runs these
steps in order. The step names are the values `-From` accepts.

1. `MythicPlus`: MythicPlusExporter
2. `RaidLogs`: RaidLogExporter
3. `MythicPlusNames`: MythicPlusGuildAndCharScan
4. `RaidLogNames`: RaidLogGuildAndCharScan
5. `RealmFirst`: RealmFirstAchievements
6. `Battlegrounds`: BattlegroundCollector
7. `GuildCharacters`: GuildCharacterExporter
8. `Ladder`: AchievementLadder
9. `MissingPlayers`: MissingPlayerFinder
10. `Publish`: one `sync data` commit of the paths in `$publishPaths`, then a push

If every step succeeded and `-NoPush` wasn't given, the `.cmd` then calls
`api/guild-analysis.cmd`, which scans every guild page and makes its own
`sync guilds statistics` commit and push.

- `-From <Step>` resumes after a failure, `-NoPush` commits without pushing, and
  `-MaxShrinkPercent` (default 2) sets the shrink gate.
- The commit message must stay exactly `sync data`: `discord-on-push.yml` matches on it.
- Retry queues (`MissingGuildsToScan.txt`, `MissingPlayersToScan.txt`) and run logs live in the
  git-ignored `api/.work/`.
- `Run-MythicPlus.cmd` and `Run-RaidLogs.cmd` refresh one dataset on its own. Each refuses to
  start unless you're on `main` and level with `origin/main`.

## Publishing safety

Each job writes everything or nothing, through `AtomicFile` / `JsonLineWriter` in `Tauri.Core`.
On top of that:

- The daily update won't publish when Players.csv has shrunk by more than `-MaxShrinkPercent`
  compared with the last commit. That usually means the API was unstable.
- MythicPlusExporter and RaidLogExporter refuse to write when the run or kill count shrinks by
  more than 2%. Pass `--allow-shrink` when the drop is real, such as a new season.
- MythicPlusExporter writes nothing unless it read every leaderboard.
- GuildCharacterExporter removes guilds the API reports as not found (error code 13), but no
  more than 5% of all guilds per run.
- RaidLogExporter is incremental: it re-reads its own boss files and fetches only new logs.
  `--full` refetches everything. A boss file with an older format version makes the next run
  re-read every log.

Keep these guards in any new exporter ([guides/howto-add-exporter.md](guides/howto-add-exporter.md)).

## What `prepare-app.js` builds

`npm start` and `npm run build` run `spa/scripts/prepare-app.js` first (`prestart` /
`prebuild`). It parses Players.csv once and writes into `spa/src/assets/data/`. Those files are
git-ignored and regenerated on every build:

- `players.snapshot.json`: every player, self-describing (`c` = column names, `k` = the ranking
  rules from `scripts/player-ranking.js`), in achievement-point order, with each player's rank
  and value changes since the previous day's scan.
- `players.head.snapshot.json`: exactly the first 25,000 rows of the full snapshot. The ladder
  starts on it and loads the full file only when a search or sort needs it.
- `players.history.snapshot.json`, `new-players.snapshot.json`, `stats.snapshot.json`,
  `guilds.snapshot.json`: small precomputed files for Top Gainers, New Rare Characters, Stats
  and Guild Rankings.
- `battlegrounds-<era>.json`: battlegrounds grouped by day, so the page doesn't parse the raw
  `battlegrounds.json`.
- `raid-genders.json`: gender corrections for raid characters (the raid API reports almost
  everyone as male), taken from Players.csv.
- `data-manifest.json`: a content hash for every data file, generated last.

**The previous scans come from git history.** Every `sync data` commit is one scan.
`readPlayersCsvHistory()` (`scripts/player-data-utils.js`) uses `git log --follow`, so a build
needs the full history: `static1.yml` checks out with `fetch-depth: 0`. In a shallow clone the
deltas, Top Gainers and "new character" flags all come out empty, and nothing fails.

## Caching: the data manifest

`DataFileService` is the only way the app loads a data file. It requests `file?v=<hash>`, with
the hash taken from `data-manifest.json`, so a browser caches each file until a deploy changes
it. The manifest itself is fetched fresh once per session. Its file list comes from the
`assets` entries in `angular.json` plus everything in `assets/data/`. A new data file only
needs adding to `angular.json`.

GitHub Pages ignores `?v=`, so a tab left open across a deploy can mix old and new files. The
Mythic+ files guard against this: `index.json` and every dungeon file carry a `tables`
fingerprint. When they don't match, the page calls `DataFileService.refresh()` and loads again.
Any new data split across several files needs the same guard. Raid boss files carry their own
tables, so they don't.

## Rules

- **Never name a deployed data folder or file after a route.** On Pages a real folder wins over
  the SPA route: when the M+ data folder was named `mythic-plus/`, `/mythic-plus` served
  `index.json` raw. `ng serve` resolves app routes first and hides this. Test deep links against
  the built `dist/` with a static server that serves real files first and falls back to
  `404.html`.
- **Never hand-edit or hand-merge a generated data file.** After a format change, a merge
  conflicts with the daily data commits on `main`. Take `main`'s side and rerun the job.
- Exporters write one entry per line (`JsonLineWriter`), so the daily git diffs stay small.
- MythicPlusExporter and RaidLogExporter write LF. The root `.gitattributes` keeps their
  folders LF on checkout, so `core.autocrlf` doesn't warn on every commit. A new exporter that
  writes LF needs a line there too.
