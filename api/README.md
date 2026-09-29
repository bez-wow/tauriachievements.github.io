# Tauri Achievement Ladder

[![API CI](https://github.com/tauriachievements/tauriachievements.github.io/actions/workflows/api-ci.yml/badge.svg)](https://github.com/tauriachievements/tauriachievements.github.io/actions/workflows/api-ci.yml)

A .NET 10 batch-processing toolkit that builds achievement leaderboards and guild reports
from the Tauri WoW API. It collects characters from multiple sources, enriches them through
concurrent API calls, normalizes inconsistent responses, and publishes deterministic CSV,
JSON, text, and Excel outputs for a companion frontend.

This is a suite of one-shot ETL-style console applications—not an HTTP API. The project
focuses on external API integration, resilient high-volume processing, data consistency,
and durable file-based publishing.

## Engineering highlights

- Bounded parallelism with configurable request concurrency
- Per-request timeouts and exponential retry backoff with jitter
- Graceful cancellation using `CancellationToken`
- Retry queues and persistent resume state for interrupted jobs
- Atomic output replacement to prevent partially published files
- Defensive parsing of inconsistent third-party JSON
- Deterministic normalization, deduplication, and ordering
- xUnit unit and service tests with fake API responses and Coverlet coverage
- .NET 10 CI builds

## Architecture

```mermaid
flowchart LR
    Input[Character and guild sources] --> Jobs[Console jobs]
    Jobs --> Core[Tauri.Core]
    Core <--> API[Tauri WoW API]
    Jobs --> Output[CSV / JSON / TXT / XLSX]
    Output --> Frontend[Achievement ladder frontend]
```

`Tauri.Core` contains shared configuration, HTTP transport, response mapping, realm
normalization, achievement extraction, and item-appearance logic. Each executable owns one
workflow and its output contract.

| Project | Purpose |
| --- | --- |
| `AchievementLadder` | Builds the player leaderboard and rare-achievement export. |
| `GuildCharacterExporter` | Expands configured guilds into character sources. |
| `MissingPlayerFinder` | Backfills characters absent from an existing export. |
| `RealmFirstAchievements` | Rebuilds and validates realm-first character sources. |
| `BattlegroundCollector` | Collects sequential PvP matches with resumable state and appends complete ranked responses to the frontend archive. |
| `Guildkukker` | Generates ranked guild reports with reputation, artifact, and item-level data. |
| `EndlessGuildExporter` | Produces a formatted Excel guild roster. |

## Processing model

1. Load, normalize, and deduplicate character or guild targets.
2. Fetch workflow-specific data through the shared, concurrency-limited API client.
3. Map unstable external responses into stable internal and export models.
4. Sort results deterministically and write them to temporary files.
5. Atomically publish completed outputs and preserve failures for retry.

The main scan treats a character as one consistent snapshot: the achievements and item-appearance
requests must both succeed before publication. Every job that produces player rows (the full
scan and the missing-player backfill) goes through the same `CharacterScanner`, and every
job that reads or writes Players.csv goes through `PlayerCsvFormat`, so rows cannot differ by
the job that produced them. Transient HTTP, network, timeout, and invalid-response failures are
retried. Unresolved targets are recorded for the next run rather than silently discarded.

Players.csv stores the date each character earned "Level 10" (`Level10Date`); the frontend
derives the character's age from it at display time.

## Technology

- .NET 10, C#, nullable reference types
- `HttpClient`, `System.Text.Json`
- `Parallel.ForEachAsync`, `SemaphoreSlim`, concurrent collections
- CSV, JSON, text, and Open XML `.xlsx` generation
- xUnit, Coverlet, GitHub Actions

The solution intentionally has no database or web server. File-based publishing is a conscious
fit for its static frontend and scheduled batch workflow.

## Quick start

Requirements: .NET 10 SDK and valid Tauri API credentials. Commands that publish frontend data
write directly to the monorepo's `spa/src` directory.

```powershell
Copy-Item AchievementLadder/appsettings.example.json AchievementLadder/appsettings.json
$env:TAURI_API_APIKEY = "your-api-key"
$env:TAURI_API_SECRET = "your-api-secret"
dotnet run --project AchievementLadder
```

The local `appsettings.json` is ignored by Git. Environment variables can also configure
concurrency, timeouts, and retry behavior; see
[`appsettings.example.json`](AchievementLadder/appsettings.example.json) for available values.

## Commands

| Task | Command |
| --- | --- |
| Build the leaderboard | `dotnet run --project AchievementLadder` |
| Refresh guild character sources | `dotnet run --project GuildCharacterExporter` |
| Rescan only the guilds that failed last time | `dotnet run --project GuildCharacterExporter -- --retry` |
| Backfill missing players (up to 3 rounds) | `dotnet run --project MissingPlayerFinder` |
| Validate realm-first characters | `dotnet run --project RealmFirstAchievements` |
| Collect battlegrounds | `dotnet run --project BattlegroundCollector -- 95874` |
| Export a ranked guild report | `dotnet run --project Guildkukker -- Evermoon Endless` |
| Export the Endless workbook | `dotnet run --project EndlessGuildExporter` |

Commands with additional options expose usage through `--help` or document their arguments
at startup.

## Daily update

`Run-DailyUpdate.cmd` (or `Run-DailyUpdate.ps1`) runs the whole refresh end to end:
RealmFirstAchievements, BattlegroundCollector, GuildCharacterExporter, AchievementLadder and
MissingPlayerFinder, then commits every data file as one `sync data` commit and pushes it.
That commit message triggers the Discord notification, so keep it.

- It stops at the first failed job; resume with `-From <Step>` (for example `-From Ladder`).
- It refuses to publish when Players.csv shrank by more than 2% against the last commit,
  which usually means the API was unstable. Override with `-MaxShrinkPercent`.
- `-NoPush` commits locally without pushing.

Retry queues (`MissingGuildsToScan.txt`, `MissingPlayersToScan.txt`) and run logs live in the
git-ignored `.work/` folder, and `GuildCharacters.txt` is rebuilt on every run, so there is
nothing to commit by hand or discard afterwards. Guilds the API reports as not found are removed
from the guild lists; BattlegroundCollector adds them back if they reappear.

## Tests and CI

The solution contains 47 focused tests covering:

- Rare-achievement parsing across valid, missing, and malformed payloads
- Item-appearance counting and character mapping, including the Level 10 date
- Realm normalization
- The Players.csv format: header/row round-trip, escaping, and JSON serialization
- Atomic file writes, including a failed write leaving the previous file intact
- Successful and failed character scans through a fake `ITauriApiClient`
- Guild export retry rounds, retry-only merges, and dead-guild pruning with its safety cap

Run the same Release validation used by CI:

```powershell
dotnet restore AchievementLadder.sln
dotnet build AchievementLadder.sln --configuration Release --no-restore
dotnet test AchievementLadder.sln --configuration Release --no-build
```

CI uploads Cobertura coverage reports as workflow artifacts. End-to-end scans are deliberately
excluded because they require live credentials and depend on an external API.

## Trade-offs and limitations

- Throughput is constrained by external API latency and rate limits.
- Defensive `JsonElement` parsing remains necessary for several inconsistent response shapes.
- Data-publishing commands expect the frontend at `../spa` relative to this directory.
- A custom Excel writer implements only the Open XML features required by these reports.
- Several large exporter services still contain parsing, orchestration, and presentation logic
  that should be separated incrementally.

## Roadmap

- Adopt Generic Host, dependency injection, typed options, and structured logging
- Register the API client through `IHttpClientFactory` and introduce typed response contracts
- Split large exporters into orchestration, transformation, and persistence components
- Expand integration and output-contract tests across the remaining workflows
