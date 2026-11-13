$ErrorActionPreference = 'Stop'
$options = @($args | ForEach-Object { $_.ToString().ToLowerInvariant() })
$Silent = ($options -contains '/s') -or ($options -contains '--silent') -or ($options -contains '-silent') -or ($env:SILENT -eq '1')
$Run = ($options -contains '/run') -or ($options -contains '--run') -or ($options -contains '-run') -or ($env:RUN_AFTER_BUILD -eq '1')
$Container = ($options -contains '--container') -or ($options -contains '-container')
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        if ($Silent) { throw 'Node.js is missing. Silent mode cannot request native elevation consent. Build is incomplete.' }
        $forward = @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $PSCommandPath + '"')) + $args
        $child = Start-Process powershell -Verb RunAs -ArgumentList $forward -Wait -PassThru
        exit $child.ExitCode
    }
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
$verifiedVersion = & node -p 'process.versions.node'
if (([version]$verifiedVersion).Major -lt 22) { throw 'Node.js >=22 is required. The existing older installation was preserved.' }
npm ci --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Runtime build failed.' }
if ($Container) {
    $source = git rev-parse HEAD
    $buildDate = [DateTime]::UtcNow.ToString('o')
    $imageTag = if ($env:BUILD_IMAGE_TAG) { $env:BUILD_IMAGE_TAG } else { 'material-qemu:0.1.0' }
    if ($imageTag -notmatch '^[a-z0-9][a-z0-9._/:@-]{0,180}$') { throw 'BUILD_IMAGE_TAG contains unsupported characters.' }
    docker build --build-arg "BUILD_DATE=$buildDate" --build-arg "SOURCE_REVISION=$source" -t $imageTag .
    if ($LASTEXITCODE -ne 0) { throw 'Container build failed.' }
}
if ($Run) { Push-Location dist; try { node server/index.mjs; exit $LASTEXITCODE } finally { Pop-Location } }
