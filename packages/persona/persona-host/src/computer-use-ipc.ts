/**
 * M9/C3: Host-child IPC proxy for Electron desktop computer-use execution.
 *
 * The engine loop (`runComputerUse`), `ComputerRuns`, and `McpGateway` run in the Node child host
 * (`apps/desktop-host`), while Rivet's Windows UIA + `desktopCapturer` executor runs in Electron main
 * (`apps/desktop`). Never import `electron` here: this bridge communicates exclusively over the parent IPC
 * channel (`process.send` / `process.on('message')`), validates every untrusted reply, keeps a local view of
 * human-hold state, cancels in-flight calls synchronously on `AbortSignal` / `stop(runId)`, and fails closed on
 * disconnect, timeout, or malformed messages.
 */

import {
  STOPPED_COMPUTER_USE,
  isValidComputerUseTarget,
  type A11yBounds,
  type A11yNode,
  type ActResult,
  type ComputerAction,
  type ComputerUseTarget,
  type DesktopActPort,
  type DesktopObservePort,
  type DesktopPortContext,
  type ScreenObservation,
} from '@deepseek-ai/dsh-persona-engine'
import {
  actingPortsFromComputerUse,
  type ActingPorts,
  type ComputerActingContext,
} from '@deepseek-ai/dsh-persona-runners'

/** IPC message `type` tag shared between host child and Electron `DesktopHostProcess`. */
export const PERSONA_COMPUTER_USE_IPC = 'persona-computer-use' as const

/** Bounded deadline per main-process computer-use call (exceeds Rivet's 15 s PowerShell script cap). */
export const COMPUTER_USE_IPC_TIMEOUT_MS = 20_000

const MAX_A11Y_DEPTH = 32
const MAX_A11Y_NODES = 4_000
const EXECUTOR_UNAVAILABLE = 'executor-unavailable'
const STOPPED_ACTING = 'parado a pedido'

/** Supported request operations from host child to Electron main. */
export type ComputerUseIpcRequestOp = 'observe' | 'act' | 'screenshot' | 'click' | 'type'

/** Outbound request envelope sent over Electron child IPC. */
export type ComputerUseIpcRequest =
  | {
    readonly type: typeof PERSONA_COMPUTER_USE_IPC
    readonly requestId: number
    readonly op: 'observe'
    readonly runId?: string
    readonly personaId?: string
    readonly target?: ComputerUseTarget
  }
  | {
    readonly type: typeof PERSONA_COMPUTER_USE_IPC
    readonly requestId: number
    readonly op: 'act'
    readonly action: ComputerAction
    readonly runId?: string
    readonly personaId?: string
    readonly target?: ComputerUseTarget
  }
  | {
    readonly type: typeof PERSONA_COMPUTER_USE_IPC
    readonly requestId: number
    readonly op: 'screenshot'
    readonly runId?: string
    readonly personaId?: string
    readonly target?: ComputerUseTarget
  }
  | {
    readonly type: typeof PERSONA_COMPUTER_USE_IPC
    readonly requestId: number
    readonly op: 'click'
    readonly x: number
    readonly y: number
    readonly runId?: string
    readonly personaId?: string
    readonly target?: ComputerUseTarget
  }
  | {
    readonly type: typeof PERSONA_COMPUTER_USE_IPC
    readonly requestId: number
    readonly op: 'type'
    readonly text: string
    readonly runId?: string
    readonly personaId?: string
    readonly target?: ComputerUseTarget
  }

/** Synchronous cancellation notice from host child to Electron main. */
export interface ComputerUseIpcStop {
  readonly type: typeof PERSONA_COMPUTER_USE_IPC
  readonly op: 'stop'
  readonly runId?: string
  readonly requestId?: number
}

/** Synchronous run-completion notice from host child to Electron main (closes overlay immediately). */
export interface ComputerUseIpcEnd {
  readonly type: typeof PERSONA_COMPUTER_USE_IPC
  readonly op: 'end'
  readonly runId: string
}

/** Human-takeover state notification pushed from Electron main to host child. */
export interface ComputerUseIpcHeldEvent {
  readonly type: typeof PERSONA_COMPUTER_USE_IPC
  readonly op: 'held'
  readonly held: boolean
}

/** Correlated reply from Electron main for an in-flight request. */
export interface ComputerUseIpcReply {
  readonly type: typeof PERSONA_COMPUTER_USE_IPC
  readonly requestId: number
  readonly op: ComputerUseIpcRequestOp
  readonly observation?: ScreenObservation
  readonly result?: ActResult
  readonly content?: string
  readonly held?: boolean
  readonly error?: string
}

/** Minimal IPC transport seam (defaults to Node `process` parent channel in Electron child). */
export interface ComputerUseIpcTransport {
  readonly connected: () => boolean
  readonly send: (message: ComputerUseIpcRequest | ComputerUseIpcStop | ComputerUseIpcEnd) => boolean
  readonly onMessage: (listener: (message: unknown) => void) => () => void
  readonly onDisconnect?: (listener: () => void) => () => void
}

/** Host-side ports and lifecycle control exposed by the IPC bridge. */
export interface ComputerUseIpcBridge {
  readonly observe: DesktopObservePort
  readonly act: DesktopActPort
  readonly acting: ActingPorts
  readonly held: () => boolean
  /** Watch one run signal so aborting it pushes `op: 'stop'` to main even between IPC calls, and remember `personaId` for its requests. */
  readonly watchRun: (runId: string, signal: AbortSignal, personaId?: string) => () => void
  /** Synchronously fail-close all in-flight calls for `runId` and notify Electron main to abort PowerShell/UIA. */
  readonly stop: (runId: string) => void
  /** Notify Electron main that `runId` ended cleanly so the overlay closes without waiting idle timeout. */
  readonly end: (runId: string) => void
  readonly dispose: () => void
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const isRequestOp = (value: unknown): value is ComputerUseIpcRequestOp => (
  value === 'observe' || value === 'act' || value === 'screenshot' || value === 'click' || value === 'type'
)

function parseTarget(value: unknown): ComputerUseTarget | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.windowHandle !== 'string' || typeof value.processId !== 'number') return undefined
  if (value.title !== undefined && typeof value.title !== 'string') return undefined
  const candidate: ComputerUseTarget = {
    windowHandle: value.windowHandle.trim(),
    processId: value.processId,
    ...(value.title === undefined ? {} : { title: value.title }),
  }
  return isValidComputerUseTarget(candidate) ? candidate : undefined
}

function parseBounds(value: unknown): A11yBounds | undefined {
  if (!isRecord(value)) return undefined
  const { x, y, width, height } = value
  if (
    typeof x !== 'number' || !Number.isFinite(x)
    || typeof y !== 'number' || !Number.isFinite(y)
    || typeof width !== 'number' || !Number.isFinite(width)
    || typeof height !== 'number' || !Number.isFinite(height)
  ) return undefined
  return { x, y, width, height }
}

function parseA11yNode(value: unknown, depth: number, counter: { count: number }): A11yNode | undefined {
  if (depth > MAX_A11Y_DEPTH || counter.count >= MAX_A11Y_NODES || !isRecord(value)) return undefined
  if (typeof value.id !== 'string' || typeof value.role !== 'string' || typeof value.name !== 'string') return undefined
  if (value.value !== undefined && typeof value.value !== 'string') return undefined
  let bounds: A11yBounds | undefined
  if (value.bounds !== undefined) {
    bounds = parseBounds(value.bounds)
    if (bounds === undefined) return undefined
  }
  let children: A11yNode[] | undefined
  if (value.children !== undefined) {
    if (!Array.isArray(value.children)) return undefined
    children = []
    for (let i = 0; i < value.children.length; i += 1) {
      const rawChild: unknown = value.children[i]
      const child = parseA11yNode(rawChild, depth + 1, counter)
      if (child === undefined) return undefined
      children.push(child)
    }
  }
  counter.count += 1
  return {
    id: value.id,
    role: value.role,
    name: value.name,
    ...(value.value === undefined ? {} : { value: value.value }),
    ...(bounds === undefined ? {} : { bounds }),
    ...(children === undefined ? {} : { children }),
  }
}

function parseObservation(value: unknown): ScreenObservation | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.atMs !== 'number' || !Number.isFinite(value.atMs) || typeof value.captureRef !== 'string') return undefined
  const tree = parseA11yNode(value.tree, 0, { count: 0 })
  if (tree === undefined) return undefined
  let target: ComputerUseTarget | undefined
  if (value.target !== undefined) {
    target = parseTarget(value.target)
    if (target === undefined) return undefined
  }
  return {
    atMs: value.atMs,
    captureRef: value.captureRef,
    tree,
    ...(target === undefined ? {} : { target }),
  }
}

function parseActResult(value: unknown): ActResult | undefined {
  if (!isRecord(value) || typeof value.ok !== 'boolean' || typeof value.detail !== 'string') return undefined
  return { ok: value.ok, detail: value.detail }
}

/**
 * Validate an inbound reply from Electron main.
 * @param message - Untrusted IPC payload received from parent process.
 * @returns Normalized reply when well-formed, otherwise `undefined`.
 */
export function parseComputerUseIpcReply(message: unknown): ComputerUseIpcReply | undefined {
  if (!isRecord(message) || message.type !== PERSONA_COMPUTER_USE_IPC || !isRequestOp(message.op)) return undefined
  if (typeof message.requestId !== 'number' || !Number.isSafeInteger(message.requestId) || message.requestId <= 0) return undefined
  if (message.held !== undefined && typeof message.held !== 'boolean') return undefined
  if (message.error !== undefined && typeof message.error !== 'string') return undefined
  const observation = message.observation === undefined ? undefined : parseObservation(message.observation)
  if (message.observation !== undefined && observation === undefined) return undefined
  const result = message.result === undefined ? undefined : parseActResult(message.result)
  if (message.result !== undefined && result === undefined) return undefined
  if (message.content !== undefined && typeof message.content !== 'string') return undefined
  return {
    type: PERSONA_COMPUTER_USE_IPC,
    requestId: message.requestId,
    op: message.op,
    ...(observation === undefined ? {} : { observation }),
    ...(result === undefined ? {} : { result }),
    ...(message.content === undefined ? {} : { content: message.content }),
    ...(message.held === undefined ? {} : { held: message.held }),
    ...(message.error === undefined ? {} : { error: message.error }),
  }
}

/** Minimal Node `process`-like parent IPC seam used by {@link createProcessComputerUseTransport}. */
export interface ProcessChannelLike {
  readonly connected?: boolean | undefined
  readonly send?: ((message: unknown, callback: (error: Error | null) => void) => boolean) | undefined
  readonly on: {
    (event: 'message', listener: (message: unknown) => void): unknown
    (event: 'disconnect', listener: () => void): unknown
  }
  readonly off: {
    (event: 'message', listener: (message: unknown) => void): unknown
    (event: 'disconnect', listener: () => void): unknown
  }
}

/**
 * Create a parent-process Node IPC transport for the desktop host child process.
 * @param channel - Node IPC channel (defaults to `process`).
 * @returns Transport backed by `channel.send`, `channel.on('message')`, and `channel.on('disconnect')`.
 */
export function createProcessComputerUseTransport(channel: ProcessChannelLike = process): ComputerUseIpcTransport {
  return {
    connected: () => Boolean(channel.connected && typeof channel.send === 'function'),
    send: (message) => {
      if (!channel.connected || typeof channel.send !== 'function') return false
      try {
        return channel.send(message, (error) => { void error })
      } catch (error) {
        void error
        return false
      }
    },
    onMessage: (listener) => {
      channel.on('message', listener)
      return () => { channel.off('message', listener) }
    },
    onDisconnect: (listener) => {
      channel.on('disconnect', listener)
      return () => { channel.off('disconnect', listener) }
    },
  }
}

interface PendingCall {
  readonly requestId: number
  readonly op: ComputerUseIpcRequestOp
  readonly runId?: string
  readonly resolve: (reply: ComputerUseIpcReply) => void
  readonly failStopped: () => void
  readonly failUnavailable: () => void
}

/**
 * Build the host-child side IPC bridge forwarding `observe`, `act`, `acting` (`screenshot`/`click`/`type`),
 * and `stop` over `DesktopHostProcess` IPC.
 * @param options - Optional transport seam, deadline, clock, and human-hold callback.
 * @returns Host ports (`observe`, `act`, `acting`), synchronous `held()`, `stop(runId)`, and `dispose()`.
 */
export function createComputerUseIpcBridge(options: {
  readonly transport?: ComputerUseIpcTransport
  readonly timeoutMs?: number
  readonly now?: () => number
  readonly onHeldChange?: (held: boolean) => void
} = {}): ComputerUseIpcBridge {
  const transport = options.transport ?? createProcessComputerUseTransport()
  const timeoutMs = options.timeoutMs ?? COMPUTER_USE_IPC_TIMEOUT_MS
  const now = options.now ?? Date.now
  const pending = new Map<number, PendingCall>()
  const runPersonas = new Map<string, string>()
  let seq = 0
  let disposed = false
  let heldState = false

  const normalizeId = (value: unknown): string | undefined => (
    typeof value === 'string' && value.length > 0 && value.length <= 256 ? value : undefined
  )

  const emptyObservation = (): ScreenObservation => ({
    atMs: now(),
    captureRef: 'none',
    tree: { id: 'window', role: 'Window', name: '', children: [] },
  })

  const setHeld = (next: boolean): void => {
    if (heldState === next) return
    heldState = next
    try {
      options.onHeldChange?.(next)
    } catch (error) {
      void error
    }
  }

  const sendStop = (runId: string | undefined, requestId?: number): void => {
    if (disposed || !transport.connected()) return
    transport.send({
      type: PERSONA_COMPUTER_USE_IPC,
      op: 'stop',
      ...(runId === undefined ? {} : { runId }),
      ...(requestId === undefined ? {} : { requestId }),
    })
  }

  const failAllPending = (): void => {
    for (const entry of [...pending.values()]) entry.failUnavailable()
    pending.clear()
  }

  const detachMessage = transport.onMessage((message: unknown) => {
    if (!isRecord(message) || message.type !== PERSONA_COMPUTER_USE_IPC) return
    if (message.op === 'held' && typeof message.held === 'boolean') {
      setHeld(message.held)
      return
    }
    const parsed = parseComputerUseIpcReply(message)
    if (parsed === undefined) {
      if (typeof message.requestId === 'number' && Number.isSafeInteger(message.requestId)) {
        pending.get(message.requestId)?.failUnavailable()
      }
      return
    }
    const entry = pending.get(parsed.requestId)
    if (entry === undefined) return
    if (parsed.held !== undefined) setHeld(parsed.held)
    if (parsed.op !== entry.op || parsed.error !== undefined) {
      entry.failUnavailable()
      return
    }
    entry.resolve(parsed)
  })
  const detachDisconnect = transport.onDisconnect?.(() => {
    failAllPending()
  })

  function invoke<T>(
    op: ComputerUseIpcRequestOp,
    build: (requestId: number) => ComputerUseIpcRequest,
    context: { readonly runId?: string; readonly signal?: AbortSignal } | undefined,
    handlers: {
      readonly onReply: (reply: ComputerUseIpcReply) => T
      readonly stopped: () => T
      readonly unavailable: () => T
    },
  ): Promise<T> {
    if (context?.signal?.aborted === true) return Promise.resolve(handlers.stopped())
    if (disposed || !transport.connected()) return Promise.resolve(handlers.unavailable())
    seq += 1
    const requestId = seq
    return new Promise<T>((resolve) => {
      let settled = false
      const settle = (value: T): void => {
        if (settled) return
        settled = true
        pending.delete(requestId)
        clearTimeout(timer)
        context?.signal?.removeEventListener('abort', onAbort)
        resolve(value)
      }
      const onAbort = (): void => {
        sendStop(context?.runId, requestId)
        settle(handlers.stopped())
      }
      const timer = setTimeout(() => {
        settle(handlers.unavailable())
      }, timeoutMs)
      pending.set(requestId, {
        requestId,
        op,
        ...(context?.runId === undefined ? {} : { runId: context.runId }),
        resolve: (reply) => { settle(handlers.onReply(reply)) },
        failStopped: () => { settle(handlers.stopped()) },
        failUnavailable: () => { settle(handlers.unavailable()) },
      })
      context?.signal?.addEventListener('abort', onAbort, { once: true })
      const ok = transport.send(build(requestId))
      if (!ok) settle(handlers.unavailable())
    })
  }

  const contextFields = (context?: { readonly runId?: string; readonly personaId?: string; readonly target?: ComputerUseTarget }) => {
    const runId = normalizeId(context?.runId)
    const explicitPersonaId = context !== undefined && 'personaId' in context ? normalizeId(context.personaId) : undefined
    const personaId = explicitPersonaId ?? (runId === undefined ? undefined : runPersonas.get(runId))
    const validTarget = context?.target !== undefined && isValidComputerUseTarget(context.target)
      ? context.target
      : undefined
    return {
      ...(runId === undefined ? {} : { runId }),
      ...(personaId === undefined ? {} : { personaId }),
      ...(validTarget === undefined ? {} : { target: validTarget }),
    }
  }

  const observe: DesktopObservePort = {
    observe: (context?: DesktopPortContext) => invoke(
      'observe',
      requestId => ({
        type: PERSONA_COMPUTER_USE_IPC,
        requestId,
        op: 'observe',
        ...contextFields(context),
      }),
      context,
      {
        onReply: reply => reply.observation ?? emptyObservation(),
        stopped: emptyObservation,
        unavailable: emptyObservation,
      },
    ),
  }

  const act: DesktopActPort = {
    act: (action: ComputerAction, context?: DesktopPortContext) => invoke(
      'act',
      requestId => ({
        type: PERSONA_COMPUTER_USE_IPC,
        requestId,
        op: 'act',
        action,
        ...contextFields(context),
      }),
      context,
      {
        onReply: reply => reply.result ?? { ok: false, detail: EXECUTOR_UNAVAILABLE },
        stopped: () => ({ ok: false, detail: STOPPED_COMPUTER_USE }),
        unavailable: () => ({ ok: false, detail: EXECUTOR_UNAVAILABLE }),
      },
    ),
  }

  const acting = actingPortsFromComputerUse({
    held: () => heldState,
    screenshot: (context?: ComputerActingContext) => invoke(
      'screenshot',
      requestId => ({
        type: PERSONA_COMPUTER_USE_IPC,
        requestId,
        op: 'screenshot',
        ...contextFields(context),
      }),
      context,
      {
        onReply: reply => reply.content ?? EXECUTOR_UNAVAILABLE,
        stopped: () => STOPPED_ACTING,
        unavailable: () => EXECUTOR_UNAVAILABLE,
      },
    ),
    click: (x: number, y: number, context?: ComputerActingContext) => {
      if (context?.signal?.aborted === true) return Promise.resolve(STOPPED_ACTING)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return Promise.resolve(EXECUTOR_UNAVAILABLE)
      return invoke(
        'click',
        requestId => ({
          type: PERSONA_COMPUTER_USE_IPC,
          requestId,
          op: 'click',
          x,
          y,
          ...contextFields(context),
        }),
        context,
        {
          onReply: reply => reply.content ?? EXECUTOR_UNAVAILABLE,
          stopped: () => STOPPED_ACTING,
          unavailable: () => EXECUTOR_UNAVAILABLE,
        },
      )
    },
    type: (text: string, context?: ComputerActingContext) => invoke(
      'type',
      requestId => ({
        type: PERSONA_COMPUTER_USE_IPC,
        requestId,
        op: 'type',
        text,
        ...contextFields(context),
      }),
      context,
      {
        onReply: reply => reply.content ?? EXECUTOR_UNAVAILABLE,
        stopped: () => STOPPED_ACTING,
        unavailable: () => EXECUTOR_UNAVAILABLE,
      },
    ),
  })

  const stop = (runId: string): void => {
    runPersonas.delete(runId)
    for (const entry of [...pending.values()]) {
      if (entry.runId === runId) entry.failStopped()
    }
    sendStop(runId)
  }

  const end = (runId: string): void => {
    runPersonas.delete(runId)
    const validRunId = normalizeId(runId)
    if (disposed || validRunId === undefined || !transport.connected()) return
    transport.send({
      type: PERSONA_COMPUTER_USE_IPC,
      op: 'end',
      runId: validRunId,
    })
  }

  const watchRun = (runId: string, signal: AbortSignal, personaId?: string): (() => void) => {
    const validRunId = normalizeId(runId)
    const validPersonaId = normalizeId(personaId)
    if (signal.aborted) {
      stop(runId)
      return () => undefined
    }
    if (validRunId !== undefined && validPersonaId !== undefined) runPersonas.set(validRunId, validPersonaId)
    const onAbort = (): void => { stop(runId) }
    signal.addEventListener('abort', onAbort, { once: true })
    return () => { signal.removeEventListener('abort', onAbort) }
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    runPersonas.clear()
    detachMessage()
    detachDisconnect?.()
    failAllPending()
  }

  return {
    observe,
    act,
    acting,
    held: () => heldState,
    watchRun,
    stop,
    end,
    dispose,
  }
}
