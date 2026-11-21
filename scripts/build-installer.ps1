<#
  Builds the Windows host app installer (Squirrel.Windows) on this computer:
  host-app\dist\squirrel-windows\material-qemu-host-<version>-setup.exe

  Node.js is installed with Chocolatey when it is missing (Windows asks for
  approval; declining stops the build without changing anything else).
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

function Find-Npm {
  $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $default = Join-Path $env:ProgramFiles 'nodejs\npm.cmd'
  if (Test-Path $default) { return $default }
  return $null
}

$npm = Find-Npm
if (-not $npm) {
  Write-Host 'Node.js was not found. Installing Node.js LTS with Chocolatey (Windows will ask for approval)...'
  $install = "if (-not (Get-Command choco -ErrorAction SilentlyContinue)) { Set-ExecutionPolicy Bypass -Scope Process -Force; [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1')) }; choco install nodejs-lts -y --no-progress"
  $p = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList @('-NoProfile', '-Command', $install)
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  $npm = Find-Npm
  if ($p.ExitCode -ne 0 -or -not $npm) { Write-Host 'Node.js could not be installed, so the installer was not built.'; exit 3 }
}
Write-Host "Using $(& (Join-Path (Split-Path $npm) 'node.exe') --version) and npm $(& $npm --version)."

Push-Location $root
try {
  & $npm ci --no-audit --no-fund --ignore-scripts
  if ($LASTEXITCODE) { throw 'Installing the web service packages failed.' }
  Set-Location host-app
  & $npm ci --no-audit --no-fund
  if ($LASTEXITCODE) { throw 'Installing the host app build tools failed.' }
  & $npm run dist
  if ($LASTEXITCODE) { throw 'Building the installer failed.' }
  $exe = Get-ChildItem 'dist\squirrel-windows' -Filter '*-setup.exe' | Select-Object -First 1
  if (-not $exe) { throw 'The installer was not produced.' }
  $hash = (Get-FileHash $exe.FullName -Algorithm SHA256).Hash.ToLower()
  Write-Host ''
  Write-Host "Installer: $($exe.FullName)"
  Write-Host "SHA-256:   $hash"
  Write-Host 'Run it to install Material QEMU Host for this Windows user; it starts the web service and shows the address to open.'
} finally {
  Pop-Location
}
