@echo off
setlocal

rem Refreshes the /raid-logs data, commits it as "sync raid logs data" and pushes.
rem Arguments go to the exporter (for example: Run-RaidLogs.cmd --full to read every log again).
set "REPO_ROOT=%~dp0.."
set "DATA_DIR=spa/src/raid-log-data"

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

dotnet run --project "%~dp0RaidLogExporter" -c Release -- %*
if errorlevel 1 (
    echo.
    echo RaidLogExporter failed. Nothing was committed.
    pause
    exit /b 1
)

git -C "%REPO_ROOT%" add -- "%DATA_DIR%"
git -C "%REPO_ROOT%" diff --cached --quiet -- "%DATA_DIR%"
if not errorlevel 1 (
    echo.
    echo No raid log changes to commit.
    pause
    exit /b 0
)

rem --only commits just the raid log data, so unrelated staged work never rides along.
git -C "%REPO_ROOT%" commit --quiet --only -m "sync raid logs data" -- "%DATA_DIR%"
if errorlevel 1 (
    echo.
    echo git commit failed.
    pause
    exit /b 1
)

git -C "%REPO_ROOT%" push --quiet origin main
if errorlevel 1 (
    echo.
    echo Committed "sync raid logs data", but the push failed. Run "git push origin main" to retry.
    pause
    exit /b 1
)

echo.
echo Committed and pushed "sync raid logs data"; GitHub Pages is building.
pause
