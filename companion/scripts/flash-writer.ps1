<#
  Writes a gzip-compressed raw disk image to one removable disk, then reads the
  disk back and compares its SHA-256 with the expected image hash.

  Run elevated for a real disk. -TargetFile writes to an ordinary file instead
  (used by tests; needs no elevation). Progress and the result are written as
  JSON to -StatusPath.
#>
param(
  [Parameter(Mandatory)] [string] $ImagePath,
  [Parameter(Mandatory)] [string] $ExpectedSha256,
  [Parameter(Mandatory)] [long] $ExpectedBytes,
  [Parameter(Mandatory)] [string] $StatusPath,
  [int] $DiskNumber = -1,
  [string] $DiskFriendlyName = '',
  [long] $DiskSize = 0,
  [string] $TargetFile = ''
)
$ErrorActionPreference = 'Stop'
$chunk = 4MB

function Write-Status($phase, $done, $total, $extra = @{}) {
  $o = [ordered]@{ phase = $phase; done = $done; total = $total; at = [DateTime]::UtcNow.ToString('o') }
  foreach ($k in $extra.Keys) { $o[$k] = $extra[$k] }
  $tmp = "$StatusPath.tmp"
  [System.IO.File]::WriteAllText($tmp, ($o | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $tmp -Destination $StatusPath -Force
}

$disk = $null
try {
  if ($ExpectedSha256 -notmatch '^[0-9a-f]{64}$') { throw 'The expected image hash is not a SHA-256 value.' }
  if ($ExpectedBytes -le 0 -or ($ExpectedBytes % 512) -ne 0) { throw 'The image size is not a whole number of 512-byte sectors.' }
  if (-not (Test-Path -LiteralPath $ImagePath)) { throw "The image file was not found: $ImagePath" }

  if ($TargetFile) {
    $targetPath = $TargetFile
  } else {
    if ($DiskNumber -lt 0) { throw 'No disk was chosen.' }
    $disk = Get-Disk -Number $DiskNumber
    # Re-check everything the app checked: the disk could have changed since it was listed.
    if ($disk.IsBoot -or $disk.IsSystem) { throw "Disk $DiskNumber holds the running system. Nothing was written." }
    if ($disk.BusType -notin @('USB', 'SD', 'MMC')) { throw "Disk $DiskNumber is not a removable USB or SD disk ($($disk.BusType)). Nothing was written." }
    if ($disk.FriendlyName -ne $DiskFriendlyName -or [long]$disk.Size -ne $DiskSize) { throw "Disk $DiskNumber is no longer the disk you chose. Nothing was written." }
    if ([long]$disk.Size -lt $ExpectedBytes) { throw "Disk $DiskNumber is smaller than the image. Nothing was written." }
    Write-Status 'preparing' 0 $ExpectedBytes
    if ($disk.IsReadOnly) { Set-Disk -Number $DiskNumber -IsReadOnly $false }
    if (-not $disk.IsOffline) { Set-Disk -Number $DiskNumber -IsOffline $true }
    $targetPath = "\\.\PhysicalDrive$DiskNumber"
  }

  $sha = [System.Security.Cryptography.SHA256]::Create()
  $in = [System.IO.File]::OpenRead($ImagePath)
  $gz = New-Object System.IO.Compression.GZipStream($in, [System.IO.Compression.CompressionMode]::Decompress)
  $mode = if ($TargetFile) { [System.IO.FileMode]::Create } else { [System.IO.FileMode]::Open }
  $out = New-Object System.IO.FileStream($targetPath, $mode, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite, $chunk, [System.IO.FileOptions]::WriteThrough)
  $buf = New-Object byte[] $chunk
  $done = 0L
  try {
    while ($true) {
      $filled = 0
      while ($filled -lt $chunk) {
        $n = $gz.Read($buf, $filled, $chunk - $filled)
        if ($n -le 0) { break }
        $filled += $n
      }
      if ($filled -eq 0) { break }
      if ($done + $filled -gt $ExpectedBytes) { throw 'The image is larger than its published size. Writing stopped.' }
      $sha.TransformBlock($buf, 0, $filled, $null, 0) | Out-Null
      $out.Write($buf, 0, $filled)
      $done += $filled
      Write-Status 'writing' $done $ExpectedBytes
      if ($filled -lt $chunk) { break }
    }
    $out.Flush()
  } finally { $out.Dispose(); $gz.Dispose(); $in.Dispose() }
  $sha.TransformFinalBlock(@(), 0, 0) | Out-Null
  $written = -join ($sha.Hash | ForEach-Object { $_.ToString('x2') })
  if ($done -ne $ExpectedBytes) { throw "Only $done of $ExpectedBytes bytes were in the image." }
  if ($written -ne $ExpectedSha256) { throw "The decompressed image hash ($written) does not match the release ($ExpectedSha256)." }

  # Read back exactly the written range from the target.
  $verify = [System.Security.Cryptography.SHA256]::Create()
  $rd = New-Object System.IO.FileStream($targetPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite, $chunk)
  $left = $ExpectedBytes; $checked = 0L
  try {
    while ($left -gt 0) {
      $want = [int][Math]::Min([long]$chunk, $left)
      $n = $rd.Read($buf, 0, $want)
      if ($n -le 0) { throw 'The disk ended before the written range could be read back.' }
      $verify.TransformBlock($buf, 0, $n, $null, 0) | Out-Null
      $left -= $n; $checked += $n
      Write-Status 'verifying' $checked $ExpectedBytes
    }
  } finally { $rd.Dispose() }
  $verify.TransformFinalBlock(@(), 0, 0) | Out-Null
  $readBack = -join ($verify.Hash | ForEach-Object { $_.ToString('x2') })
  if ($readBack -ne $ExpectedSha256) { throw "Read-back verification failed: the disk holds $readBack, expected $ExpectedSha256." }

  if ($disk) { Set-Disk -Number $DiskNumber -IsOffline $false }
  Write-Status 'done' $ExpectedBytes $ExpectedBytes @{ ok = $true; sha256 = $readBack }
  exit 0
} catch {
  try { if ($disk) { Set-Disk -Number $DiskNumber -IsOffline $false } } catch {}
  Write-Status 'failed' 0 $ExpectedBytes @{ ok = $false; message = $_.Exception.Message }
  exit 1
}
