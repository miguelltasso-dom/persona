/**
 * W3-5 UIA port. Fake tree for tests; Windows COM via injected PowerShell.
 *
 * D-117 (Lumen D4, Zinc's finding 18:25): every script starts at the WINDOW the session chose (`FromHandle`), never at the desktop root;
 * matches Name AND ControlType (a label named "Texto" comes before the field named "Texto"); and refuses an element that belongs to
 * Persona,
 * to a forbidden process, or to another process. Without a chosen window a script answers `no-target`: it never falls back to the desktop.
 * The rules live in `computer-use-scope.ts`; the scripts receive the same lists through the environment.
 */

import { FORBIDDEN_PROCESSES, type ComputerUseScope } from './computer-use-scope.ts'

/** One accessible node from a snapshot. */
export interface UiaNode {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly isPassword?: boolean
  /** Process that owns the element (scoped snapshots only). */
  readonly processId?: number
  /** Current text of an editable, non-password element (scoped snapshots only; never set for a password field). */
  readonly value?: string
}

/** Snapshot + name lookup (fake or Windows UIA). */
export interface UiaPort {
  snapshot(): readonly UiaNode[]
  find(name: string): UiaNode | undefined
}

/**
 * In-memory UIA tree. Password nodes never expose their value.
 * @param nodes - Accessible nodes.
 */
export function createFakeUiaPort(nodes: readonly UiaNode[]): UiaPort {
  return {
    snapshot: () => [...nodes],
    find: name => nodes.find(node => node.name === name),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function isRect(value: unknown): value is UiaNode['rect'] {
  if (!isRecord(value)) return false
  return typeof value.x === 'number' && typeof value.y === 'number'
    && typeof value.width === 'number' && typeof value.height === 'number'
}

/**
 * The scope as environment variables for a script. The lists come from the same constants the TypeScript rules use.
 * @param scope - The session scope.
 * @param role - Optional UIA ControlType name to match together with the name (`Button`, `Edit`, ...).
 */
export function uiaScopeEnv(scope: ComputerUseScope | undefined, role?: string): Record<string, string> {
  if (scope === undefined) return {}
  return {
    PERSONA_UIA_HWND: scope.windowHandle,
    PERSONA_UIA_PID: String(scope.processId),
    PERSONA_UIA_DENY_PIDS: scope.personaPids.join(','),
    PERSONA_UIA_DENY_NAMES: FORBIDDEN_PROCESSES.join(','),
    ...(role === undefined || role === '' ? {} : { PERSONA_UIA_ROLE: role }),
  }
}

/**
 * PowerShell lines shared by every script: the chosen window as root, and the lists to refuse.
 * `$elPid` because `$pid` is read-only in PowerShell.
 */
const SCOPE_PRELUDE = [
  'Add-Type -AssemblyName UIAutomationClient',
  '$hwnd = $env:PERSONA_UIA_HWND',
  '$denyPids = @(); if (-not [string]::IsNullOrWhiteSpace($env:PERSONA_UIA_DENY_PIDS)) { $denyPids = @($env:PERSONA_UIA_DENY_PIDS -split "," | ForEach-Object { [int]$_ }) }',
  '$denyNames = @(); if (-not [string]::IsNullOrWhiteSpace($env:PERSONA_UIA_DENY_NAMES)) { $denyNames = @($env:PERSONA_UIA_DENY_NAMES -split ",") }',
  'function Verdict([System.Windows.Automation.AutomationElement]$el) {',
  '  $elPid = $el.Current.ProcessId',
  '  if ($denyPids -contains $elPid) { return "persona-app" }',
  '  $proc = Get-Process -Id $elPid -ErrorAction SilentlyContinue',
  '  if ($null -ne $proc -and $denyNames -contains $proc.ProcessName.ToLower()) { return "forbidden" }',
  '  if ($elPid -ne [int]$env:PERSONA_UIA_PID) { return "outside-window" }',
  '  return "ok"',
  '}',
]

/**
 * PowerShell that dumps the UIA tree of the chosen window as JSON. Tests inject the runner.
 * Password fields never include Value. Elements of Persona or of a forbidden process are not read. No window: `[]`.
 */
export const WINDOWS_UIA_SNAPSHOT_SCRIPT = [
  ...SCOPE_PRELUDE,
  'if ([string]::IsNullOrWhiteSpace($hwnd)) { "[]"; exit 0 }',
  '$root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr][int64]$hwnd)',
  'if ($null -eq $root) { "[]"; exit 0 }',
  '$nodes = New-Object System.Collections.Generic.List[object]',
  'function Walk([System.Windows.Automation.AutomationElement]$el, [int]$n) {',
  '  if ($null -eq $el -or $n -gt 40 -or $nodes.Count -ge 80) { return }',
  '  if ((Verdict $el) -ne "ok") { return }',
  '  $id = $el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::AutomationIdProperty)',
  '  $name = $el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::NameProperty)',
  '  $role = $el.Current.ControlType.ProgrammaticName -replace "^ControlType\\.", ""',
  '  $pwd = $el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsPasswordProperty)',
  '  $rect = $el.Current.BoundingRectangle',
  '  if (-not [string]::IsNullOrWhiteSpace($name)) {',
  // One line on purpose: the script is joined with ";", and a ";" right after "@{" is a PowerShell syntax error (found 18:39 by parsing the
  // original script, which had the object spread over lines: "O literal de hash estava incompleto").
  // The value of an editable, NON-password element (so a step can verify what was typed); never read for a password field.
  '    $val = ""; if (-not $pwd) { $vp = $null; if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$vp)) { $val = "$($vp.Current.Value)"; if ($val.Length -gt 200) { $val = $val.Substring(0, 200) } } }',
  '    $nodes.Add([pscustomobject]@{ id = "$(if ($id) { $id } else { $nodes.Count })"; name = "$name"; role = "$role"; rect = @{ x = [int]$rect.X; y = [int]$rect.Y; width = [int]$rect.Width; height = [int]$rect.Height }; isPassword = [bool]$pwd; processId = [int]$el.Current.ProcessId; value = "$val" })',
  '  }',
  '  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker',
  '  $child = $walker.GetFirstChild($el)',
  '  while ($null -ne $child) { Walk $child ($n + 1); $child = $walker.GetNextSibling($child) }',
  '}',
  'Walk $root 0',
  '$nodes | ConvertTo-Json -Compress -Depth 5',
].join(';')

/**
 * Parse a UIA snapshot from a Windows adapter (JSON). Invalid rows are dropped.
 * @param raw - Array of nodes from COM / PowerShell.
 */
export function parseUiaSnapshot(raw: unknown): UiaNode[] {
  if (!Array.isArray(raw)) return []
  const nodes: UiaNode[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.role !== 'string') continue
    if (!isRect(item.rect)) continue
    nodes.push({
      id: item.id,
      name: item.name,
      role: item.role,
      rect: item.rect,
      ...(item.isPassword === true ? { isPassword: true } : {}),
      ...(typeof item.processId === 'number' ? { processId: item.processId } : {}),
      ...(typeof item.value === 'string' && item.value !== '' && item.isPassword !== true ? { value: item.value.slice(0, 200) } : {}),
    })
  }
  return nodes
}

/**
 * UIA port backed by an injected snapshot runner (PowerShell / COM later).
 * @param run - Returns JSON text of {@link parseUiaSnapshot}.
 * @returns Snapshot port. Bad JSON is an empty tree.
 */
export function createWindowsUiaPort(run: () => string): UiaPort {
  const load = (): UiaNode[] => {
    let raw: unknown
    try {
      raw = JSON.parse(run())
    } catch (error) {
      void error
      return []
    }
    return parseUiaSnapshot(raw)
  }
  return {
    snapshot: () => load(),
    find: name => load().find(node => node.name === name),
  }
}

/**
 * Safe label for the overlay: password fields stay masked.
 * @param node - Resolved target.
 */
export function uiaOverlayLabel(node: UiaNode): string {
  return node.isPassword === true ? 'digitando ••••' : node.name
}

/** Result of a local invoke (click/set). Password never types. */
export type UiaInvokeResult =
  | { readonly ok: true; readonly node: UiaNode }
  | { readonly ok: false; readonly why: 'missing' | 'human' | 'password' }

/**
 * Resolve and invoke a named target. Human hold and password fields refuse.
 * @param port - Snapshot port.
 * @param name - Accessible name.
 * @param held - True when the human holds the overlay.
 */
export function invokeUiaTarget(port: UiaPort, name: string, held = false): UiaInvokeResult {
  if (held) return { ok: false, why: 'human' }
  const node = port.find(name)
  if (node === undefined) return { ok: false, why: 'missing' }
  if (node.isPassword === true) return { ok: false, why: 'password' }
  return { ok: true, node }
}

/**
 * Center of a UIA rect in physical pixels. Overlay converts to DIP.
 * @param node - Resolved target.
 */
export function uiaClickPoint(node: UiaNode): { readonly x: number; readonly y: number } {
  return {
    x: node.rect.x + node.rect.width / 2,
    y: node.rect.y + node.rect.height / 2,
  }
}

/**
 * Resolve a named target and click its center. Human hold / password refuse.
 * @param port - Snapshot port.
 * @param name - Accessible name.
 * @param held - True when the human holds the overlay.
 * @param click - Physical click (MCP / overlay).
 */
export async function clickNamedUia(
  port: UiaPort,
  name: string,
  held: boolean,
  click: (x: number, y: number) => Promise<string>,
): Promise<string> {
  const result = invokeUiaTarget(port, name, held)
  if (!result.ok) {
    if (result.why === 'human') return 'humano no controle'
    if (result.why === 'password') return 'campo de senha'
    return 'alvo ausente'
  }
  const point = uiaClickPoint(result.node)
  return click(point.x, point.y)
}

/** The lookup shared by the invoke and set-value scripts: the chosen window, Name (and ControlType when asked), then the refusal checks. */
const SCOPED_FIND = [
  ...SCOPE_PRELUDE,
  '$name = $env:PERSONA_UIA_NAME',
  'if ([string]::IsNullOrWhiteSpace($hwnd)) { "no-target"; exit 0 }',
  'if ([string]::IsNullOrWhiteSpace($name)) { "missing"; exit 0 }',
  '$root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr][int64]$hwnd)',
  'if ($null -eq $root) { "no-target"; exit 0 }',
  '$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name)',
  '$role = $env:PERSONA_UIA_ROLE',
  'if (-not [string]::IsNullOrWhiteSpace($role)) {',
  '  $type = [System.Windows.Automation.ControlType]::$role',
  '  if ($null -eq $type) { "missing"; exit 0 }',
  '  $typeCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, $type)',
  '  $cond = New-Object System.Windows.Automation.AndCondition($cond, $typeCond)',
  '}',
  '$el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)',
  'if ($null -eq $el) { "missing"; exit 0 }',
  '$verdict = Verdict $el',
  'if ($verdict -ne "ok") { $verdict; exit 0 }',
  '$pwd = $el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsPasswordProperty)',
  'if ($pwd) { "password"; exit 0 }',
]

/**
 * PowerShell that finds a named control inside the chosen window and calls InvokePattern.
 * Password fields refuse before any pattern. Tests inject the runner.
 */
export const WINDOWS_UIA_INVOKE_SCRIPT = [
  ...SCOPED_FIND,
  'try {',
  '  $pat = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)',
  '  $pat.Invoke()',
  '  "ok"',
  '} catch { "missing" }',
].join(';')

/**
 * PowerShell that sets a non-password ValuePattern inside the chosen window. IsPassword exits first.
 */
export const WINDOWS_UIA_SETVALUE_SCRIPT = [
  ...SCOPED_FIND,
  '$text = $env:PERSONA_UIA_VALUE',
  'try {',
  '  $pat = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)',
  '  $pat.SetValue($text)',
  '  "ok"',
  '} catch { "missing" }',
].join(';')

/** The window of the session as the OS reports it (process id and name, title), so the executor can judge it BEFORE the first step. */
export const WINDOWS_UIA_WINDOW_SCRIPT = [
  'Add-Type -AssemblyName UIAutomationClient',
  '$hwnd = $env:PERSONA_UIA_HWND',
  'if ([string]::IsNullOrWhiteSpace($hwnd)) { "no-target"; exit 0 }',
  '$root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr][int64]$hwnd)',
  'if ($null -eq $root) { "no-target"; exit 0 }',
  '$owner = $root.Current.ProcessId; $proc = Get-Process -Id $owner -ErrorAction SilentlyContinue',
  '[pscustomobject]@{ processId = [int]$owner; processName = "$($proc.ProcessName)"; title = "$($root.Current.Name)" } | ConvertTo-Json -Compress',
].join(';')

/**
 * Invoke the control AT a point of the chosen window (the MCP click is by coordinates). The point must be inside the window; the element
 * under it
 * and every ancestor up to the first Invoke-able one (4 levels) must pass the scope check; a password field refuses.
 */
export const WINDOWS_UIA_POINT_INVOKE_SCRIPT = [
  ...SCOPE_PRELUDE,
  '$x = [double]$env:PERSONA_UIA_X; $y = [double]$env:PERSONA_UIA_Y',
  'if ([string]::IsNullOrWhiteSpace($hwnd)) { "no-target"; exit 0 }',
  '$root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr][int64]$hwnd)',
  'if ($null -eq $root) { "no-target"; exit 0 }',
  '$rootVerdict = Verdict $root',
  'if ($rootVerdict -ne "ok") { $rootVerdict; exit 0 }',
  '$box = $root.Current.BoundingRectangle',
  'if ($x -lt $box.Left -or $x -gt $box.Right -or $y -lt $box.Top -or $y -gt $box.Bottom) { "outside-window"; exit 0 }',
  '$el = [System.Windows.Automation.AutomationElement]::FromPoint((New-Object System.Windows.Point($x, $y)))',
  'if ($null -eq $el) { "missing"; exit 0 }',
  '$walk = $el; $pat = $null',
  'for ($i = 0; $i -lt 4 -and $null -ne $walk; $i++) { $v = Verdict $walk; if ($v -ne "ok") { $v; exit 0 }; if ($walk.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsPasswordProperty)) { "password"; exit 0 }; if ($walk.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pat)) { break }; $walk = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($walk) }',
  'if ($null -eq $pat) { "missing"; exit 0 }',
  'try { $pat.Invoke(); "ok" } catch { "missing" }',
].join(';')

/**
 * Type into the element that has the focus, when it belongs to the chosen window's process (the MCP type has no name).
 * Password fields refuse.
 */
export const WINDOWS_UIA_FOCUS_SETVALUE_SCRIPT = [
  ...SCOPE_PRELUDE,
  '$text = $env:PERSONA_UIA_VALUE',
  'if ([string]::IsNullOrWhiteSpace($hwnd)) { "no-target"; exit 0 }',
  '$root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr][int64]$hwnd)',
  'if ($null -eq $root) { "no-target"; exit 0 }',
  '$rootVerdict = Verdict $root',
  'if ($rootVerdict -ne "ok") { $rootVerdict; exit 0 }',
  '$el = [System.Windows.Automation.AutomationElement]::FocusedElement',
  'if ($null -eq $el) { "missing"; exit 0 }',
  '$verdict = Verdict $el',
  'if ($verdict -ne "ok") { $verdict; exit 0 }',
  'if ($el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsPasswordProperty)) { "password"; exit 0 }',
  'try { $pat = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern); $pat.SetValue($text); "ok" } catch { "missing" }',
].join(';')

/** Last line of a COM invoke / setvalue script. */
export type WindowsUiaComWhy = 'ok' | 'missing' | 'password' | 'human' | 'no-target' | 'persona-app' | 'forbidden' | 'outside-window'

const SCRIPT_ANSWERS: readonly string[] = ['ok', 'missing', 'password', 'no-target', 'persona-app', 'forbidden', 'outside-window']

/**
 * Parse COM script stdout. Unknown text is treated as missing.
 * @param raw - PowerShell output.
 */
export function parseWindowsUiaCom(raw: string): Exclude<WindowsUiaComWhy, 'human'> {
  const line = raw.trim().split(/\r?\n/u).at(-1) ?? ''
  return SCRIPT_ANSWERS.includes(line) ? line as Exclude<WindowsUiaComWhy, 'human'> : 'missing'
}

/**
 * Named InvokePattern. Human hold never launches COM.
 * @param run - Injected script runner (tests / PowerShell).
 * @param name - Accessible name.
 * @param held - True when the human holds the overlay.
 */
export function invokeWindowsUiaNamed(
  run: (name: string) => string,
  name: string,
  held = false,
): WindowsUiaComWhy {
  if (held) return 'human'
  return parseWindowsUiaCom(run(name))
}

/**
 * Named ValuePattern set. Password and human hold refuse.
 * @param run - Injected script runner.
 * @param name - Accessible name.
 * @param value - Text to set.
 * @param held - True when the human holds the overlay.
 */
export function setWindowsUiaValue(
  run: (name: string, value: string) => string,
  name: string,
  value: string,
  held = false,
): WindowsUiaComWhy {
  if (held) return 'human'
  return parseWindowsUiaCom(run(name, value))
}

/** Injected PowerShell (tests never call the real CLI). */
export type UiaScriptSpawn = (
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
) => { readonly stdout: string; readonly status: number | null }

/**
 * Run a UIA script through an injected spawn. Extra env is PERSONA_UIA_*.
 * @param script - Snapshot / invoke / setvalue script.
 * @param extraEnv - Name/value for the script (and the scope, {@link uiaScopeEnv}).
 * @param spawn - Injected process runner.
 */
export function runWindowsUiaScript(
  script: string,
  extraEnv: Record<string, string>,
  spawn: UiaScriptSpawn,
): string {
  const result = spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], {
    ...process.env,
    ...extraEnv,
  })
  return result.stdout
}
