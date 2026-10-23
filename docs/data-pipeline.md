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
- RaidLogExporter looks up each talent's tooltip once and keeps it in `talent-tooltips.json`
  ([below](#talent-tooltips)). A run looks up only the spells the file lacks; `--full`, or a
  file of another `version`, looks them all up again (about 20 s). A tooltip TauriShoot can't
  give is left out and looked up again next run. When TauriShoot's talent trees can't be read,
  `talents.json` and `talent-tooltips.json` both stay as they are.

Keep these guards in any new exporter ([guides/howto-add-exporter.md](guides/howto-add-exporter.md)).

## Raid log files

RaidLogExporter writes `raid-log-data/` for the `/raid-logs` pages, which decode it in
`raid-logs.ts`. Every entry goes on its own line, and the tables grow in order of first
appearance, so a new kill is a few added lines in git.

- `index.json`: when the rankings were read (`generatedAt`, UTC ISO 8601), the raid, its
  difficulties (with kill counts) and bosses, the spec table, and every kill as
  `[realm, logId, boss, difficultyId, killedAtUnix, fightMs, guild, faction, wipes, deaths, members]`
  (boss and guild are positions in `bosses` and `guilds`, guild -1 for a pickup group, members a
  count). Once there is an earlier export to compare with, `previousGeneratedAt` and the kills
  added since it as `newLogs` (`[realm, logId]`). `guilds` as `[name, realm, faction, guildId]`
  (an empty name for a guild that couldn't be named), each name with a former character (below)
  as `formerCharacters` (`[name, realm, classNow, [earlierClass, ...]]`, latest first), each boss
  and difficulty's best DPS and HPS as `[name, realm, class, spec, perSecond, logRealm, logId]`,
  and the loot's `items` as `[id, name, quality, icon]`.
- `<boss>-<difficulty>.json`: that boss's kills on that difficulty, oldest first, as
  `[realm, logId, killedAtUnix, fightMs, guild, faction, wipes, deaths, resurrects, members, [itemId, ...]]`,
  each member `[player, spec, ilvl, damage, healing, absorbs, overhealing, damageTaken, interrupts, dispels, talents, [trinket, ...]]`.
  `talents` holds a character per tier, top to bottom: the column picked (`0` to `2` from the
  left) or `.` for an empty tier, and is empty when the log has none. The file has its own
  `guilds` (as in the index), `players` (`[name, realm, class, race, gender, guild]`, below) and
  `trinkets` (`[id, itemLevel, name, quality, icon]`) tables. A boss file needs nothing from the
  index, so a page that loaded the index before a deploy can still read a newer boss file. A
  difficulty without kills has no file.
- `talents.json`: each spec's talent choices as `[specId, [[[spellId, name, icon], ...], ...]]`,
  tiers top to bottom and choices left to right (null where TauriShoot has none).
- `talent-tooltips.json`: [below](#talent-tooltips).

A boss file's `players` table holds one row per realm, name and class. A name played by two
classes over the season (a freed name taken by a new character) gets a row for each, and every
kill points at the row of the class it was logged as. Race and gender come from that class's
latest kill. The guild comes from Players.csv, else the latest kill that named one; a former
character (below) never takes the Players.csv guild, which belongs to whoever has the name now.

A name belongs to the class of its latest kill on any boss and difficulty. A row of any other
class is a former character with that name and ends with an extra `1`. The site leaves former
characters out of the leaderboard, boss rankings, spec performance and Talent Analytics. Their
kills still count as player slots and still set a boss's best
([scoring.md](scoring.md#raid-leaderboard)). The character page shows the current character;
a switch under the name (from `formerCharacters`) opens an earlier one at `?class=<classId>`,
on the first difficulty it has kills on, with its kills but no score or rank. The log page
links a former character's name to that view. Only the exporter sees every kill, so only it can
tell: the site loads one difficulty at a time.

RaidLogExporter rebuilds the logs it already has from the boss files, so whatever a file
doesn't store is lost for those logs until they're read again. Bump
`RaidLogFileWriter.FormatVersion` whenever a boss file's shape or meaning changes: the next run
then reads every log again from the API.

## Talent tooltips

`raid-log-data/talent-tooltips.json` holds a tooltip for every spell in `talents.json`, one per
line: `{"version": 1, "spells": [[spellId, [detail, ...], description], ...]}`, in spell id
order. RaidLogExporter turns TauriShoot's tooltip HTML into plain text (paragraphs kept as
`\n\n`) and drops what TauriShoot gets wrong ([tauri-api.md](tauri-api.md#taurishoot-legion-shoottaurihu)),
so a tooltip never shows a number it knows is wrong:

- The details keep the range, the cast time and a cooldown of 2 sec or more, in TauriShoot's
  order. Costs go, and so do "Unlimited range" and a lone "Instant" (a passive talent).
- The description loses the stand-in amount before "damage" or "healing" ("causing 375
  Physical damage" becomes "causing Physical damage"), a zero heal or rating ("for 0", "by 0
  for"), and the minus of a reduction ("by -25%" becomes "by 25%").
- A description that still holds an unresolved value (`$`, a lone `0`, `sec1`, a `%` without
  a number, a stray minus, `1.5.1`, a four-digit percentage) is written as `""`. The tooltip
  then shows the talent's name and details only. On 2026-10-22 that was 140 of 603 spells.

The rules are in `TauriShootSpellTooltipSource`. Changing them means bumping
`RaidLogFileWriter.TalentTooltipsFormatVersion`, so the next run looks every tooltip up again
with the new rules. The site decodes the file with `decodeTalentTooltips` (`raid-logs.ts`) and
loads it through `RaidLogsDataService.talentTooltips()` once a page's kills are in, so it never
holds up the page.

## What `prepare-app.js` builds

`npm start` and `npm run build` run `spa/scripts/prepare-app.js` first (`prestart` /
`prebuild`). It parses Players.csv once and writes into `spa/src/assets/data/`. Those files are
git-ignored and regenerated on every build:

- `players.snapshot.json`: every player, self-describing (`c` = column names, `k` = the ranking
  rules from `scripts/player-ranking.js`), in achievement-point order, with each player's rank
  and value changes since the previous day's scan. `realm` and `faction` are indexes into the
  file's own lists, played time is in whole minutes (the app works in seconds), and a "Level 10"
  date is days since 1970-01-01 (0 when unknown). `readPlayerSnapshot` reads rows by column
  name, never by position, so a column the build adds, drops or moves can't land in the wrong
  field; a column it expects but the file lacks reads as 0 or `''` and is reported once.
- `players.head.snapshot.json`: exactly the first 25,000 rows of the full snapshot. The ladder
  starts on it and loads the full file only when a search or sort needs it. Both files carry
  the same realm and faction lists, so moving from the head to the full file keeps every row's
  realm and faction.
- `players.history.snapshot.json`, `new-players.snapshot.json`, `stats.snapshot.json`,
  `guilds.snapshot.json`: small precomputed files for Top Gainers, New Rare Characters, Stats
  and Guild Rankings.
- `stats.snapshot.json` carries every bucket's bounds with its label, since a label means
  nothing apart from the bounds that produced it. Class names and colours stay in the page, so
  restyling a chart or renaming a class needs no new data.
- `battlegrounds-<era>.json`: one file per era, so the default Legion view never downloads the
  much larger prepatch history. `legion` holds the battlegrounds started from 2026-07-15 09:00
  (`LEGION_START`), `wod-prepatch` everything before. A file is `{ version, era, names, days }`:
  days in date order, each holding its battlegrounds as flat triples (an index into `names`, the
  start minute of the day, the duration in seconds or -1 when unknown), in the collector's
  order. The collector writes `YYYY.MM.DD HH.MM` start times and `HH:MM:SS` durations; a bare
  number is milliseconds.
- `raid-genders.json`: gender corrections for raid characters (the raid API reports almost
  everyone as male), taken from Players.csv: for each raid character the ladder knows, the
  ladder's gender where the two disagree. A ladder character of another class is a different
  character with the same name and is left alone. The file is
  `{ v, female: { realm: [names] }, male: { realm: [names] } }`.
- `data-manifest.json`: a content hash for every data file, generated last.

**The previous scans come from git history.** Every `sync data` commit is one scan.
`readPlayersCsvHistory()` (`scripts/player-data-utils.js`) uses `git log --follow`, so a build
needs the full history: `static1.yml` and `test.yml` check out with `fetch-depth: 0`. In a
shallow clone the deltas, Top Gainers and "new character" flags all come out empty, and nothing
fails.

- The earlier scans are one per calendar day, newest first, never from the current scan's day,
  up to 21 days in all for the history timeline (`load-player-snapshots.js`).
- The current scan's time is the later of `lastUpdated.txt` and the newest `sync data` commit.
  The file's modification time is a last resort only: in CI it's the checkout time, which
  would turn a guild-only deploy into zero deltas.
- `--name-status` records the path each commit had (the file moved from `src/` to `spa/src/`).
  A pure rename (`R100`) isn't a scan: counting it would compare the data with itself.

## Caching: the data manifest

`DataFileService` is the only way the app loads a data file. It requests `file?v=<hash>`, with
the hash taken from `data-manifest.json`, so a browser caches each file until a deploy changes
it. The manifest itself is fetched fresh once per session. Its file list comes from the
`assets` entries in `angular.json` plus everything in `assets/data/`. A new data file only
needs adding to `angular.json`.

GitHub Pages ignores `?v=`, so a tab left open across a deploy can mix old and new files. The
Mythic+ files guard against this: `index.json` and every dungeon file carry a `tables`
fingerprint. When they don't match, `MythicPlusDataService` refreshes the session and loads
again, once; a second mismatch means the deploy is still going out, and the page says so
(`NEWER_DATA_MESSAGE`) instead of retrying in a loop.
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
