@echo off
setlocal enableextensions
rem Resolve script directory and serve that explicitly regardless of current dir
set "ROOT=%~dp0"
cd /d "%ROOT%"
echo Working dir: %CD%
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
  "%ROOT%node_modules\.bin\http-server.cmd" "%ROOT%" -a 127.0.0.1 -p 5180 -c-1
  goto :eof
)

rem Use npx if available
where npx >nul 2>nul && (
  npx http-server "%ROOT%" -a 127.0.0.1 -p 5180 -c-1
  goto :eof
)
if exist "%ProgramFiles%\nodejs\npx.cmd" (
  "%ProgramFiles%\nodejs\npx.cmd" http-server "%ROOT%" -a 127.0.0.1 -p 5180 -c-1
  goto :eof
)
if exist "%ProgramFiles(x86)%\nodejs\npx.cmd" (
  "%ProgramFiles(x86)%\nodejs\npx.cmd" http-server "%ROOT%" -a 127.0.0.1 -p 5180 -c-1
  goto :eof
)

rem Fallback: use Python 3 http.server with explicit directory
where py >nul 2>nul && (
  py -3 -m http.server 5180 --bind 127.0.0.1 --directory "%ROOT%"
  goto :eof
)
where python >nul 2>nul && (
  python -m http.server 5180 --bind 127.0.0.1 --directory "%ROOT%"
  goto :eof
)

echo Could not find Node npx or Python. Please install Node.js or Python 3.
pause
endlocal
