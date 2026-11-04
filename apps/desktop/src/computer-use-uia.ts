/**
 * W3-5 UIA port. Fake tree for tests; Windows COM via injected PowerShell.
 */

/** One accessible node from a snapshot. */
export interface UiaNode {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly isPassword?: boolean
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
 * Parse a UIA snapshot from a Windows adapter (JSON). Invalid rows are dropped.
 * @param raw - Array of nodes from COM / PowerShell.
 */
/**
 * PowerShell that dumps the UIA tree as JSON. Tests inject the runner.
 * Password fields never include Value.
 */
export const WINDOWS_UIA_SNAPSHOT_SCRIPT = [
  'Add-Type -AssemblyName UIAutomationClient',
  '$root = [System.Windows.Automation.AutomationElement]::RootElement',
  '$nodes = New-Object System.Collections.Generic.List[object]',
  'function Walk([System.Windows.Automation.AutomationElement]$el, [int]$n) {',
  '  if ($null -eq $el -or $n -gt 40 -or $nodes.Count -ge 80) { return }',
  '  $id = $el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::AutomationIdProperty)',
  '  $name = $el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::NameProperty)',
  '  $role = $el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::ControlTypeProperty)',
  '  $pwd = $el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsPasswordProperty)',
  '  $rect = $el.Current.BoundingRectangle',
  '  if (-not [string]::IsNullOrWhiteSpace($name)) {',
  '    $nodes.Add([pscustomobject]@{',
  '      id = "$(if ($id) { $id } else { $nodes.Count })"',
  '      name = "$name"',
  '      role = "$role"',
  '      rect = @{ x = [int]$rect.X; y = [int]$rect.Y; width = [int]$rect.Width; height = [int]$rect.Height }',
  '      isPassword = [bool]$pwd',
  '    })',
  '  }',
  '  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker',
  '  $child = $walker.GetFirstChild($el)',
  '  while ($null -ne $child) { Walk $child ($n + 1); $child = $walker.GetNextSibling($child) }',
  '}',
  'Walk $root 0',
  '$nodes | ConvertTo-Json -Compress -Depth 5',
].join(';')

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
    })
  }
  return nodes
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

/**
 * PowerShell that finds a named control and calls InvokePattern.
 * Password fields refuse before any pattern. Tests inject the runner.
 */
export const WINDOWS_UIA_INVOKE_SCRIPT = [
  'Add-Type -AssemblyName UIAutomationClient',
  '$name = $env:PERSONA_UIA_NAME',
  'if ([string]::IsNullOrWhiteSpace($name)) { "missing"; exit 0 }',
  '$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name)',
  '$el = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)',
  'if ($null -eq $el) { "missing"; exit 0 }',
  '$pwd = $el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsPasswordProperty)',
  'if ($pwd) { "password"; exit 0 }',
  'try {',
  '  $pat = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)',
  '  $pat.Invoke()',
  '  "ok"',
  '} catch { "missing" }',
].join(';')

/**
 * PowerShell that sets a non-password ValuePattern. IsPassword exits first.
 */
export const WINDOWS_UIA_SETVALUE_SCRIPT = [
  'Add-Type -AssemblyName UIAutomationClient',
  '$name = $env:PERSONA_UIA_NAME',
  '$text = $env:PERSONA_UIA_VALUE',
  'if ([string]::IsNullOrWhiteSpace($name)) { "missing"; exit 0 }',
  '$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name)',
  '$el = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)',
  'if ($null -eq $el) { "missing"; exit 0 }',
  '$pwd = $el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsPasswordProperty)',
  'if ($pwd) { "password"; exit 0 }',
  'try {',
  '  $pat = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)',
  '  $pat.SetValue($text)',
  '  "ok"',
  '} catch { "missing" }',
].join(';')

/** Last line of a COM invoke / setvalue script. */
export type WindowsUiaComWhy = 'ok' | 'missing' | 'password' | 'human'

/**
 * Parse COM script stdout. Unknown text is treated as missing.
 * @param raw - PowerShell output.
 */
export function parseWindowsUiaCom(raw: string): Exclude<WindowsUiaComWhy, 'human'> {
  const line = raw.trim().split(/\r?\n/u).at(-1) ?? ''
  if (line === 'ok' || line === 'missing' || line === 'password') return line
  return 'missing'
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
 * @param extraEnv - Name/value for the script.
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
