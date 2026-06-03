@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo  Favola - Avvio sistema completo
echo ==========================================

echo.
echo [1/3] Avvio web server (porta 8080)...
start "Favola - Web Server" cmd /k "npm run server"

echo [2/3] Avvio Tobii bridge (WebSocket 8765)...
start "Favola - Tobii Bridge" cmd /k "npm run tobii"

echo [3/3] Attesa 2s e apertura Chrome in modalita' app...
timeout /t 2 /nobreak >nul
start "" chrome --app=http://127.0.0.1:8080/session/index.html --start-maximized --no-first-run --disable-features=Translate

echo.
echo Servizi avviati. Chiudi le finestre cmd per fermare server e bridge.
echo Questa finestra puoi chiuderla.
timeout /t 5 /nobreak >nul
endlocal
