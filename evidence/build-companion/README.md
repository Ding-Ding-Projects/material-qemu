Portable build companion material-qemu-build-0.1.0-portable.exe, carrying the source of commit fd4f67f, run on a hidden desktop on Windows 11 on 2026-11-21 and driven through its window:

- Build: unpacked the source to Documents\Material QEMU Buildd4f67fd154b, ran build.bat, "Runnable runtime staged in dist. Source: fd4f67f... Uncommitted source: false", exit code 0 after 4 s (build.png).
- Build installer: ran build-installer.bat, produced host-app\dist\squirrel-windows\material-qemu-host-0.1.0-setup.exe (167 MB) with RELEASES and the nupkg, exit code 0 after 88 s (build-installer.png).
- Build and run: the web service reported ready, Stop ended it after 7 s.

Earlier attempts found two problems, both fixed: Windows on this computer does not run programs from the current folder by name, so the scripts are called by full path; and the build script needed a git checkout to record its source, so it now accepts SOURCE_REVISION, which the companion passes.
