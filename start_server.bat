@echo off
cd /d "%~dp0"
echo Working dir: %CD%
if exist teleprompter_pro.html (
  echo Found: %CD%\teleprompter_pro.html
) else (
  echo ERROR: teleprompter_pro.html not found in %CD%
  pause
  exit /b 1
)
where npx >nul 2>nul && (
  npx http-server -a 127.0.0.1 -p 5180 -c-1
  goto :eof
)
if exist "%ProgramFiles%\nodejs\npx.cmd" (
  "%ProgramFiles%\nodejs\npx.cmd" http-server -a 127.0.0.1 -p 5180 -c-1
  goto :eof
)
if exist "%ProgramFiles(x86)%\nodejs\npx.cmd" (
  "%ProgramFiles(x86)%\nodejs\npx.cmd" http-server -a 127.0.0.1 -p 5180 -c-1
  goto :eof
)
echo Could not find Node npx. Install Node.js or use Python:
echo   py -3 -m http.server 5180 --bind 127.0.0.1
pause
