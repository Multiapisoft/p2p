@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo  P2P Platform — starting all dev servers
echo  ========================================
echo    Backend      http://localhost:9091
echo    Admin        http://localhost:5177
echo    Business     http://localhost:5180
echo    User         http://localhost:4761
echo    Investor     http://localhost:7194
echo.

where pnpm >nul 2>&1
if errorlevel 1 (
  echo ERROR: pnpm not found. Install pnpm first: npm install -g pnpm
  pause
  exit /b 1
)

start "P2P Backend" cmd /k "cd /d %~dp0backend && pnpm start:dev"
timeout /t 4 /nobreak >nul

start "P2P Admin" cmd /k "cd /d %~dp0admin && pnpm dev"
start "P2P Business" cmd /k "cd /d %~dp0bussness && pnpm dev"
start "P2P User" cmd /k "cd /d %~dp0user && pnpm dev"
start "P2P Investor" cmd /k "cd /d %~dp0investor && pnpm dev"

echo.
echo  All services launched in separate windows.
echo  Close each window to stop that service.
echo.
pause
