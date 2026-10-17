@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion

rem This file lives in api\, next to the Guildkukker project; the repo root is one level up.
for %%I in ("%~dp0..") do set "GIT_REPO=%%~fI"
set "GUILDKUKKER_PROJECT=%~dp0Guildkukker"
set "OUTPUT_DIR=%GIT_REPO%\spa\src\guild-analysis"

if not exist "%GUILDKUKKER_PROJECT%\Guildkukker.csproj" (
    echo Guildkukker project not found:
    echo %GUILDKUKKER_PROJECT%
    pause
    exit /b 1
)

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
if errorlevel 1 (
    echo Could not create the output directory:
    echo %OUTPUT_DIR%
    pause
    exit /b 1
)

set /a GUILD_COUNT=0

call :ScanGuild "Evermoon" "Endless"
if errorlevel 1 goto :ScanFailed

call :ScanGuild "Evermoon" "Competence Optional"
if errorlevel 1 goto :ScanFailed

call :ScanGuild "Evermoon" "Highly Regarded"
if errorlevel 1 goto :ScanFailed

call :ScanGuild "Evermoon" "Témérité"
if errorlevel 1 goto :ScanFailed

call :ScanGuild "Evermoon" "Impact"
if errorlevel 1 goto :ScanFailed

call :ScanGuild "Evermoon" "Impaired"
if errorlevel 1 goto :ScanFailed

call :ScanGuild "Evermoon" "Entropy"
if errorlevel 1 goto :ScanFailed

call :ScanGuild "Evermoon" "acoustic"
if errorlevel 1 goto :ScanFailed

call :ScanGuild "Tauri" "Outlaws"
if errorlevel 1 goto :ScanFailed

call :ScanGuild "Evermoon" "Miracle"
if errorlevel 1 goto :ScanFailed

call :ScanGuild "Evermoon" "Rycerze Ortalionu"
if errorlevel 1 goto :ScanFailed

if %GUILD_COUNT% equ 0 (
    echo No guilds are configured in this script.
    pause
    exit /b 1
)

echo.
echo All %GUILD_COUNT% guild scans completed.
echo JSON files exported to: %OUTPUT_DIR%

echo.
echo Committing guild statistics...
git -C "%GIT_REPO%" add -- "spa/src/guild-analysis"
if errorlevel 1 (
    echo Failed to stage the guild statistics.
    pause
    exit /b 1
)

git -C "%GIT_REPO%" diff --cached --quiet -- "spa/src/guild-analysis"
if not errorlevel 1 (
    echo No guild statistics changed. Nothing to commit or push.
    pause
    exit /b 0
)

git -C "%GIT_REPO%" commit -m "sync guilds statistics" -- "spa/src/guild-analysis"
if errorlevel 1 (
    echo Failed to commit the guild statistics.
    pause
    exit /b 1
)

git -C "%GIT_REPO%" push
if errorlevel 1 (
    echo The commit was created, but the push failed.
    pause
    exit /b 1
)

echo Guild statistics committed and pushed successfully.
pause
exit /b 0

:ScanFailed
echo.
echo A guild scan failed.
pause
exit /b 1

:ScanGuild
set "REALM=%~1"
set "GUILD=%~2"

if not defined REALM exit /b 0
if not defined GUILD (
    echo.
    echo Invalid entry for realm "%REALM%".
    echo Expected format: Realm-Guild Name
    exit /b 1
)

set /a GUILD_COUNT+=1
echo.
echo ============================================================
echo Scanning %REALM% - %GUILD%
echo ============================================================

dotnet run --project "%GUILDKUKKER_PROJECT%" -- "%REALM%" "%GUILD%" --output-directory "%OUTPUT_DIR%"
if errorlevel 1 (
    echo.
    echo Guildkukker failed for %REALM% - %GUILD%.
    exit /b 1
)

echo Completed: %REALM% - %GUILD%
exit /b 0
