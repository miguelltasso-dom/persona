/**
 * D-117 / M9 (Lumen D4, "zona proibida", Keel 15:33: BEFORE the live proof): where the executor may act. The rules are pure; the bind asks
 * {@link judgeElement} before every click or text, and {@link judgeChord} before every key, with data the OS reported (process id and
 * name of
 * the element), never data the persona or the screen supplied.
 *
 * Three facts of today's executor this closes (apps/desktop/src/computer-use-uia.ts): the name lookup starts at the desktop root, so a
 * button
 * named "Aprovar" of Persona's own card matches; any window's element can be hit; and nothing keeps a persona out of UAC, Task Manager or a
 * terminal. A session therefore carries a {@link ComputerUseScope}: the ONE window it chose and the processes that are Persona itself.
 */

/** What a session is allowed to touch: one window of one process, and never Persona itself. */
export interface ComputerUseScope {
  /** HWND of the window the session chose (decimal string, as UIA reports it). */
  readonly windowHandle: string
  /** Process id that owns that window. */
  readonly processId: number
  /** Persona.exe and every child it started (renderer, GPU, helpers, the overlay). */
  readonly personaPids: readonly number[]
}

/** What the OS says about an element (or the foreground window) the executor is about to act on. */
export interface ScopedElement {
  readonly processId: number
  /** Executable name as the OS reports it (`notepad.exe` or `notepad`). */
  readonly processName: string
}

/** Why the executor refused. */
export type ScopeRefusal =
  /** No session target: the executor never falls back to "the whole desktop". */
  | 'no-target'
  /** The element belongs to Persona itself (its approval card, pairing, Cofre, the Stop button, the overlay). */
  | 'persona-app'
  /** A process no persona may operate, whatever its authority. */
  | 'forbidden-target'
  /** The element is not in the process of the window the session chose. */
  | 'outside-window'
  /** A key chord no persona may press. */
  | 'forbidden-chord'

/** The verdict of one check. */
export type ScopeVerdict = { readonly ok: true } | { readonly ok: false; readonly why: ScopeRefusal }

/**
 * Processes (lower case, no `.exe`) a persona never operates (Lumen D4b): elevation prompts, system security, task management, command
 * lines, system settings, the registry, and password managers.
 */
export const FORBIDDEN_PROCESSES: readonly string[] = [
  'consent', 'logonui', 'winlogon', 'credentialuibroker',
  'securityhealthsystray', 'securityhealthservice', 'sechealthui', 'windowsdefender', 'msmpeng',
  'taskmgr', 'processhacker', 'procexp', 'procexp64',
  'cmd', 'powershell', 'powershell_ise', 'pwsh', 'windowsterminal', 'wt', 'conhost', 'openconsole', 'wsl', 'bash',
  'systemsettings', 'control', 'regedit', 'mmc', 'msconfig', 'gpedit', 'secpol', 'lusrmgr',
  '1password', 'bitwarden', 'keepass', 'keepassxc', 'lastpass', 'dashlane', 'enpass', 'nordpass', 'roboform',
]

/**
 * @param name - An executable name as the OS reports it.
 * @returns It lower-cased, without the `.exe` suffix.
 */
export function processKey(name: string): string {
  const lower = name.trim().toLowerCase()
  return lower.endsWith('.exe') ? lower.slice(0, -4) : lower
}

/**
 * @param name - An executable name.
 * @returns Whether no persona may operate that process.
 */
export function isForbiddenProcess(name: string): boolean {
  return FORBIDDEN_PROCESSES.includes(processKey(name))
}

/**
 * Judge the window a session wants to choose, BEFORE it starts.
 * @param scope - The proposed scope.
 * @param target - What the OS says about the window's process.
 */
export function judgeTargetWindow(scope: ComputerUseScope | undefined, target: ScopedElement): ScopeVerdict {
  if (scope === undefined) return { ok: false, why: 'no-target' }
  if (scope.personaPids.includes(target.processId) || scope.personaPids.includes(scope.processId)) return { ok: false, why: 'persona-app' }
  if (isForbiddenProcess(target.processName)) return { ok: false, why: 'forbidden-target' }
  if (target.processId !== scope.processId) return { ok: false, why: 'outside-window' }
  return { ok: true }
}

/**
 * Judge ONE element, before a click or a text. Order matters: Persona itself is refused even when it shares a window, and the forbidden
 * list is checked on the element's OWN process, so a forbidden dialog opened over an allowed window is still refused.
 * @param element - What the OS reports about the element about to be acted on.
 * @param scope - The session scope, or `undefined` when none was chosen (always refused).
 */
export function judgeElement(element: ScopedElement, scope: ComputerUseScope | undefined): ScopeVerdict {
  if (scope === undefined) return { ok: false, why: 'no-target' }
  if (scope.personaPids.includes(element.processId)) return { ok: false, why: 'persona-app' }
  if (isForbiddenProcess(element.processName)) return { ok: false, why: 'forbidden-target' }
  if (element.processId !== scope.processId) return { ok: false, why: 'outside-window' }
  return { ok: true }
}

/**
 * @param chord - A key chord as written (`Win + R`, `ctrl+alt+delete`, `Alt+F4`).
 * @returns The chord lower-cased, spaces removed, parts sorted, with the usual aliases folded (`del`, `windows`, `meta`, `control`).
 */
export function normalizeChord(chord: string): string {
  const alias: Record<string, string> = { control: 'ctrl', windows: 'win', meta: 'win', super: 'win', cmd: 'win', delete: 'del', option: 'alt' }
  return chord.split('+').map(part => part.trim().toLowerCase()).filter(part => part !== '').map(part => alias[part] ?? part).sort().join('+')
}

/**
 * Chords that are never pressed, whatever window is in front (Lumen D4c): the secure attention sequence, Run, lock, and the Start menu key.
 */
const NEVER_CHORDS: readonly string[] = ['alt+ctrl+del', 'ctrl+esc', 'ctrl+esc+shift'] // normalized form: parts sorted

/**
 * Judge a key chord, BEFORE it is pressed.
 * @param chord - The chord as written.
 * @param foreground - What the OS says about the window that would receive it.
 * @param scope - The session scope.
 */
export function judgeChord(chord: string, foreground: ScopedElement, scope: ComputerUseScope | undefined): ScopeVerdict {
  const base = judgeElement(foreground, scope)
  if (!base.ok) return base
  const key = normalizeChord(chord)
  // Any chord that carries the Windows key is the shell's, not the target's; the named ones above are refused outright.
  if (NEVER_CHORDS.includes(key) || key.split('+').includes('win')) return { ok: false, why: 'forbidden-chord' }
  // Alt+F4 closes whatever is in front: refused here, because the foreground already passed as the target window and an agent must not
  // close it.
  if (key === 'alt+f4') return { ok: false, why: 'forbidden-chord' }
  return { ok: true }
}
