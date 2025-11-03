@echo off
setlocal enableextensions
rem Resolve script directory and serve that explicitly regardless of current dir
set "ROOT=%~dp0"
cd /d "%ROOT%"
echo Working dir: %CD%
echo Script: %~f0
echo Modified: %~t0
if exist teleprompter_pro.html (
  echo Found: %CD%\teleprompter_pro.html
) else (
  echo ERROR: teleprompter_pro.html not found in %CD%
  pause
  exit /b 1
)
echo Serving root: %ROOT%
echo URL: http://127.0.0.1:5180/

rem Prefer local http-server if installed
if exist "%ROOT%node_modules\.bin\http-server.cmd" (
  rem Note: use "." instead of "%ROOT%" to avoid trailing backslash escaping the closing quote
  "%ROOT%node_modules\.bin\http-server.cmd" . -a 127.0.0.1 -p 5180 -c-1
  goto :eof
)

rem Use npx if available
where npx >nul 2>nul && (
  npx http-server . -a 127.0.0.1 -p 5180 -c-1
  goto :eof
)
if exist "%ProgramFiles%\nodejs\npx.cmd" (
  "%ProgramFiles%\nodejs\npx.cmd" http-server . -a 127.0.0.1 -p 5180 -c-1
  goto :eof
)
if exist "%ProgramFiles(x86)%\nodejs\npx.cmd" (
  "%ProgramFiles(x86)%\nodejs\npx.cmd" http-server . -a 127.0.0.1 -p 5180 -c-1
  goto :eof
)

rem Fallback: use Python 3 http.server with explicit directory
where py >nul 2>nul && (
  py -3 -m http.server 5180 --bind 127.0.0.1 --directory .
  goto :eof
)
where python >nul 2>nul && (
  python -m http.server 5180 --bind 127.0.0.1 --directory .
  goto :eof
)

rem Final fallback: built-in PowerShell static server (no installs needed)
if exist "%ROOT%ps_static_server.ps1" (
  echo Falling back to PowerShell static server on http://127.0.0.1:5180/
  powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ROOT%ps_static_server.ps1" -Port 5180 -Bind 127.0.0.1 -Root .
  goto :eof
)

echo Could not find Node npx, Python, or PowerShell server script. Please install Node.js, Python 3, or add ps_static_server.ps1.
pause
endlocal
