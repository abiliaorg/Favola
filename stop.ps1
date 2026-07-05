# ---------------------------------------------------------------------------
#  Favola - stop any running project processes.
#  Kills (best effort): the web server (:12345), the Tobii bridge (:12346 /
#  tobii_gaze.py), the launcher (launch.js) and the Chrome app window opened on
#  the session page. Targets are matched by process name + command line, so
#  unrelated node/python/chrome instances are left untouched.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'SilentlyContinue'

function Stop-ByCmdline([string]$nameLike, [string]$needle, [string]$label) {
  Get-CimInstance Win32_Process |
    Where-Object { $_.Name -like $nameLike -and $_.CommandLine -like ('*' + $needle + '*') } |
    ForEach-Object {
      try { Stop-Process -Id $_.ProcessId -Force; Write-Host ("  stopped {0} (pid {1})" -f $label, $_.ProcessId) -ForegroundColor DarkGray } catch {}
    }
}

Write-Host "==> Stopping Favola processes..." -ForegroundColor Cyan

# Free the web + Tobii ports (kills whatever is listening on them).
foreach ($port in 12345, 12346) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { try { Stop-Process -Id $_ -Force; Write-Host ("  freed port {0} (pid {1})" -f $port, $_) -ForegroundColor DarkGray } catch {} }
}

Stop-ByCmdline 'node*'   'server.js'          'server'
Stop-ByCmdline 'node*'   'launch.js'          'launcher'
Stop-ByCmdline 'python*' 'tobii_gaze.py'      'Tobii bridge'
Stop-ByCmdline 'chrome*' 'session/index.html' 'Chrome app window'

Write-Host "  done." -ForegroundColor Green
