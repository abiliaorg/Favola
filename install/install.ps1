<#
  Favola - Installer dei prerequisiti
  ------------------------------------
  Installa/verifica tutto il necessario per far girare il progetto su un PC vergine (Windows 10/11 64-bit):

    1. Node.js LTS        -> esegue server.js / launch.js
    2. Python 3 (64-bit)  -> bridge Tobii (gaze/tobii_gaze.py)
    3. Pacchetto pip 'websockets' -> streaming gaze live via WebSocket
    4. Google Chrome      -> UI aperta in modalita' app/kiosk
    5. Tobii Experience   -> driver + DLL tobii_stream_engine.dll (solo se si usa l'eye tracker)

  Il progetto NON ha dipendenze npm (usa solo la standard library di Node), quindi
  non serve 'npm install'.

  Uso:
    - Fai doppio click su install.bat  (si auto-eleva a Amministratore), oppure
    - Da PowerShell (come Admin):  powershell -ExecutionPolicy Bypass -File install\install.ps1

  Parametri:
    -SkipTobii   salta l'installazione di Tobii Experience (utile su PC senza eye tracker)
#>

[CmdletBinding()]
param(
  [switch]$SkipTobii
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Helper di output
# ---------------------------------------------------------------------------
function Write-Step($msg)  { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "  [OK]   $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Err2($msg)  { Write-Host "  [ERR]  $msg" -ForegroundColor Red }

Write-Host "============================================" -ForegroundColor White
Write-Host "  Favola - Installazione prerequisiti" -ForegroundColor White
Write-Host "============================================" -ForegroundColor White

# ---------------------------------------------------------------------------
# 0) Verifica presenza di winget (App Installer)
# ---------------------------------------------------------------------------
Write-Step "Verifica di winget (App Installer)"
$winget = Get-Command winget -ErrorAction SilentlyContinue
$hasWinget = [bool]$winget
if ($hasWinget) {
  Write-Ok "winget disponibile."
} else {
  Write-Warn2 "'winget' non trovato: verifichero' cio' che e' gia' presente e per il resto"
  Write-Host "  forniro' un link di download diretto (niente installazione automatica)." -ForegroundColor Yellow
  Write-Host "  Per l'installazione automatica completa, installa 'App Installer':" -ForegroundColor Yellow
  Write-Host "  https://apps.microsoft.com/detail/9nblggh4nns1" -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Funzione: installa un pacchetto winget se il comando 'probe' non esiste gia'
# ---------------------------------------------------------------------------
function Ensure-WingetPackage {
  param(
    [Parameter(Mandatory)][string]$Name,     # etichetta leggibile
    [Parameter(Mandatory)][string]$Id,       # winget package id
    [string]$Probe,                           # comando da testare per capire se e' gia' installato
    [string]$FallbackUrl                      # link di download diretto se winget manca
  )
  Write-Step "Installazione: $Name"

  if ($Probe) {
    $existing = Get-Command $Probe -ErrorAction SilentlyContinue
    if ($existing) {
      Write-Ok "$Name gia' presente ($($existing.Source))."
      return $true
    }
  }

  if (-not $hasWinget) {
    Write-Warn2 "$Name non presente e winget non disponibile: installalo manualmente."
    if ($FallbackUrl) { Write-Host "  Download: $FallbackUrl" -ForegroundColor Yellow }
    return $false
  }

  # Gia' installato secondo winget?
  $listed = & winget list --id $Id -e | Out-String
  if ($listed -match [regex]::Escape($Id)) {
    Write-Ok "$Name risulta gia' installato (winget)."
    return $true
  }

  Write-Host "  Installo $Name via winget ($Id)..." -ForegroundColor Gray
  & winget install --id $Id -e --source winget `
      --accept-package-agreements --accept-source-agreements `
      --disable-interactivity
  if ($LASTEXITCODE -eq 0) {
    Write-Ok "$Name installato."
    return $true
  } else {
    Write-Warn2 "winget ha restituito codice $LASTEXITCODE per $Name."
    return $false
  }
}

# ---------------------------------------------------------------------------
# 1) Node.js LTS
# ---------------------------------------------------------------------------
Ensure-WingetPackage -Name "Node.js LTS" -Id "OpenJS.NodeJS.LTS" -Probe "node" `
  -FallbackUrl "https://nodejs.org/en/download/prebuilt-installer" | Out-Null

# ---------------------------------------------------------------------------
# 2) Python 3 (64-bit)  — usiamo la 3.12
# ---------------------------------------------------------------------------
Ensure-WingetPackage -Name "Python 3.12" -Id "Python.Python.3.12" -Probe "py" `
  -FallbackUrl "https://www.python.org/downloads/windows/" | Out-Null

# ---------------------------------------------------------------------------
# 3) Google Chrome  (spesso non e' in PATH: rileviamo anche i percorsi noti)
# ---------------------------------------------------------------------------
$chromePresent = [bool](Get-Command chrome -ErrorAction SilentlyContinue) -or `
                 (Test-Path "C:\Program Files\Google\Chrome\Application\chrome.exe") -or `
                 (Test-Path "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe")
if ($chromePresent) {
  Write-Step "Installazione: Google Chrome"
  Write-Ok "Google Chrome gia' presente."
} else {
  Ensure-WingetPackage -Name "Google Chrome" -Id "Google.Chrome" -Probe "chrome" `
    -FallbackUrl "https://www.google.com/chrome/" | Out-Null
}

# ---------------------------------------------------------------------------
# 4) Tobii Experience (driver ET5 + DLL). Opzionale.
# ---------------------------------------------------------------------------
if ($SkipTobii) {
  Write-Step "Tobii Experience"
  Write-Warn2 "Saltato (-SkipTobii). Necessario solo per usare l'eye tracker."
} else {
  Write-Step "Tobii Experience (driver Eye Tracker 5)"
  $dllPath = "C:\Program Files\Tobii\Tobii EyeX\tobii_stream_engine.dll"
  if (Test-Path $dllPath) {
    Write-Ok "Tobii gia' installato (DLL trovata)."
  } else {
    # winget potrebbe non avere il pacchetto: proviamo, poi fallback al link.
    $tobiiIds = @("Tobii.GamingHub", "Tobii.Experience")
    $done = $false
    if ($hasWinget) {
      foreach ($id in $tobiiIds) {
        $found = & winget show --id $id -e | Out-String
        if ($found -match [regex]::Escape($id)) {
          Ensure-WingetPackage -Name "Tobii ($id)" -Id $id | Out-Null
          $done = $true
          break
        }
      }
    }
    if (-not $done) {
      Write-Warn2 "Tobii non disponibile via winget. Installalo manualmente:"
      Write-Host "  https://gaming.tobii.com/getstarted/  -> 'Tobii Eye Tracker 5'" -ForegroundColor Yellow
      Write-Host "  (Dopo l'installazione, calibra l'eye tracker in Tobii Experience.)" -ForegroundColor Yellow
    }
  }
}

# ---------------------------------------------------------------------------
# 5) Pacchetto Python 'websockets'
# ---------------------------------------------------------------------------
Write-Step "Pacchetto Python 'websockets'"
# Rileva il launcher Python (py preferito su Windows, altrimenti python)
$pyCmd = $null
if (Get-Command py -ErrorAction SilentlyContinue)     { $pyCmd = "py" }
elseif (Get-Command python -ErrorAction SilentlyContinue) { $pyCmd = "python" }

if (-not $pyCmd) {
  Write-Warn2 "Python non trovato in PATH in questa sessione."
  Write-Host "  Chiudi e riapri il terminale (o riavvia il PC) e rilancia l'installer" -ForegroundColor Yellow
  Write-Host "  per completare l'installazione di 'websockets'." -ForegroundColor Yellow
} else {
  Write-Host "  Uso interprete: $pyCmd" -ForegroundColor Gray
  # pip writes upgrade/deprecation notices to stderr; under ErrorActionPreference='Stop'
  # (and PS 5.1) a redirected native stderr becomes a terminating error and aborts the
  # script. Relax it to 'Continue' for these native calls and judge success by exit code.
  $prevEAP = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    # Nota: non aggiorniamo pip (richiederebbe privilegi di scrittura su pip.exe e
    # non e' necessario per installare 'websockets').
    & $pyCmd -m pip install websockets
    $okWs = ($LASTEXITCODE -eq 0)
  } finally {
    $ErrorActionPreference = $prevEAP
  }
  if ($okWs) {
    Write-Ok "'websockets' installato."
  } else {
    Write-Err2 "Installazione di 'websockets' fallita. Riprova con: $pyCmd -m pip install websockets"
  }
}

# ---------------------------------------------------------------------------
# 6) Verifica finale
# ---------------------------------------------------------------------------
Write-Step "Verifica finale"

function Test-Tool {
  param([string]$Name, [string]$Cmd, [string[]]$VersionArgs)
  $c = Get-Command $Cmd -ErrorAction SilentlyContinue
  if ($c) {
    $ver = ""
    try { $ver = (& $Cmd @VersionArgs 2>&1 | Select-Object -First 1) } catch {}
    Write-Ok ("{0,-16} {1}" -f $Name, $ver)
    return $true
  } else {
    Write-Warn2 ("{0,-16} non rilevato in questa sessione (riavvia il terminale)" -f $Name)
    return $false
  }
}

$okNode   = Test-Tool -Name "Node.js"  -Cmd "node"   -VersionArgs @("--version")
$okPython = Test-Tool -Name "Python"   -Cmd "py"     -VersionArgs @("--version")
$okChrome = [bool](Get-Command chrome -ErrorAction SilentlyContinue) -or `
            (Test-Path "C:\Program Files\Google\Chrome\Application\chrome.exe") -or `
            (Test-Path "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe")
if ($okChrome) { Write-Ok ("{0,-16} presente" -f "Chrome") } else { Write-Warn2 "Chrome non rilevato." }

# websockets
if ($pyCmd) {
  $prevEAP = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $pyCmd -c "import websockets" 2>$null; $wsImportable = ($LASTEXITCODE -eq 0) }
  finally { $ErrorActionPreference = $prevEAP }
  if ($wsImportable) { Write-Ok ("{0,-16} importabile" -f "websockets") }
  else { Write-Warn2 "websockets non importabile (rilancia l'installer dopo il riavvio del terminale)." }
}

# Tobii DLL
if (Test-Path "C:\Program Files\Tobii\Tobii EyeX\tobii_stream_engine.dll") {
  Write-Ok ("{0,-16} DLL presente" -f "Tobii")
} elseif (-not $SkipTobii) {
  Write-Warn2 "Tobii DLL assente (ok se non usi l'eye tracker)."
}

Write-Host "`n============================================" -ForegroundColor White
Write-Host "  Installazione completata." -ForegroundColor White
Write-Host "============================================" -ForegroundColor White
Write-Host "Per avviare il progetto:" -ForegroundColor White
Write-Host "  cd `"$([System.IO.Path]::GetFullPath("$PSScriptRoot\.."))`"" -ForegroundColor Gray
Write-Host "  npm start        (equivale a: node launch.js)" -ForegroundColor Gray
Write-Host "`nNota: se Node/Python risultano 'non rilevati', chiudi e riapri il" -ForegroundColor DarkGray
Write-Host "terminale per ricaricare il PATH, poi rilancia questo installer." -ForegroundColor DarkGray
