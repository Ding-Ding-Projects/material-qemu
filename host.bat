@echo off
setlocal
cd /d "%~dp0"
docker compose version >nul 2>&1
if errorlevel 1 (
  echo Docker Compose is unavailable. Hosting is incomplete.
  exit /b 2
)
docker compose up -d --wait
if errorlevel 1 exit /b %errorlevel%
echo Local endpoint: http://localhost:8080/
echo This default deployment is loopback-only. LAN delivery is not configured or verified.
if "%~1"=="--logs" docker compose logs -f
exit /b %errorlevel%
