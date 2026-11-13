param([switch]$Run, [switch]$Silent, [switch]$Container)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) { throw 'Node.js is missing. Automatic Chocolatey acquisition needs native administrator consent. Run this build interactively from an elevated shell; no consent is automated.' }
    if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
        $installer = Invoke-WebRequest -UseBasicParsing 'https://community.chocolatey.org/install.ps1'
        & ([scriptblock]::Create($installer.Content))
    }
    choco install nodejs-lts --version=24.22.1 -y --no-progress
    if ($LASTEXITCODE -ne 0) { throw 'Chocolatey could not install Node.js 24.22.1.' }
    $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}
node --version
if ($LASTEXITCODE -ne 0) { throw 'Node.js verification failed.' }
npm ci --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Runtime build failed.' }
if ($Container) {
    docker build -t material-qemu:0.1.0 .
    if ($LASTEXITCODE -ne 0) { throw 'Container build failed.' }
}
if ($Run) { npm start; exit $LASTEXITCODE }
