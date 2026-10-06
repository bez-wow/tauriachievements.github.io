@echo off
setlocal

rem Refreshes the /mythic-plus leaderboards, commits them as "sync mythic plus data" and pushes.
rem Arguments go to the exporter (for example: Run-MythicPlus.cmd --allow-shrink at a season reset).
set "REPO_ROOT=%~dp0.."
set "DATA_DIR=spa/src/mythic-plus-data"

rem Pre-flight: make sure the push at the end will be accepted before spending time on the export.
for /f "delims=" %%b in ('git -C "%REPO_ROOT%" rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"
if /i not "%BRANCH%"=="main" (
    echo Current branch is "%BRANCH%". Switch to main first.
    pause
    exit /b 1
)

git -C "%REPO_ROOT%" fetch --quiet origin main
if errorlevel 1 (
    echo.
    echo git fetch failed.
    pause
    exit /b 1
)

for /f %%n in ('git -C "%REPO_ROOT%" rev-list --count HEAD..origin/main') do set "BEHIND=%%n"
if not "%BEHIND%"=="0" (
    echo main is %BEHIND% commit^(s^) behind origin/main; the push would be rejected. Run "git pull" first.
    pause
    exit /b 1
)

dotnet run --project "%~dp0MythicPlusExporter" -c Release -- %*
if errorlevel 1 (
    echo.
    echo MythicPlusExporter failed. Nothing was committed.
    pause
    exit /b 1
)

git -C "%REPO_ROOT%" add -- "%DATA_DIR%"
git -C "%REPO_ROOT%" diff --cached --quiet -- "%DATA_DIR%"
if not errorlevel 1 (
    echo.
    echo No Mythic+ data changes to commit.
    pause
    exit /b 0
)

rem --only commits just the M+ data, so unrelated staged work never rides along.
git -C "%REPO_ROOT%" commit --quiet --only -m "sync mythic plus data" -- "%DATA_DIR%"
if errorlevel 1 (
    echo.
    echo git commit failed.
    pause
    exit /b 1
)

git -C "%REPO_ROOT%" push --quiet origin main
if errorlevel 1 (
    echo.
    echo Committed "sync mythic plus data", but the push failed. Run "git push origin main" to retry.
    pause
    exit /b 1
)

echo.
echo Committed and pushed "sync mythic plus data"; GitHub Pages is building.
pause
