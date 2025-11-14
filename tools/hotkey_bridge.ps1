# Hotkey Bridge — simple local HTTP listener to trigger system hotkeys on Windows
# Default paths align with the Bridge adapter config (http://127.0.0.1:5723/record/start)
# Endpoints:
#   GET /record/start    → send configured Start hotkey
#   GET /record/stop     → send configured Stop hotkey (optional)
#   GET /send?keys=...   → send a specific hotkey combo (e.g., Ctrl+R or Win+Alt+R)
#
# Usage:
#   powershell.exe -ExecutionPolicy Bypass -File tools/hotkey_bridge.ps1
#
# Notes:
# - If you need the Windows key (e.g., Win+Alt+R for Xbox Game Bar), this script uses user32 keybd_event.
# - For simple Ctrl/Alt/Shift combos, WScript.Shell.SendKeys is used.

param(
  [string]$Prefix = 'http://127.0.0.1:5723/',
  [string]$StartHotkey = 'Ctrl+R',    # default aligns with winmedia/descript defaults
  [string]$StopHotkey = 'Ctrl+R'      # toggle by default
)

Write-Host "[hotkey_bridge] Starting on $Prefix (Start=$StartHotkey, Stop=$StopHotkey)" -ForegroundColor Cyan

# Prepare HttpListener
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($Prefix)
try { $listener.Start() } catch {
  Write-Error "Failed to start HttpListener on $Prefix. Try running as Administrator or use 'http://localhost:5723/'."
  exit 1
}

# Low-level Win key + combos via user32
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class KB {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, IntPtr dwExtraInfo);
  public const uint KEYEVENTF_KEYUP = 0x0002;
  public const byte VK_LWIN = 0x5B;
  public const byte VK_MENU = 0x12; // Alt
  public const byte VK_CONTROL = 0x11; // Ctrl
  public const byte VK_SHIFT = 0x10; // Shift
  public static byte VkFromChar(char c) { return (byte)Char.ToUpperInvariant(c); }
}
"@

function Get-QueryParameters([string]$query) {
  $map = @{}
  if ([string]::IsNullOrEmpty($query)) { return $map }
  if ($query.StartsWith('?')) { $query = $query.Substring(1) }
  foreach ($pair in $query -split '&') {
    if ([string]::IsNullOrEmpty($pair)) { continue }
    $kv = $pair -split '=', 2
    $k = [System.Uri]::UnescapeDataString($kv[0])
    $v = if ($kv.Count -ge 2) { [System.Uri]::UnescapeDataString($kv[1]) } else { '' }
    $map[$k] = $v
  }
  return $map
}

function Send-ComboWinAltR {
  [KB]::keybd_event([KB]::VK_LWIN, 0, 0, [IntPtr]::Zero)
  [KB]::keybd_event([KB]::VK_MENU, 0, 0, [IntPtr]::Zero)
  [KB]::keybd_event([byte][char]'R', 0, 0, [IntPtr]::Zero)
  Start-Sleep -Milliseconds 50
  [KB]::keybd_event([byte][char]'R', 0, [KB]::KEYEVENTF_KEYUP, [IntPtr]::Zero)
  [KB]::keybd_event([KB]::VK_MENU, 0, [KB]::KEYEVENTF_KEYUP, [IntPtr]::Zero)
  [KB]::keybd_event([KB]::VK_LWIN, 0, [KB]::KEYEVENTF_KEYUP, [IntPtr]::Zero)
}

function Send-ComboGeneric([string]$combo) {
  # Use WScript.Shell for Ctrl/Alt/Shift when no Win key is involved
  $shell = New-Object -ComObject wscript.shell
  $map = @{ Ctrl = '^'; Alt = '%'; Shift = '+' }
  $seq = ''
  $parts = $combo -split '\s*\+\s*'
  $hasWin = $parts -contains 'Win'
  if ($hasWin) {
    # Route known Win combos
    if ($parts -contains 'Alt' -and ($parts -contains 'R' -or $parts -contains 'r')) { Send-ComboWinAltR; return }
    # Fallback: synthesize Win + letter
    [KB]::keybd_event([KB]::VK_LWIN, 0, 0, [IntPtr]::Zero)
    foreach ($p in $parts) {
      if ($p -eq 'Win') { continue }
      elseif ($p -eq 'Alt') { [KB]::keybd_event([KB]::VK_MENU, 0, 0, [IntPtr]::Zero) }
      elseif ($p -eq 'Ctrl') { [KB]::keybd_event([KB]::VK_CONTROL, 0, 0, [IntPtr]::Zero) }
      elseif ($p -eq 'Shift') { [KB]::keybd_event([KB]::VK_SHIFT, 0, 0, [IntPtr]::Zero) }
      else { [KB]::keybd_event([byte][char]$p, 0, 0, [IntPtr]::Zero) }
    }
    Start-Sleep -Milliseconds 50
    foreach ($p in [System.Linq.Enumerable]::Reverse($parts)) {
      if ($p -eq 'Win') { [KB]::keybd_event([KB]::VK_LWIN, 0, [KB]::KEYEVENTF_KEYUP, [IntPtr]::Zero) }
      elseif ($p -eq 'Alt') { [KB]::keybd_event([KB]::VK_MENU, 0, [KB]::KEYEVENTF_KEYUP, [IntPtr]::Zero) }
      elseif ($p -eq 'Ctrl') { [KB]::keybd_event([KB]::VK_CONTROL, 0, [KB]::KEYEVENTF_KEYUP, [IntPtr]::Zero) }
      elseif ($p -eq 'Shift') { [KB]::keybd_event([KB]::VK_SHIFT, 0, [KB]::KEYEVENTF_KEYUP, [IntPtr]::Zero) }
      else { [KB]::keybd_event([byte][char]$p, 0, [KB]::KEYEVENTF_KEYUP, [IntPtr]::Zero) }
    }
    return
  }
  foreach ($p in $parts) {
    if ($map.ContainsKey($p)) { $seq += $map[$p] }
    else { $seq += $p }
  }
  $shell.SendKeys($seq)
}

function Send-Hotkey([string]$combo) {
  try { Send-ComboGeneric $combo } catch { Write-Warning ("Failed to send {0}: {1}" -f $combo, $_) }
}

while ($true) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $path = $ctx.Request.Url.AbsolutePath
    $q = Get-QueryParameters $ctx.Request.Url.Query
    if ($path -eq '/record/start') {
      Send-Hotkey $StartHotkey
      $out = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true,"action":"start"}')
      $res.ContentType = 'application/json'
      $res.OutputStream.Write($out, 0, $out.Length)
    }
    elseif ($path -eq '/record/stop') {
      Send-Hotkey $StopHotkey
      $out = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true,"action":"stop"}')
      $res.ContentType = 'application/json'
      $res.OutputStream.Write($out, 0, $out.Length)
    }
    elseif ($path -eq '/send') {
      $keys = $q['keys']
      if ([string]::IsNullOrWhiteSpace($keys)) { $keys = $StartHotkey }
      Send-Hotkey $keys
      $out = [System.Text.Encoding]::UTF8.GetBytes(("{`"ok`":true,`"sent`":`"$keys`"}"))
      $res.ContentType = 'application/json'
      $res.OutputStream.Write($out, 0, $out.Length)
    }
    else {
      $res.StatusCode = 404
      $out = [System.Text.Encoding]::UTF8.GetBytes('{"ok":false,"error":"not found"}')
      $res.ContentType = 'application/json'
      $res.OutputStream.Write($out, 0, $out.Length)
    }
  }
  catch {
    $res.StatusCode = 500
    $out = [System.Text.Encoding]::UTF8.GetBytes(("{`"ok`":false,`"error`":`"$($_.Exception.Message)`"}"))
    $res.ContentType = 'application/json'
    $res.OutputStream.Write($out, 0, $out.Length)
  }
  finally {
    $res.Close()
  }
}
