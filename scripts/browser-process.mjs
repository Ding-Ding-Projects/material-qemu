// Helpers for the headless browser checks. Edge on Windows relaunches itself,
// so the browser that holds the debugging port is not a child of the process
// the check started; stopping that process leaves the browser running and a
// later check could quietly attach to it and its old storage. stopBrowser ends
// every Edge process started with this check's own profile folder, and
// ensurePortFree refuses to start while something already listens on the port.
import { spawnSync } from "node:child_process";
import net from "node:net";

function profileOf(child) {
  const arg = (child?.spawnargs || []).find((a) => String(a).startsWith("--user-data-dir="));
  return arg ? String(arg).slice("--user-data-dir=".length) : "";
}

export function stopBrowser(child) {
  if (!child) return;
  const profile = profileOf(child);
  if (process.platform === "win32" && profile) {
    // Match on the unique profile folder only, so no other Edge window is touched.
    const script = `$p = $env:MQ_PROFILE; Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($p) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: "ignore", env: { ...process.env, MQ_PROFILE: profile } });
  }
  try { child.kill("SIGKILL"); } catch { /* already gone */ }
}

export function ensurePortFree(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error(`Port ${port} is already in use, probably by a browser left from an earlier check. Stop it and run again.`));
    });
    socket.once("error", () => resolve());
  });
}
