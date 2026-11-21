@echo off
setlocal
cd /d "%~dp0"
rem Builds the Windows host app installer (Squirrel.Windows) into host-app\dist\squirrel-windows.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-installer.ps1" %*
exit /b %errorlevel%
