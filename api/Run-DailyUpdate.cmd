@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Run-DailyUpdate.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" goto :Done

rem guild-analysis.cmd pushes on its own, which would also push the "sync data" commit.
echo(%*| findstr /i /c:"-NoPush" >nul
if not errorlevel 1 (
    echo.
    echo Skipping guild-analysis.cmd because -NoPush was given. Run it yourself after pushing.
    goto :Done
)

echo.
echo === Guild analysis ===
rem Input comes from nul so the pause commands inside guild-analysis.cmd don't stop the run.
call "%~dp0guild-analysis.cmd" <nul
set "EXIT_CODE=%ERRORLEVEL%"

:Done
echo.
pause
exit /b %EXIT_CODE%
