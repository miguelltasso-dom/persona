/**
 * D-117 / M9: the REAL desktop executor behind the computer-use loop (Forge's `DesktopObservePort` / `DesktopActPort`) and the MCP acting
 * ports (`persona_computer_*`). Every step is scoped to the window the session chose (`context.target`), judged by `computer-use-scope.ts`
 * through the scripts of `computer-use-uia.ts`, and cancellable: PowerShell runs ASYNCHRONOUSLY with the step's `AbortSignal`, so a Stop
 * never
 * waits behind a UIA call (the old `spawnSync` blocked the main process up to 8 s).
 *
 * The types below are structural copies of `persona-engine/src/computer-use.ts` (the desktop does not import the engine); a spec checks
 * them
 * against the engine's at integration. The persona never injects input: clicks are InvokePattern, text is ValuePattern, so there is no
 * synthetic input for the human hook to confuse with the person's own.
 */

import { spawn, type SpawnOptions } from 'node:child_process'
import { judgeTargetWindow, type ComputerUseScope } from './computer-use-scope.ts'
import {
  WINDOWS_UIA_FOCUS_SETVALUE_SCRIPT, WINDOWS_UIA_INVOKE_SCRIPT, WINDOWS_UIA_POINT_INVOKE_SCRIPT, WINDOWS_UIA_SETVALUE_SCRIPT,
  WINDOWS_UIA_SNAPSHOT_SCRIPT, WINDOWS_UIA_WINDOW_SCRIPT, parseUiaSnapshot, parseWindowsUiaCom, uiaScopeEnv,
  type UiaNode, type WindowsUiaComWhy,
} from './computer-use-uia.ts'

/** The engine's `YOU_TOOK_OVER` and `STOPPED_COMPUTER_USE` (a spec keeps them equal). */
export const YOU_TOOK_OVER_DETAIL = 'você assumiu'
export const STOPPED_DETAIL = 'Parado a pedido.'

/** Window target bound to a run (engine `ComputerUseTarget`). */
export interface ExecutorTarget {
  readonly windowHandle: string
  readonly processId: number
  readonly title?: string
}

/** What the host forwards to a port on every step (engine `DesktopPortContext` / acting `ComputerActingContext`). */
export interface ExecutorContext {
  readonly runId?: string
  readonly personaId?: string
  readonly target?: ExecutorTarget
  readonly signal?: AbortSignal
}

/** Engine `A11yNode`. */
export interface ExecutorA11yNode {
  readonly id: string
  readonly role: string
  readonly name: string
  readonly value?: string
  readonly bounds?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly children?: readonly ExecutorA11yNode[]
}

/** Engine `ScreenObservation`. */
export interface ExecutorObservation {
  readonly atMs: number
  readonly captureRef: string
  readonly tree: ExecutorA11yNode
  readonly target?: ExecutorTarget
}

/** Engine `ComputerAction`. */
export type ExecutorAction =
  | { readonly kind: 'click'; readonly target: string; readonly x: number; readonly y: number }
  | { readonly kind: 'type'; readonly target: string; readonly text: string }
  | { readonly kind: 'key'; readonly key: string }
  | { readonly kind: 'scroll'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'wait'; readonly ms: number }

/** Engine `ActResult`. */
export interface ExecutorActResult {
  readonly ok: boolean
  readonly detail: string
}

/** What the executor needs from the machine. Tests inject all of it. */
export interface ExecutorDeps {
  /** Runs one UIA script with the environment, cancellable; resolves with its stdout, rejects when aborted. */
  readonly runScript: (script: string, env: Record<string, string>, signal?: AbortSignal) => Promise<string>
  /** Persona.exe and every child it started (the processes no persona may touch). */
  readonly personaPids: () => readonly number[]
  /** The person holds the controls. */
  readonly held: () => boolean
  /** A capture of the TARGET WINDOW only (never the desktop); returns a reference. Absent: `none`. */
  readonly screenshotWindow?: (target: ExecutorTarget, signal?: AbortSignal) => Promise<string>
  readonly now?: () => number
}

/** Longest `wait` a step may ask for. */
export const MAX_WAIT_MS = 10_000
const ACTIONABLE_ROLES: readonly string[] = ['Button', 'Hyperlink', 'MenuItem', 'CheckBox', 'RadioButton', 'TabItem', 'ListItem', 'SplitButton']
const EDITABLE_ROLES: readonly string[] = ['Edit', 'Document', 'ComboBox']

function scopeOf(target: ExecutorTarget, deps: ExecutorDeps): ComputerUseScope {
  return { windowHandle: target.windowHandle, processId: target.processId, personaPids: deps.personaPids() }
}

/** What an answer of a UIA script means for the loop: refusals carry their CODE (the engine turns `persona-app`... into `scope:...`). */
function resultOf(answer: WindowsUiaComWhy): ExecutorActResult {
  switch (answer) {
    case 'ok': return { ok: true, detail: 'ok' }
    case 'missing': return { ok: false, detail: 'alvo ausente' }
    case 'password': return { ok: false, detail: 'campo de senha' }
    case 'human': return { ok: false, detail: YOU_TOOK_OVER_DETAIL }
    default: return { ok: false, detail: answer }
  }
}

function aborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

/** Run a script, mapping an abort (or a failed spawn) to `undefined` so no step ever throws into the loop. */
async function safely(deps: ExecutorDeps, script: string, env: Record<string, string>, signal?: AbortSignal): Promise<string | undefined> {
  try { return await deps.runScript(script, env, signal) } catch (error) { void error; return undefined }
}

/** The window as the OS reports it, or `undefined` (no target, gone, unreadable). */
async function windowInfo(
  deps: ExecutorDeps, target: ExecutorTarget, signal?: AbortSignal,
): Promise<{ processId: number; processName: string; title: string } | undefined> {
  const raw = await safely(deps, WINDOWS_UIA_WINDOW_SCRIPT, { PERSONA_UIA_HWND: target.windowHandle }, signal)
  if (raw === undefined) return undefined
  try {
    const value: unknown = JSON.parse(raw.trim().split(/\r?\n/u).at(-1) ?? '')
    if (typeof value !== 'object' || value === null) return undefined
    const info = value as Record<string, unknown>
    if (typeof info.processId !== 'number' || typeof info.processName !== 'string') return undefined
    return { processId: info.processId, processName: info.processName, title: typeof info.title === 'string' ? info.title : '' }
  } catch { return undefined }
}

/**
 * The observe port. Reports `target` ONLY when the OS confirmed the window (its process is the one the run bound, and it is not Persona
 * nor a
 * forbidden process); otherwise the loop denies with `target:unverified`. The tree holds the scoped snapshot: elements of Persona or of a
 * forbidden process are never in it.
 * @param deps - Machine seams.
 */
export function createExecutorObservePort(deps: ExecutorDeps): {
  observe(context?: ExecutorContext): Promise<ExecutorObservation>
  /** The role of a named element of the last observation of a window (so a click matches Name AND ControlType). */
  roleOf(windowHandle: string, name: string, kind: 'actionable' | 'editable'): string | undefined
} {
  const lastNodes = new Map<string, readonly UiaNode[]>()
  const now = (): number => (deps.now ?? Date.now)()
  const empty = (): ExecutorObservation => ({ atMs: now(), captureRef: 'none', tree: { id: 'window', role: 'Window', name: '', children: [] } })
  return {
    async observe(context) {
      const target = context?.target
      if (target === undefined || aborted(context?.signal)) return empty()
      const scope = scopeOf(target, deps)
      const info = await windowInfo(deps, target, context?.signal)
      if (info === undefined || !judgeTargetWindow(scope, { processId: info.processId, processName: info.processName }).ok) return empty()
      const raw = await safely(deps, WINDOWS_UIA_SNAPSHOT_SCRIPT, uiaScopeEnv(scope), context?.signal)
      let nodes: UiaNode[] = []
      try { nodes = raw === undefined ? [] : parseUiaSnapshot(JSON.parse(raw.trim())) } catch { nodes = [] }
      lastNodes.set(target.windowHandle, nodes)
      const captureRef = deps.screenshotWindow === undefined ? 'none' : (await deps.screenshotWindow(target, context?.signal).catch(() => 'none'))
      return {
        atMs: now(),
        captureRef,
        tree: {
          id: 'window', role: 'Window', name: info.title,
          children: nodes.map(node => ({
            id: node.id, role: node.role, name: node.name, bounds: node.rect,
            ...(node.value === undefined ? {} : { value: node.value }),
          })),
        },
        target: { windowHandle: target.windowHandle, processId: info.processId, ...(info.title === '' ? {} : { title: info.title }) },
      }
    },
    roleOf(windowHandle, name, kind) {
      const matches = (lastNodes.get(windowHandle) ?? []).filter(node => node.name === name)
      const wanted = kind === 'actionable' ? ACTIONABLE_ROLES : EDITABLE_ROLES
      return matches.find(node => wanted.includes(node.role))?.role ?? matches[0]?.role
    },
  }
}

/**
 * The act port. Click is InvokePattern by Name (+ ControlType from the last observation), type is ValuePattern by Name, wait is a pause.
 * Keys and
 * scroll are refused (`não suportado`): they would need synthetic input, which this executor does not make; chords that no persona may
 * press
 * are named in the refusal. Every step stops at once on the signal and when the person holds the controls.
 * @param deps - Machine seams.
 * @param observer - The observe port (its last tree gives the ControlType).
 */
export function createExecutorActPort(deps: ExecutorDeps, observer: Pick<ReturnType<typeof createExecutorObservePort>, 'roleOf'>): {
  act(action: ExecutorAction, context?: ExecutorContext): Promise<ExecutorActResult>
} {
  return {
    async act(action, context) {
      if (aborted(context?.signal)) return { ok: false, detail: STOPPED_DETAIL }
      if (deps.held()) return { ok: false, detail: YOU_TOOK_OVER_DETAIL }
      if (action.kind === 'wait') {
        const ms = Math.min(Math.max(0, Math.floor(action.ms)), MAX_WAIT_MS)
        await new Promise<void>((resolve) => {
          const done = (): void => { clearTimeout(timer); context?.signal?.removeEventListener('abort', done); resolve() }
          const timer = setTimeout(done, ms)
          context?.signal?.addEventListener('abort', done, { once: true })
        })
        return aborted(context?.signal) ? { ok: false, detail: STOPPED_DETAIL } : { ok: true, detail: 'ok' }
      }
      const target = context?.target
      if (target === undefined) return { ok: false, detail: 'no-target' }
      if (action.kind === 'key' || action.kind === 'scroll') return { ok: false, detail: 'não suportado' }
      const scope = scopeOf(target, deps)
      const role = observer.roleOf(target.windowHandle, action.target, action.kind === 'click' ? 'actionable' : 'editable')
      const env = { ...uiaScopeEnv(scope, role), PERSONA_UIA_NAME: action.target, ...(action.kind === 'type' ? { PERSONA_UIA_VALUE: action.text } : {}) }
      const raw = await safely(deps, action.kind === 'click' ? WINDOWS_UIA_INVOKE_SCRIPT : WINDOWS_UIA_SETVALUE_SCRIPT, env, context?.signal)
      if (raw === undefined) return aborted(context?.signal) ? { ok: false, detail: STOPPED_DETAIL } : { ok: false, detail: 'alvo ausente' }
      // The person grabbed the controls while the script ran: the answer no longer counts.
      if (deps.held()) return { ok: false, detail: YOU_TOOK_OVER_DETAIL }
      return resultOf(parseWindowsUiaCom(raw))
    },
  }
}

/**
 * The MCP acting adapters (`persona_computer_*`): the CLI persona clicks by COORDINATES and types without a name. Same scope, same abort.
 * @param deps - Machine seams.
 */
export function createExecutorActions(deps: ExecutorDeps): {
  held: () => boolean
  screenshot: (context?: ExecutorContext) => Promise<string>
  click: (x: number, y: number, context?: ExecutorContext) => Promise<string>
  type: (text: string, context?: ExecutorContext) => Promise<string>
} {
  const refusal = (context?: ExecutorContext): string | undefined => {
    if (aborted(context?.signal)) return STOPPED_DETAIL.toLowerCase()
    if (deps.held()) return 'humano no controle'
    if (context?.target === undefined) return 'no-target'
    return undefined
  }
  const answer = async (script: string, env: Record<string, string>, context: ExecutorContext): Promise<string> => {
    const raw = await safely(deps, script, env, context.signal)
    if (raw === undefined) return aborted(context.signal) ? STOPPED_DETAIL.toLowerCase() : 'alvo ausente'
    if (deps.held()) return 'humano no controle'
    return resultOf(parseWindowsUiaCom(raw)).detail
  }
  return {
    held: () => deps.held(),
    screenshot: async (context) => {
      const target = context?.target
      if (target === undefined || deps.screenshotWindow === undefined) return 'no-target'
      return deps.screenshotWindow(target, context?.signal).catch(() => 'alvo ausente')
    },
    click: async (x, y, context) => {
      const blocked = refusal(context)
      if (blocked !== undefined || context?.target === undefined) return blocked ?? 'no-target'
      if (!Number.isFinite(x) || !Number.isFinite(y)) return 'alvo ausente'
      const env = { ...uiaScopeEnv(scopeOf(context.target, deps)), PERSONA_UIA_X: String(x), PERSONA_UIA_Y: String(y) }
      return answer(WINDOWS_UIA_POINT_INVOKE_SCRIPT, env, context)
    },
    type: async (text, context) => {
      const blocked = refusal(context)
      if (blocked !== undefined || context?.target === undefined) return blocked ?? 'no-target'
      return answer(WINDOWS_UIA_FOCUS_SETVALUE_SCRIPT, { ...uiaScopeEnv(scopeOf(context.target, deps)), PERSONA_UIA_VALUE: text }, context)
    },
  }
}

/** Options of the real script runner. */
export interface PowerShellRunnerOptions {
  /** `node:child_process.spawn` (tests replace it). */
  readonly spawn?: (command: string, args: readonly string[], options: SpawnOptions) => ReturnType<typeof spawn>
  /** Hard ceiling for one script; default 15 s. */
  readonly timeoutMs?: number
}

/**
 * The real script runner: PowerShell as an ASYNC child, arguments as an array (no shell), values in the environment, killed on the signal
 * and on
 * the ceiling. Resolves with stdout; rejects when aborted or on a spawn error.
 * @param options - Seams.
 * @returns A runner for {@link ExecutorDeps.runScript}.
 */
export function createPowerShellRunner(options: PowerShellRunnerOptions = {}): ExecutorDeps['runScript'] {
  const launch = options.spawn ?? spawn
  return (script, env, signal) => new Promise<string>((resolve, reject) => {
    if (signal?.aborted === true) { reject(new Error('aborted')); return }
    const child = launch('powershell', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], {
      env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    })
    let out = ''
    let settled = false
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      if (error === undefined) resolve(out)
      else reject(error)
    }
    const onAbort = (): void => { child.kill(); finish(new Error('aborted')) }
    const timer = setTimeout(() => { child.kill(); finish(new Error('timeout')) }, options.timeoutMs ?? 15_000)
    timer.unref()
    signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout?.on('data', (chunk: Buffer | string) => { out += chunk.toString() })
    child.once('error', (error) => { finish(error) })
    child.once('close', () => { finish() })
  })
}
