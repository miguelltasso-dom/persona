# BUG-QUIT-1 measurer: a PERSISTENT process lister. Starting PowerShell costs 1-2 s on a loaded machine, which was most of the resolution of the old
# "one listing per reading" scan. This one starts once and prints one JSON line per listing: { from, to, rows }, where `from`/`to` (unix ms) are taken
# inside the loop right before/after the machine-wide listing, so a snapshot is known to lie between them. Read-only; it signals nothing.
$ErrorActionPreference = 'Stop'
while ($true) {
  $from = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $rows = @(Get-CimInstance Win32_Process | ForEach-Object {
    $cmd = ($_.CommandLine -replace '[^\x20-\x7E]', ' ')
    [pscustomobject]@{
      pid = [int]$_.ProcessId
      ppid = [int]$_.ParentProcessId
      name = $_.Name
      created = $_.CreationDate.ToString('o')
      cmd = $(if ($cmd) { $cmd.Substring(0, [Math]::Min(170, $cmd.Length)) } else { '' })
    }
  })
  $to = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  [pscustomobject]@{ from = $from; to = $to; rows = $rows } | ConvertTo-Json -Compress -Depth 3
  Start-Sleep -Milliseconds 30
}
