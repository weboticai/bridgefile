@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Instale o Node.js para abrir o Ponte.
  pause
  exit /b 1
)
node server.js
pause
