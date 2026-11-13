/**
 * D-117 / C3, Electron-main side of the host-child bridge (Forge's host side: `persona-host/src/computer-use-ipc.ts`). The loop and the MCP
 * gateway run in the child host and call the executor of THIS process through `{ type: 'persona-computer-use' }` messages. The handler is
 * consumed by `DesktopHostProcess` BEFORE `isDesktopHostEvent` (that check kills the child on an unknown message).
 *
 * Every request is validated (the child is less trusted than main), runs with its own AbortController, and a `stop` aborts it
 * synchronously so
 * the PowerShell child is killed at once. Replies carry `held`, and a takeover/resume is pushed unprompted.
 */

import type {
  ExecutorAction, ExecutorActResult, ExecutorContext, ExecutorObservation, ExecutorTarget,
} from './computer-use-executor.ts'

/** The message tag shared with the host child. */
export const PERSONA_COMPUTER_USE_IPC = 'persona-computer-use'

/** At most this many calls in flight; more is refused with `busy`. */
export const MAX_IN_FLIGHT = 8
const MAX_TEXT = 10_000
const MAX_ID = 256

type Op = 'observe' | 'act' | 'screenshot' | 'click' | 'type'
const OPS: readonly string[] = ['observe', 'act', 'screenshot', 'click', 'type']

/** What the bridge needs from the executor (`createExecutor*` of computer-use-executor.ts) and from the child channel. */
export interface MainBridgeDeps {
  readonly observer: { observe(context?: ExecutorContext): Promise<ExecutorObservation> }
  readonly actPort: { act(action: ExecutorAction, context?: ExecutorContext): Promise<ExecutorActResult> }
  readonly mcp: {
    held(): boolean
    screenshot(context?: ExecutorContext): Promise<string>
    click(x: number, y: number, context?: ExecutorContext): Promise<string>
    type(text: string, context?: ExecutorContext): Promise<string>
  }
  /** Sends to the host child (a no-op when it is gone). */
  readonly send: (message: unknown) => void
  /**
   * A run is seen for the first time: open its overlay / register it with the human-control state (`control.begin(personaId ?? runId)`).
   * `personaId` is the persona the run belongs to when the host sent it (the cursor shows her face and name).
   */
  readonly begin?: (runId: string, personaId?: string) => void
  /** No call has been in flight for `idleMs`: the runs are over; close the overlay and give the Devolver shortcut back (`release()`). */
  readonly idle?: () => void
  /** Default 30 s. */
  readonly idleMs?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function parseTarget(value: unknown): ExecutorTarget | undefined | 'invalid' {
  if (value === undefined) return undefined
  if (!isRecord(value)) return 'invalid'
  const { windowHandle, processId, title } = value
  if (typeof windowHandle !== 'string' || !/^[0-9]{1,20}$/u.test(windowHandle.trim())) return 'invalid'
  if (typeof processId !== 'number' || !Number.isSafeInteger(processId) || processId <= 0) return 'invalid'
  if (title !== undefined && (typeof title !== 'string' || title.length > 512)) return 'invalid'
  return { windowHandle: windowHandle.trim(), processId, ...(title === undefined ? {} : { title }) }
}

function parseAction(value: unknown): ExecutorAction | undefined {
  if (!isRecord(value)) return undefined
  switch (value.kind) {
    case 'click': return typeof value.target === 'string' && value.target.length <= MAX_ID && finite(value.x) && finite(value.y)
      ? { kind: 'click', target: value.target, x: value.x, y: value.y } : undefined
    case 'type': return typeof value.target === 'string' && value.target.length <= MAX_ID && typeof value.text === 'string' && value.text.length <= MAX_TEXT
      ? { kind: 'type', target: value.target, text: value.text } : undefined
    case 'key': return typeof value.key === 'string' && value.key.length <= 64 ? { kind: 'key', key: value.key } : undefined
    case 'scroll': return finite(value.dx) && finite(value.dy) ? { kind: 'scroll', dx: value.dx, dy: value.dy } : undefined
    case 'wait': return finite(value.ms) ? { kind: 'wait', ms: value.ms } : undefined
    default: return undefined
  }
}

interface InFlight { readonly controller: AbortController; readonly runId: string | undefined }

/**
 * @param deps - The executor and the child channel.
 * @returns `handle` (true when the message was a computer-use message, consumed), `notifyHeld`, and `abortAll`.
 */
export function createComputerUseMainBridge(deps: MainBridgeDeps): {
  handle(message: unknown): boolean
  notifyHeld(held: boolean): void
  abortAll(): void
  inFlight(): number
} {
  const inFlight = new Map<number, InFlight>()
  const seenRuns = new Set<string>()
  let lastHeld: boolean | undefined
  let idleTimer: ReturnType<typeof setTimeout> | undefined

  const armIdle = (): void => {
    clearTimeout(idleTimer)
    if (inFlight.size > 0) return
    idleTimer = setTimeout(() => { seenRuns.clear(); deps.idle?.() }, deps.idleMs ?? 30_000)
    idleTimer.unref()
  }

  const reply = (requestId: number, op: Op, body: Record<string, unknown>): void => {
    deps.send({ type: PERSONA_COMPUTER_USE_IPC, requestId, op, held: deps.mcp.held(), ...body })
  }

  const abortWhere = (match: (entry: InFlight, requestId: number) => boolean): void => {
    for (const [requestId, entry] of [...inFlight.entries()]) if (match(entry, requestId)) entry.controller.abort()
  }

  return {
    handle(message) {
      if (!isRecord(message) || message.type !== PERSONA_COMPUTER_USE_IPC) return false
      if (message.op === 'stop') {
        const runId = typeof message.runId === 'string' ? message.runId : undefined
        const requestId = typeof message.requestId === 'number' ? message.requestId : undefined
        abortWhere((entry, id) => (requestId !== undefined && id === requestId) || (runId !== undefined && entry.runId === runId))
        return true
      }
      if (message.op === 'end') {
        // The host closed a run: no reply. When no run is left the overlay and the Devolver shortcut go now (the idle timer is only the
        // net).
        if (typeof message.runId === 'string' && seenRuns.delete(message.runId) && seenRuns.size === 0 && inFlight.size === 0) {
          clearTimeout(idleTimer)
          deps.idle?.()
        }
        return true
      }
      const requestId = message.requestId
      if (typeof requestId !== 'number' || !Number.isSafeInteger(requestId) || requestId <= 0) return true // nothing to answer
      const op = typeof message.op === 'string' && OPS.includes(message.op) ? message.op as Op : undefined
      if (op === undefined) { reply(requestId, 'observe', { error: 'bad-request' }); return true }
      const target = parseTarget(message.target)
      const runId = typeof message.runId === 'string' && message.runId.length <= MAX_ID ? message.runId : undefined
      const personaId = typeof message.personaId === 'string' && message.personaId.length <= MAX_ID ? message.personaId : undefined
      if (target === 'invalid' || (message.runId !== undefined && runId === undefined) || (message.personaId !== undefined && personaId === undefined) || inFlight.has(requestId)) {
        reply(requestId, op, { error: 'bad-request' })
        return true
      }
      if (inFlight.size >= MAX_IN_FLIGHT) { reply(requestId, op, { error: 'busy' }); return true }

      let run: ((context: ExecutorContext) => Promise<Record<string, unknown>>) | undefined
      if (op === 'observe') run = async context => ({ observation: await deps.observer.observe(context) })
      else if (op === 'screenshot') run = async context => ({ content: await deps.mcp.screenshot(context) })
      else if (op === 'act') {
        const action = parseAction(message.action)
        if (action !== undefined) run = async context => ({ result: await deps.actPort.act(action, context) })
      } else if (op === 'click') {
        if (finite(message.x) && finite(message.y)) {
          const x = message.x
          const y = message.y
          run = async context => ({ content: await deps.mcp.click(x, y, context) })
        }
      } else if (typeof message.text === 'string' && message.text.length <= MAX_TEXT) {
        const text = message.text
        run = async context => ({ content: await deps.mcp.type(text, context) })
      }
      if (run === undefined) { reply(requestId, op, { error: 'bad-request' }); return true }

      clearTimeout(idleTimer)
      if (runId !== undefined && !seenRuns.has(runId)) { seenRuns.add(runId); deps.begin?.(runId, personaId) }
      const controller = new AbortController()
      inFlight.set(requestId, { controller, runId })
      const context: ExecutorContext = {
        ...(runId === undefined ? {} : { runId }), ...(personaId === undefined ? {} : { personaId }),
        ...(target === undefined ? {} : { target }), signal: controller.signal,
      }
      void run(context).then(
        (body) => { if (!controller.signal.aborted) reply(requestId, op, body) },
        () => { if (!controller.signal.aborted) reply(requestId, op, { error: 'executor-unavailable' }) },
      ).finally(() => { inFlight.delete(requestId); armIdle() })
      return true
    },
    notifyHeld(held) {
      if (lastHeld === held) return
      lastHeld = held
      deps.send({ type: PERSONA_COMPUTER_USE_IPC, op: 'held', held })
    },
    abortAll() {
      abortWhere(() => true)
      clearTimeout(idleTimer)
      seenRuns.clear()
      deps.idle?.()
    },
    inFlight: () => inFlight.size,
  }
}
