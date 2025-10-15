# dev-stop.ps1 — Stop local dev server started by dev-start.ps1
if (-Not (Test-Path .\server.pid)) {
  Write-Host "No server.pid file found. Server may not be running or was started externally."
  exit 0
}

$pidVal = Get-Content .\server.pid | Select-Object -First 1
try {
  Stop-Process -Id $pidVal -Force -ErrorAction Stop
  Remove-Item .\server.pid -ErrorAction SilentlyContinue
  Write-Host "Stopped server (PID: $pidVal)."
} catch {
  Write-Warning "Failed to stop process $pidVal (it may have already exited). Removing server.pid if present."
  Remove-Item .\server.pid -ErrorAction SilentlyContinue
}
