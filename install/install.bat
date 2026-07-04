@echo off
REM ====================================================================
REM  Favola - Installer prerequisiti (wrapper)
REM  Si auto-eleva ad Amministratore e lancia install.ps1
REM ====================================================================
setlocal

REM Verifica privilegi di amministratore
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Richiesta elevazione ad Amministratore...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
  exit /b
)

echo Esecuzione installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*

echo.
pause
