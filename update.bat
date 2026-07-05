@echo off
REM ---------------------------------------------------------------------------
REM  Favola - update the project from git (origin/main).
REM  Stops any running Favola processes, pulls the latest code, then prints the
REM  version reached. No 'npm install' is needed: the project has no npm deps.
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1"

echo.
echo ==^> Updating Favola from origin/main...
git pull --ff-only origin main
if errorlevel 1 (
  echo.
  echo [ERR] Update failed. Commit/stash local changes or resolve conflicts, then retry.
  pause
  exit /b 1
)

echo.
echo ==^> Versione attuale:
git log -1 --pretty=format:"    %%s%n    commit %%h  -  %%cd" --date=format:"%%Y-%%m-%%d %%H:%%M"
echo.
echo.
echo [OK] Update complete. Start the app with:  npm start
pause
