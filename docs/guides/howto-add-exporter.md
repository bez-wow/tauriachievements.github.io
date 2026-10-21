# How to add an exporter or a data file

An exporter is a console app in `api/` that reads the Tauri API and writes a data file for the
site. `MythicPlusExporter` and `RaidLogExporter` are the references: both are all-or-nothing,
guarded against shrinking, one entry per line, and tested with a fake API client.

## 0. Ask first

A new console app, a new data file, a change to a data format and a new daily-update step are
all architectural decisions. Agree with the owner:

- what the file holds and its shape (positional arrays for big files, as the M+ and raid files
  use);
- where it goes in `spa/src/`, under a name that **isn't** a route (see
  [data-pipeline.md](../data-pipeline.md#rules));
- whether it runs in the daily update, and at which step.

Before designing the parsing, read [tauri-api.md](../tauri-api.md) for the endpoint's quirks.

## 1. The project

- `api/<Name>/<Name>.csproj`: `net10.0`, `Exe`, nullable and implicit usings on, referencing
  `..\Tauri.Core\Tauri.Core.csproj` (copy `RaidLogGuildAndCharScan.csproj`).
- `dotnet sln AchievementLadder.sln add <Name>/<Name>.csproj`.
- `Program.cs`: copy the bootstrap from `MythicPlusExporter/Program.cs`:
  - options parsing with a `--help` usage text;
  - `ProjectPaths.FindProjectRoot` / `FindSolutionRoot`;
  - the shared `AchievementLadder/appsettings.json`;
  - `ProjectPaths.GetFrontendSrcDirectory` for the output folder;
  - Ctrl+C cancellation;
  - a non-zero exit code on failure, which stops the daily update at this step.
- Put the work in a service class that takes an `ITauriApiClient`, so tests can hand it a fake.

## 2. Writing the file

- Read responses defensively (`JsonElement`, as the existing parsers do), and map them into
  stable records before writing.
- Sort deterministically, so the same data always writes the same bytes.
- Write through `AtomicFile`, or `JsonLineWriter` for one entry per line, so the daily git
  diffs stay small.
- **All or nothing:** if any part couldn't be read, write nothing and exit non-zero.
- **Shrink guard:** refuse to write when the main count falls more than 2% against the
  existing file, with an `--allow-shrink` override (copy `MaxShrinkFraction` from
  `MythicPlusExportService`).
- Put a `version` in the file, and make the reader treat an older version as out of date
  rather than misreading it (`RaidLogFileReader`).
- When the site must read two or more of the files together, write a fingerprint of the shared
  tables into each one, as `MythicPlusFileWriter.TablesFingerprint` does
  ([data-pipeline.md](../data-pipeline.md#caching-the-data-manifest)).
- If you write LF, add the folder to the root `.gitattributes` (`text eol=lf`).

## 3. Wiring it into the site

- Add the file or folder to `assets` in `spa/angular.json`. The data manifest then hashes it
  automatically.
- Load it in the spa through `DataFileService`, with the file's types and a decoder in the
  feature's pure `<feature>.ts`.

## 4. The daily update

- `api/Run-DailyUpdate.ps1`: add `@{ Name = '<Step>'; Project = '<Name>' }` to `$steps` at the
  agreed place, and the output path to `$publishPaths`. The `sync data` commit only includes
  listed paths.
- `api/README.md`: add the project to the projects table and its command to the commands
  table, and update the daily update's step list.
- Update the step list in [data-pipeline.md](../data-pipeline.md#the-daily-update).

## 5. Tests and formatting

- Tests go in `api/tests/AchievementLadder.Tests/<Name>ServiceTests.cs`, with a project
  reference added to that test project. Feed recorded or hand-written responses through a fake
  `ITauriApiClient`. Cover parsing, the all-or-nothing rule and the shrink guard. No test
  calls the live API.
- `dotnet csharpier format .`, then `dotnet build AchievementLadder.sln` and
  `dotnet test AchievementLadder.sln`.
- Run the exporter once against the live API, and check the output file and the page that
  reads it. Commit the first data file with the feature, since the format is new.
