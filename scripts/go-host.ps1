<#
  Run Material QEMU directly on this Windows computer for testing: Node.js plus
  QEMU for Windows, no container and no virtual machine.

  go-host.bat            build, start, wait for health, print the LAN link
  go-host.bat --status   show whether the test host is running and healthy
  go-host.bat --stop     stop the test host and the QEMU guests it started

  Options: --port <n> (default 8090), --ip <LAN IPv4> (default: the address of
  the default route). Test data lives in Documents\Material QEMU VMs\go-test,
  separate from every other deployment, and is kept between runs.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$argv = @($args | ForEach-Object { "$_" })
function Get-Opt($name, $default) { $i = [Array]::IndexOf($argv, $name); if ($i -ge 0 -and $i + 1 -lt $argv.Count) { return $argv[$i + 1] } return $default }
# When started by double-click (Explorer > cmd > powershell), wait before the
# window closes so the link or the error stays readable.
function Test-DoubleClicked {
  try {
    $me = Get-CimInstance Win32_Process -Filter "ProcessId=$PID"
    $cmd = Get-CimInstance Win32_Process -Filter "ProcessId=$($me.ParentProcessId)"
    $top = Get-CimInstance Win32_Process -Filter "ProcessId=$($cmd.ParentProcessId)"
    return $cmd.Name -eq 'cmd.exe' -and $top.Name -eq 'explorer.exe'
  } catch { return $false }
}
function Exit-Host([int]$code) { if (Test-DoubleClicked) { Read-Host 'Press Enter to close' | Out-Null }; exit $code }
trap { Write-Host "Error: $($_.Exception.Message)"; Exit-Host 1 }
$mode = if ($argv -contains '--stop') { 'stop' } elseif ($argv -contains '--status') { 'status' } else { 'start' }
$port = [int](Get-Opt '--port' 8090)
if ($port -lt 1024 -or $port -gt 65535) { throw 'The port must be from 1024 to 65535.' }
# Documents, not AppData: processes started outside a packaged (MSIX) parent
# cannot see AppData files that the packaged parent wrote.
$dataDir = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Material QEMU VMs\go-test'
$stateFile = Join-Path $dataDir 'go-host.json'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

function Read-State { if (Test-Path $stateFile) { Get-Content $stateFile -Raw | ConvertFrom-Json } else { $null } }
function Test-Health($url) {
  try {
    $u = [Uri]$url
    $req = [Net.HttpWebRequest]::Create("$($u.Scheme)://$($u.Authority)/health"); $req.Timeout = 3000
    $resp = $req.GetResponse(); $ok = [int]$resp.StatusCode -eq 200; $resp.Close(); return $ok
  } catch { return $false }
}
function Get-OwnedNode($state) {
  if (-not $state) { return $null }
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($state.pid)" -ErrorAction SilentlyContinue
  if ($p -and $p.Name -eq 'node.exe' -and $p.CommandLine -like '*server*index.mjs*') { return $p }
  return $null
}

if ($mode -eq 'status') {
  $s = Read-State; $p = Get-OwnedNode $s
  if (-not $p) { Write-Host 'The test host is not running.'; Exit-Host 3 }
  $healthy = Test-Health $s.url
  Write-Host ("Running (process {0}) at {1} - {2}" -f $s.pid, $s.url, $(if ($healthy) { 'healthy' } else { 'not answering' }))
  Exit-Host $(if ($healthy) { 0 } else { 4 })
}

if ($mode -eq 'stop') {
  $s = Read-State; $p = Get-OwnedNode $s
  if (-not $p) { Write-Host 'The test host is not running. Nothing was stopped.'; Remove-Item $stateFile -ErrorAction SilentlyContinue; Exit-Host 0 }
  $guests = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $p.ProcessId -and $_.Name -like 'qemu-system-*' }
  foreach ($g in $guests) { Stop-Process -Id $g.ProcessId -Force; Write-Host "Stopped QEMU guest process $($g.ProcessId)." }
  Stop-Process -Id $p.ProcessId -Force
  Remove-Item $stateFile -ErrorAction SilentlyContinue
  Write-Host "Stopped the test host (process $($p.ProcessId)). Test data was kept in $dataDir."
  Exit-Host 0
}

# --- start ---
$existing = Get-OwnedNode (Read-State)
if ($existing) { $s = Read-State; Write-Host "Already running at $($s.url) (process $($s.pid)). Use --stop first to restart."; Exit-Host 0 }

# QEMU for Windows: install it with Chocolatey when it is missing.
function Find-Qemu {
  $cmd = Get-Command qemu-system-x86_64.exe -ErrorAction SilentlyContinue
  if ($cmd) { return Split-Path $cmd.Source -Parent }
  foreach ($d in @("$env:ProgramFiles\qemu", "${env:ProgramFiles(x86)}\qemu")) { if (Test-Path (Join-Path $d 'qemu-system-x86_64.exe')) { return $d } }
  return $null
}
$qemuDir = Find-Qemu
if (-not $qemuDir) {
  if (-not (Get-Command choco -ErrorAction SilentlyContinue)) { throw 'QEMU is missing and Chocolatey is not installed. Run build.bat once to install Chocolatey, then try again.' }
  Write-Host 'QEMU for Windows is missing. Windows will ask for administrator approval to install it with Chocolatey.'
  try {
    $child = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile', '-Command', 'choco install qemu -y --no-progress; exit $LASTEXITCODE'
  } catch { throw 'Administrator approval was declined. QEMU was not installed and the test host did not start.' }
  if ($child.ExitCode -ne 0) { throw "Chocolatey could not install QEMU (exit code $($child.ExitCode))." }
  $qemuDir = Find-Qemu
  if (-not $qemuDir) { throw 'QEMU was installed but qemu-system-x86_64.exe was not found.' }
}
& (Join-Path $qemuDir 'qemu-system-x86_64.exe') --version | Select-Object -First 1 | Write-Host

# Build the runtime exactly as build.bat does.
& (Join-Path $PSScriptRoot 'build.ps1') /s
if ($LASTEXITCODE -ne 0) { throw 'The runtime build failed.' }

# LAN address: the interface that carries the default route.
$ip = Get-Opt '--ip' $null
if (-not $ip) {
  $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1
  if ($route) { $ip = (Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1).IPAddress }
}
if (-not $ip -or $ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { throw 'No LAN IPv4 address was found. Pass one with --ip.' }
$busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($busy) { throw "Port $port is already in use. Pass another with --port." }

$url = "http://${ip}:$port/"
$logDir = Join-Path $dataDir 'logs'; New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$serverData = Join-Path $dataDir 'data'
$node = (Get-Command node).Source
# Start the server through WMI so it shares no handles with this script: a
# caller that captures this script's output must not wait for the server.
$runner = Join-Path $dataDir 'run-server.cmd'
@(
  '@echo off',
  "set ""PUBLIC_ORIGIN=http://${ip}:$port""",
  'set "BIND_ADDRESS=0.0.0.0"',
  "set ""PORT=$port""",
  "set ""DATA_DIR=$serverData""",
  "set ""PATH=$qemuDir;%PATH%""",
  "cd /d ""$(Join-Path $root 'dist')""",
  """$node"" server/index.mjs > ""$(Join-Path $logDir 'server.out.log')"" 2> ""$(Join-Path $logDir 'server.err.log')"""
) | Set-Content -Encoding ascii $runner
$created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "cmd.exe /d /c ""$runner"""; ProcessStartupInformation = (New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }) }
if ($created.ReturnValue -ne 0) { throw "Windows could not start the server (Win32_Process.Create returned $($created.ReturnValue))." }
$nodeProc = $null
foreach ($i in 1..40) {
  $nodeProc = Get-CimInstance Win32_Process -Filter "ParentProcessId=$($created.ProcessId) AND Name='node.exe'"
  if ($nodeProc) { break }; Start-Sleep -Milliseconds 250
}
if (-not $nodeProc) { throw 'The server process did not start. See the logs in ' + $logDir }
@{ pid = $nodeProc.ProcessId; url = $url; port = $port; ip = $ip; qemu = $qemuDir; startedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -Encoding utf8 $stateFile

$healthy = $false
foreach ($i in 1..60) {
  if (-not (Get-Process -Id $nodeProc.ProcessId -ErrorAction SilentlyContinue)) { break }
  if (Test-Health $url) { $healthy = $true; break }; Start-Sleep -Milliseconds 500
}
if (-not $healthy) {
  Write-Host 'The test host did not become healthy. Last server errors:'
  Get-Content (Join-Path $logDir 'server.err.log') -Tail 20 -ErrorAction SilentlyContinue | Write-Host
  Stop-Process -Id $nodeProc.ProcessId -Force -ErrorAction SilentlyContinue
  Remove-Item $stateFile -ErrorAction SilentlyContinue
  Exit-Host 1
}
$env:DATA_DIR = $serverData
Write-Host ''
Write-Host "Material QEMU test host is running: $url"
Write-Host "Test data: $dataDir"
Write-Host 'Open the link and create the first account: the first account becomes the owner.'
Write-Host 'Windows may ask whether Node.js can accept connections on your network; allow it on private networks for other devices to connect.'
Write-Host 'Stop it with: go-host.bat --stop'
Exit-Host 0
