param(
  [int]$Port = 5180,
  [string]$Bind = '127.0.0.1',
  [string]$Root = '.'
)

# Simple static file server using HttpListener
Add-Type -AssemblyName System.Web | Out-Null
$listener = [System.Net.HttpListener]::new()
$prefix = "http://$Bind:$Port/"
$listener.Prefixes.Add($prefix)

# Normalize root to full path
$Root = (Resolve-Path -LiteralPath $Root).Path

try {
  $listener.Start()
  Write-Host "PowerShell static server listening at $prefix"
  Write-Host "Serving root: $Root"
} catch {
  Write-Error "Failed to start listener on $prefix. Try running PowerShell as Administrator or use a different port. $_"
  exit 1
}

function Get-ContentType($path) {
  switch -Regex ([IO.Path]::GetExtension($path).ToLower()) {
    '\\.html?$' { 'text/html; charset=utf-8'; break }
    '\\.css$'   { 'text/css; charset=utf-8'; break }
    '\\.js$'    { 'application/javascript; charset=utf-8'; break }
    '\\.json$'  { 'application/json; charset=utf-8'; break }
    '\\.png$'   { 'image/png'; break }
    '\\.jpe?g$' { 'image/jpeg'; break }
    '\\.gif$'   { 'image/gif'; break }
    '\\.svg$'   { 'image/svg+xml'; break }
    '\\.ico$'   { 'image/x-icon'; break }
    '\\.txt$'   { 'text/plain; charset=utf-8'; break }
    default      { 'application/octet-stream' }
  }
}

function Send-File($ctx, $filePath) {
  try {
    $bytes = [IO.File]::ReadAllBytes($filePath)
    $ctx.Response.ContentType = Get-ContentType $filePath
    $ctx.Response.StatusCode = 200
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.Headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    $ctx.Response.Headers['Pragma'] = 'no-cache'
    $ctx.Response.Headers['Expires'] = '0'
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } finally {
    $ctx.Response.OutputStream.Close()
  }
}

function Send-NotFound($ctx) {
  $msg = "Not Found"
  $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
  $ctx.Response.StatusCode = 404
  $ctx.Response.ContentType = 'text/plain; charset=utf-8'
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.OutputStream.Close()
}

function UrlDecode([string]$s) {
  return [System.Web.HttpUtility]::UrlDecode($s)
}

Write-Host "Open http://$Bind:$Port/teleprompter_pro.html in your browser"

# Main loop
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
  } catch {
    break
  }
  Start-Job -ScriptBlock {
    param($ctx, $Root)
    try {
      $urlPath = $ctx.Request.Url.AbsolutePath
      if ([string]::IsNullOrEmpty($urlPath)) { $urlPath = '/' }
      $rel = UrlDecode($urlPath.TrimStart('/'))
      if ($rel -eq '') { $rel = 'teleprompter_pro.html' }
      $file = Join-Path -Path $Root -ChildPath $rel
      if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        # Try default file extension handling for directories
        if (Test-Path -LiteralPath (Join-Path $file 'index.html')) {
          $file = Join-Path $file 'index.html'
        } elseif (Test-Path -LiteralPath (Join-Path $file 'teleprompter_pro.html')) {
          $file = Join-Path $file 'teleprompter_pro.html'
        }
      }
      if (Test-Path -LiteralPath $file -PathType Leaf) {
        Send-File -ctx $ctx -filePath $file
      } else {
        Send-NotFound -ctx $ctx
      }
    } catch {
      try {
        $ctx.Response.StatusCode = 500
        $msg = "Server error: $($_.Exception.Message)"
        $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        $ctx.Response.OutputStream.Close()
      } catch {}
    }
  } -ArgumentList $ctx, $Root | Out-Null
}

$listener.Stop()
