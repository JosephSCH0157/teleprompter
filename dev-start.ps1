# dev-start.ps1 — Start local dev server (PowerShell)
# Starts live-server in the background and stores the PID in server.pid

$port = 8080
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "Node.js not found in PATH. Install Node.js to proceed."
  exit 1
}

Write-Host "Starting live-server on port $port..."
$proc = Start-Process -FilePath "npx" -ArgumentList "live-server --port=$port --no-browser --watch=." -PassThru -WindowStyle Hidden
$procId = $proc.Id
Set-Content -Path .\server.pid -Value $procId
Write-Host "Started. PID: $procId"
Write-Host "Open http://localhost:$port/teleprompter_pro.html in your browser."