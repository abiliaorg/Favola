@echo off
setlocal
cd /d "%~dp0"

set WEB_PORT=12345
set TOBII_PORT=12346

echo ==========================================
echo  Favola - Avvio sistema completo
echo  Web=%WEB_PORT%  Tobii=%TOBII_PORT%
echo ==========================================

echo.
echo [0/3] Libero le porte %WEB_PORT% e %TOBII_PORT% da processi residui...
powershell -NoProfile -Command "foreach ($p in @(%WEB_PORT%, %TOBII_PORT%)) { $conn = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue; foreach ($c in $conn) { try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host ('killed pid ' + $c.OwningProcess + ' on port ' + $p) } catch {} } }"

echo.
echo [1/3] Avvio web server (porta %WEB_PORT%)...
start "Favola - Web Server" cmd /k "set PORT=%WEB_PORT% && npm run server"

echo [2/3] Avvio Tobii bridge (WebSocket %TOBII_PORT%)...
start "Favola - Tobii Bridge" cmd /k "python gaze\tobii_gaze.py --ws --ws-port %TOBII_PORT% --no-csv"

echo [3/3] Attesa 2s e apertura Chrome in modalita' app...
timeout /t 2 /nobreak >nul
start "" chrome --app=http://127.0.0.1:%WEB_PORT%/session/index.html --start-maximized --no-first-run --disable-features=Translate

echo.
echo Servizi avviati. Chiudi le finestre cmd per fermare server e bridge.
echo Questa finestra puoi chiuderla.
timeout /t 5 /nobreak >nul
endlocal
