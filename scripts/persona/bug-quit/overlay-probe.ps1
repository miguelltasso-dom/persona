# BUG-QUIT-1 measurement tooling (not product): does the overlay window take the mouse or the keyboard from the person?
# Input: env PROBE_JSON = { windows: [{ id, kind, hwnd, bounds }] } from the main process. Output: one JSON line.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Probe {
  [StructLayout(LayoutKind.Sequential)] public struct PT { public int X; public int Y; }
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(PT p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint f);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@

$data = $env:PROBE_JSON | ConvertFrom-Json

function Owner([int]$x, [int]$y) {
  $p = New-Object Probe+PT
  $p.X = $x
  $p.Y = $y
  $h = [Probe]::WindowFromPoint($p)
  $root = [Probe]::GetAncestor($h, 2)
  $procId = [uint32]0
  [void][Probe]::GetWindowThreadProcessId($root, [ref]$procId)
  $name = ''
  try { $name = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch { $name = 'gone' }
  [pscustomobject]@{ x = $x; y = $y; hwnd = $root.ToInt64(); pid = [int]$procId; process = $name }
}

$windows = @()
foreach ($w in $data.windows) {
  $h = [IntPtr][int64]$w.hwnd
  $ex = [int64][Probe]::GetLong($h, -20)
  $windows += [pscustomobject]@{
    id = $w.id; kind = $w.kind; hwnd = [int64]$w.hwnd
    exStyle = ('0x{0:X}' -f $ex)
    clickThrough = (($ex -band 0x20) -ne 0)
    noActivate = (($ex -band 0x08000000) -ne 0)
    layered = (($ex -band 0x80000) -ne 0)
    topmostStyle = (($ex -band 0x8) -ne 0)
    toolWindow = (($ex -band 0x80) -ne 0)
  }
}

$points = @()
foreach ($w in $data.windows) {
  $b = $w.bounds
  $cx = [int]($b.x + $b.width / 2)
  $cy = [int]($b.y + $b.height / 2)
  $points += [pscustomobject]@{ window = $w.id; kind = $w.kind; where = 'center'; owner = (Owner $cx $cy) }
  $points += [pscustomobject]@{ window = $w.id; kind = $w.kind; where = 'bottom-right'; owner = (Owner ([int]($b.x + $b.width - 24)) ([int]($b.y + $b.height - 24))) }
  $points += [pscustomobject]@{ window = $w.id; kind = $w.kind; where = 'top-left'; owner = (Owner ([int]($b.x + 24)) ([int]($b.y + 24))) }
}

$fg = [Probe]::GetForegroundWindow()
$fgPid = [uint32]0
[void][Probe]::GetWindowThreadProcessId($fg, [ref]$fgPid)
$fgName = ''
try { $fgName = (Get-Process -Id $fgPid -ErrorAction Stop).ProcessName } catch { $fgName = 'gone' }

[pscustomobject]@{ windows = $windows; points = $points; foreground = [pscustomobject]@{ hwnd = $fg.ToInt64(); pid = [int]$fgPid; process = $fgName } } | ConvertTo-Json -Depth 6 -Compress
