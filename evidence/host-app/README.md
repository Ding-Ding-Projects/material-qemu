Windows host app, Squirrel.Windows installer built locally on 2026-11-21 (material-qemu-host-0.1.0-setup.exe).

1. The first build installed into %LOCALAPPDATA%\material-qemu-host (Update.exe, app-0.1.0, packages) with a desktop shortcut, and the app window opened. Its web service stopped with ERR_MODULE_NOT_FOUND, which the window reported (first-build-failure.png): electron-builder had left node_modules out of the bundled service.
2. After including the service's node_modules, the app was uninstalled with Update.exe --uninstall (shortcut removed) and the new build installed. The window showed Running, the LAN address http://192.168.50.183:8091/ (port 8090 was taken by another host, so it moved to 8091 and logged why), QEMU installed and the data folder (running.png). /health answered 200 after 9 seconds and /api/session reported setupRequired true.
3. The test copy was then closed and uninstalled; the address stopped answering and the shortcut was removed.

build-installer.bat produced the same installer end to end with exit code 0.
