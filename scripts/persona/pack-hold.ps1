# Pause a running pack BETWEEN its steps without killing anything (Rivet, 07/11, Keel: "do not start a heavy step while the real TEAM-10 round runs").
#
# package-target.ts runs its steps one after the other inside ONE process tree, so there is no seam to stop at. This watcher waits for a line of the pack
# log (e.g. the start of prepare-dsh.ts), then SUSPENDS every descendant of the package-clean process (NtSuspendProcess: no CPU, nothing killed, nothing
# lost) and resumes them when the release file appears, or when the safety cap runs out. The package-clean node process itself keeps running on purpose:
# its stall guard kills a pack that prints nothing for 20 min, so a hold must stay well under that (default cap 17 min).
#
# Ownership: only descendants (parent chain, child born after parent) of the package-clean node that carries `-Commit` on its command line are touched,
# remembered with their creation date, and resumed only if it still matches (a recycled pid is never signalled). A process listing that fails is an error.
#
#   powershell -NoProfile -File scripts/persona/pack-hold.ps1 -Log C:\p8c\pc-8fcb767034.out -Commit 8fcb76703451 -HoldAt 'tsx scripts/prepare-dsh\.ts'
#   release early:  New-Item C:\p8c\pack-hold.release
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Log,
  [Parameter(Mandatory)][string]$Commit,
  [Parameter(Mandatory)][string]$HoldAt,
  [string]$ReleaseFile = 'C:\p8c\pack-hold.release',
  [string]$StatusFile = 'C:\p8c\pack-hold.json',
  [int]$MaxHoldMin = 17,
  [int]$MaxWaitMin = 120
)
$ErrorActionPreference = 'Stop'
if (-not ('PackHold.Native' -as [type])) {
  Add-Type -Name Native -Namespace PackHold -MemberDefinition @'
[DllImport("ntdll.dll")] public static extern int NtSuspendProcess(IntPtr handle);
[DllImport("ntdll.dll")] public static extern int NtResumeProcess(IntPtr handle);
'@
}
function Write-Status($state, $extra = @{}) {
  $row = [ordered]@{ state = $state; at = (Get-Date).ToString('o') }
  foreach ($key in $extra.Keys) { $row[$key] = $extra[$key] }
  ($row | ConvertTo-Json -Compress -Depth 4) | Set-Content -Path $StatusFile -Encoding utf8
}
function Get-Listing {
  $rows = @(Get-CimInstance Win32_Process)
  if ($rows.Count -lt 20) { throw "implausibly short process listing ($($rows.Count) rows): not trusting it" }
  return $rows
}
function Find-InnerPackClean($rows) {
  $mine = @($rows | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*package-clean.mjs*' -and $_.CommandLine -like "*$Commit*" })
  $ids = @($mine | ForEach-Object { [int]$_.ProcessId })
  # the inner one is the package-clean node whose PARENT is also a package-clean node (the with-lock wrapper); without a wrapper, the only one
  $inner = @($mine | Where-Object { $ids -contains [int]$_.ParentProcessId })
  if ($inner.Count -eq 1) { return $inner[0] }
  if ($mine.Count -eq 1) { return $mine[0] }
  return $null
}
function Get-Descendants($rows, $root) {
  # a plain hashtable: an [ordered] dictionary reads an int key as a POSITION (ArgumentOutOfRangeException 'index'), which broke the first self-test
  $found = @{}
  $queue = [System.Collections.Generic.Queue[object]]::new()
  $queue.Enqueue($root)
  while ($queue.Count -gt 0) {
    $parent = $queue.Dequeue()
    foreach ($child in $rows) {
      if ([int]$child.ParentProcessId -ne [int]$parent.ProcessId) { continue }
      if ($child.CreationDate -lt $parent.CreationDate) { continue }   # a recycled parent pid adopts nobody
      if ($found.ContainsKey([int]$child.ProcessId)) { continue }
      $found[[int]$child.ProcessId] = $child
      $queue.Enqueue($child)
    }
  }
  return $found.Values
}

Write-Status 'waiting' @{ holdAt = $HoldAt; log = $Log }
$deadline = (Get-Date).AddMinutes($MaxWaitMin)
$seen = 0
while ($true) {
  if ((Get-Date) -gt $deadline) { Write-Status 'gave-up' @{ reason = "no line matched $HoldAt in $MaxWaitMin min" }; exit 3 }
  if (Test-Path $Log) {
    $lines = @(Get-Content -Path $Log -ErrorAction SilentlyContinue)
    if ($lines.Count -gt $seen) {
      $fresh = $lines[$seen..($lines.Count - 1)]
      $seen = $lines.Count
      if (@($fresh | Where-Object { $_ -match $HoldAt }).Count -gt 0) { break }
    }
    if (@($lines | Where-Object { $_ -match 'package-clean exit|pack exit' }).Count -gt 0) { Write-Status 'pack-ended-before-hold'; exit 0 }
  }
  Start-Sleep -Milliseconds 250
}

# HOLD: suspend every descendant until nothing new shows up (a step may spawn between two passes)
$suspended = @{}
$rows = Get-Listing
$root = Find-InnerPackClean $rows
if ($null -eq $root) { Write-Status 'error' @{ reason = 'could not identify the package-clean process' }; throw 'could not identify the package-clean process' }
$passes = 0
do {
  $new = 0
  foreach ($proc in (Get-Descendants $rows $root)) {
    $id = [int]$proc.ProcessId
    if ($suspended.ContainsKey($id)) { continue }
    try {
      $handle = [System.Diagnostics.Process]::GetProcessById($id)
      [void][PackHold.Native]::NtSuspendProcess($handle.Handle)
      $suspended[$id] = [pscustomobject]@{ Pid = $id; Name = $proc.Name; Created = $proc.CreationDate }
      $new++
    } catch { }   # it ended between the listing and the suspend: nothing to hold
  }
  $passes++
  Start-Sleep -Milliseconds 150
  $rows = Get-Listing
} while ($new -gt 0 -and $passes -lt 8)
$heldAt = Get-Date
Write-Status 'held' @{ root = [int]$root.ProcessId; count = $suspended.Count; names = (@($suspended.Values | ForEach-Object { "$($_.Pid):$($_.Name)" }) -join ' '); maxHoldMin = $MaxHoldMin; releaseFile = $ReleaseFile }

$reason = 'cap'
while (((Get-Date) - $heldAt).TotalMinutes -lt $MaxHoldMin) {
  if (Test-Path $ReleaseFile) { $reason = 'release-file'; break }
  Start-Sleep -Milliseconds 500
}

$rows = Get-Listing
$resumed = 0
foreach ($entry in $suspended.Values) {
  $live = $rows | Where-Object { [int]$_.ProcessId -eq $entry.Pid -and $_.CreationDate -eq $entry.Created }
  if ($null -eq $live) { continue }   # gone, or the pid was recycled: never signal a stranger
  try { [void][PackHold.Native]::NtResumeProcess([System.Diagnostics.Process]::GetProcessById($entry.Pid).Handle); $resumed++ } catch { }
}
if (Test-Path $ReleaseFile) { Remove-Item $ReleaseFile -Force -ErrorAction SilentlyContinue }
Write-Status 'released' @{ reason = $reason; heldSeconds = [int]((Get-Date) - $heldAt).TotalSeconds; resumed = $resumed; of = $suspended.Count }
