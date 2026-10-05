<#
.SYNOPSIS
    Runs the full daily Tauri Achievements data update and publishes it to GitHub.

.DESCRIPTION
    Builds the solution once, then runs each job in order and stops at the first failure:
      RealmFirst       RealmFirstAchievements   -> valid-realm-first-characters.txt
      Battlegrounds    BattlegroundCollector    -> battlegrounds, new guilds, guildless characters
      MythicPlus       MythicPlusExporter       -> spa/src/mythic-plus (the /mythic-plus leaderboards)
      GuildCharacters  GuildCharacterExporter   -> GuildCharacters.txt (retries and prunes dead guilds)
      Ladder           AchievementLadder        -> Players.csv and the rare exports
      MissingPlayers   MissingPlayerFinder      -> backfills skipped characters in rounds
      Publish          one "sync data" commit with every data file, then push

    Before publishing it compares the Players.csv row count with the last commit and refuses
    to publish a ladder that shrank by more than -MaxShrinkPercent.

    Retry queues and logs live in api/.work/, which git ignores, so there is nothing to
    discard afterwards.

.EXAMPLE
    .\Run-DailyUpdate.ps1
    .\Run-DailyUpdate.ps1 -From Ladder        # resume after a failed step
    .\Run-DailyUpdate.ps1 -NoPush             # commit locally, push yourself
#>
param(
    [ValidateSet('RealmFirst', 'Battlegrounds', 'MythicPlus', 'GuildCharacters', 'Ladder', 'MissingPlayers', 'Publish')]
    [string]$From = 'RealmFirst',

    [switch]$NoPush,

    [ValidateRange(0, 100)]
    [double]$MaxShrinkPercent = 2
)

$ErrorActionPreference = 'Stop'

$apiRoot = $PSScriptRoot
$repoRoot = Split-Path $apiRoot -Parent
$workDir = Join-Path $apiRoot '.work'
$logDir = Join-Path $workDir 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$logPath = Join-Path $logDir ('daily-update_{0:yyyy-MM-dd_HHmm}.log' -f (Get-Date))
$playersCsvRepoPath = 'spa/src/Players.csv'

$steps = @(
    @{ Name = 'RealmFirst'; Project = 'RealmFirstAchievements' },
    @{ Name = 'Battlegrounds'; Project = 'BattlegroundCollector' },
    @{ Name = 'MythicPlus'; Project = 'MythicPlusExporter' },
    @{ Name = 'GuildCharacters'; Project = 'GuildCharacterExporter' },
    @{ Name = 'Ladder'; Project = 'AchievementLadder' },
    @{ Name = 'MissingPlayers'; Project = 'MissingPlayerFinder' }
)

# Everything a run changes that belongs in the repo. The frontend build reads the spa files;
# the api files are inputs for the next run.
$publishPaths = @(
    'spa/src/lastUpdated.txt',
    'spa/src/Players.csv',
    'spa/src/RareAchievements.json',
    'spa/src/RareItems.json',
    'spa/src/battleground-collector-state.json',
    'spa/src/battlegrounds.json',
    'spa/src/rated-battlegrounds.json',
    'spa/src/mythic-plus',
    'api/AchievementLadder/Data/Guilds/tauri-guilds.txt',
    'api/AchievementLadder/Data/Guilds/evermoon-guilds.txt',
    'api/AchievementLadder/Data/Guilds/wod-guilds.txt',
    'api/AchievementLadder/Data/GuildCharacters/guildless-characters.txt',
    'api/AchievementLadder/Data/valid-realm-first-characters.txt'
)

function Write-Log([string]$Message, [string]$Color = 'Cyan') {
    $line = '[{0:yyyy-MM-dd HH:mm:ss}] {1}' -f (Get-Date), $Message
    Write-Host $line -ForegroundColor $Color
    Add-Content -Path $logPath -Value $line -Encoding UTF8
}

function Stop-Run([string]$Message) {
    Write-Log $Message 'Red'
    Write-Log "Log: $logPath" 'Red'
    exit 1
}

function Invoke-Git {
    & git -C $repoRoot @args
    if ($LASTEXITCODE -ne 0) {
        Stop-Run "git $($args -join ' ') failed with exit code $LASTEXITCODE."
    }
}

function Get-LineCount([string]$Path) {
    if (-not (Test-Path $Path)) { return 0 }
    $count = 0
    $reader = [System.IO.StreamReader]::new($Path)
    try {
        while ($null -ne $reader.ReadLine()) { $count++ }
    }
    finally {
        $reader.Dispose()
    }
    return $count
}

# Clicking inside a classic console window with QuickEdit on starts a text selection that
# freezes every program writing to that window until Esc is pressed. Turn QuickEdit off for
# this window so a stray click cannot stall a run that takes hours.
function Disable-ConsoleQuickEdit {
    try {
        Add-Type -Namespace DailyUpdate -Name ConsoleMode -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int nStdHandle);
[DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);
[DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);
'@
        $enableQuickEditMode = 0x40
        $enableExtendedFlags = 0x80
        $inputHandle = [DailyUpdate.ConsoleMode]::GetStdHandle(-10)
        [uint32]$mode = 0
        if ([DailyUpdate.ConsoleMode]::GetConsoleMode($inputHandle, [ref]$mode)) {
            $newMode = [uint32](($mode -bor $enableExtendedFlags) - ($mode -band $enableQuickEditMode))
            [void][DailyUpdate.ConsoleMode]::SetConsoleMode($inputHandle, $newMode)
        }
    }
    catch {
        # Not a classic console (e.g. Windows Terminal or redirected input): nothing to do.
    }
}

function Format-Duration([TimeSpan]$Duration) {
    '{0}h {1:00}m {2:00}s' -f [int][Math]::Floor($Duration.TotalHours), $Duration.Minutes, $Duration.Seconds
}

Disable-ConsoleQuickEdit
$runStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
Write-Log "Daily update started (from step: $From). Log: $logPath"

# --- Pre-flight: fail in the first minute, not after a 10-hour scan ---------------------

$branch = (& git -C $repoRoot rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'main') {
    Stop-Run "Current branch is '$branch'. Switch to main before running the daily update."
}

if (-not $NoPush) {
    Invoke-Git fetch --quiet origin main
    $behind = [int](& git -C $repoRoot rev-list --count HEAD..origin/main)
    if ($behind -gt 0) {
        Stop-Run "main is $behind commit(s) behind origin/main; the push would be rejected. Run 'git pull' first."
    }
}

# cmd does the redirect so the 200k-line blob is written as raw bytes, not re-encoded by PowerShell.
$baselineTempPath = Join-Path $workDir 'Players.baseline.csv'
cmd /c "git -C `"$repoRoot`" show HEAD:$playersCsvRepoPath > `"$baselineTempPath`" 2>nul"
$baselineRows = if ($LASTEXITCODE -eq 0) { Get-LineCount $baselineTempPath } else { 0 }
Remove-Item $baselineTempPath -Force -ErrorAction SilentlyContinue
Write-Log "Players.csv rows in last commit: $baselineRows"

# --- Build once, then run the jobs ------------------------------------------------------

$stepNames = @($steps | ForEach-Object { $_.Name }) + 'Publish'
$startIndex = 0
while ($stepNames[$startIndex] -ne $From) { $startIndex++ }   # -ne is case-insensitive

if ($startIndex -lt $steps.Count) {
    Write-Log 'Building solution (Release)...'
    & dotnet build (Join-Path $apiRoot 'AchievementLadder.sln') -c Release --nologo -v quiet
    if ($LASTEXITCODE -ne 0) {
        Stop-Run 'Build failed.'
    }
}

for ($i = $startIndex; $i -lt $steps.Count; $i++) {
    $step = $steps[$i]
    Write-Log "=== [$($i + 1)/$($steps.Count)] $($step.Name): $($step.Project) ==="
    $stepStopwatch = [System.Diagnostics.Stopwatch]::StartNew()

    & dotnet run --project (Join-Path $apiRoot $step.Project) -c Release --no-build
    $exitCode = $LASTEXITCODE

    $elapsed = Format-Duration $stepStopwatch.Elapsed
    if ($exitCode -ne 0) {
        Stop-Run "$($step.Name) failed with exit code $exitCode after $elapsed. Fix the problem, then resume with: .\Run-DailyUpdate.ps1 -From $($step.Name)"
    }
    Write-Log "$($step.Name) finished in $elapsed." 'Green'
}

# --- Sanity gate ------------------------------------------------------------------------

$currentRows = Get-LineCount (Join-Path $repoRoot $playersCsvRepoPath)
Write-Log "Players.csv rows now: $currentRows (last commit: $baselineRows)"

if ($baselineRows -gt 0) {
    $minimumRows = [int][Math]::Floor($baselineRows * (1 - $MaxShrinkPercent / 100))
    if ($currentRows -lt $minimumRows) {
        Stop-Run ("Players.csv shrank from $baselineRows to $currentRows rows (more than $MaxShrinkPercent%). " +
            'Not publishing: the API was probably unstable. Rerun the scan, or if the drop is real publish anyway with: ' +
            '.\Run-DailyUpdate.ps1 -From Publish -MaxShrinkPercent 100')
    }
}

$missingGuilds = Get-LineCount (Join-Path $workDir 'MissingGuildsToScan.txt')
$missingPlayers = Get-LineCount (Join-Path $workDir 'MissingPlayersToScan.txt')
Write-Log "Left for next run: $missingGuilds guild(s), $missingPlayers character(s) (in api/.work)."

# --- Publish ----------------------------------------------------------------------------

$existingPublishPaths = @($publishPaths | Where-Object { Test-Path (Join-Path $repoRoot $_) })
Invoke-Git add -- @existingPublishPaths

& git -C $repoRoot diff --cached --quiet -- @existingPublishPaths
if ($LASTEXITCODE -eq 0) {
    Write-Log 'No data changes to publish.' 'Yellow'
}
else {
    # --only commits just these paths, so unrelated staged work never rides along.
    # The message must stay "sync data": the Discord notification workflow matches on it.
    Invoke-Git commit --quiet --only -m 'sync data' -- @existingPublishPaths
    Write-Log "Committed 'sync data'." 'Green'

    if ($NoPush) {
        Write-Log 'Skipping push (-NoPush). Run "git push origin main" when ready.' 'Yellow'
    }
    else {
        Invoke-Git push --quiet origin main
        Write-Log 'Pushed to origin/main; GitHub Pages is building.' 'Green'
    }
}

Write-Log "Daily update finished in $(Format-Duration $runStopwatch.Elapsed)." 'Green'
