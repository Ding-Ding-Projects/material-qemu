@echo off
rem One-click test host: installs QEMU for Windows if missing, builds the
rem runtime, starts Material QEMU on this computer and prints its LAN link.
rem   go-host.bat            build and start
rem   go-host.bat --status   show whether it is running
rem   go-host.bat --stop     stop it (test data is kept)
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\go-host.ps1" %*
rem The script itself waits for Enter when it was started by double-click.
exit /b %errorlevel%
