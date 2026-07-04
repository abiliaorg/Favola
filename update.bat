@echo off
REM ---------------------------------------------------------------------------
REM  Favola - update the project from git (origin/main).
REM  Double-click to fetch the latest code. No 'npm install' is needed: the
REM  project has no npm dependencies (Node standard library only).
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

echo ==^> Updating Favola from origin/main...
git pull --ff-only origin main
if errorlevel 1 (
  echo.
  echo [ERR] Update failed. Commit or stash local changes / resolve conflicts, then retry.
  pause
  exit /b 1
)

echo.
echo [OK] Update complete. Start the app with:  npm start
pause
