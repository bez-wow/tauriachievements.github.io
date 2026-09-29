@echo off
setlocal

rem Double-click entry point for Run-DailyUpdate.ps1; arguments are passed through
rem (for example: Run-DailyUpdate.cmd -From Ladder).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Run-DailyUpdate.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

echo.
pause
exit /b %EXIT_CODE%
