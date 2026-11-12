/**
 * Runner port (D-040 amended). Defined here; Rivet implements dsh / OAR / fake
 * adapters in persona-runners by importing these types.
 */

/** Session role. The coordinator session must never receive a `bash` tool (D-041). */
export type RunnerRole = 'coordinator' | 'worker' | 'watchdog'

/** How text is handed to an existing session. */
export type DeliverMode = 'queue' | 'steer' | 'inject'

/** Optional background-job control a runner may expose. */
export interface RunnerBackground {
  running: (sessionId: string) => string[]
  untilQuiet: (sessionId: string, untilMs: number) => Promise<void>
  kill: (sessionId: string, reason: string) => Promise<void>
  stopSubagents: (sessionId: string, keepInbox: boolean) => Promise<void>
}

/** An image file of this machine that travels with one delivery (TEAM-5). The runner reads it; the prompt never carries its path or bytes. */
export interface DeliverImage {
  path: string
  mediaType?: string
}

/** Optional per-delivery payload. Additive: a runner that ignores it behaves exactly as before. */
export interface DeliverOptions {
  /** Images for THIS turn only (not sticky). A runner that cannot read images refuses the whole turn in human words. */
  images?: readonly DeliverImage[]
}

/** Capability flags advertised before a turn starts. */
export interface RunnerCapabilities {
  steer: boolean
  removeQueued: boolean
  reportsInputTaken: boolean
  background: boolean
  tools: 'native' | 'mcp'
  resume: boolean
  /** TEAM-5: the turn can carry images the persona really sees. Absent = `unavailable`. */
  images?: 'available' | 'unavailable'
}

export type RunnerEventType = 'idle' | 'running' | 'error' | 'inputTaken' | 'userTurnStarted'

export interface RunnerEvent {
  type: RunnerEventType
  sessionId: string
  at: string
  requestId?: string
  error?: string
}

export type RunnerStatus = 'idle' | 'running' | 'missing'

/**
 * Session-oriented runner used by WorkerSlots and launch/delivery handlers.
 * One session + one cwd per ticket for workers; one long session for coordination.
 */
export interface Runner {
  /**
   * Create or reuse a session.
   * @param id - Session id (`worker-<ticketId>` or the coordinator session).
   * @param cwd - Working directory.
   * @param title - Human title (ticket title or persona name).
   * @param role - Session role; coordinator forbids `bash` (D-041).
   */
  ensureSession(id: string, cwd: string, title: string, role: RunnerRole): Promise<void>
  /**
   * Deliver text. Idempotent on `requestId`: a repeat is a no-op.
   * @param sessionId - Session from {@link ensureSession}.
   * @param requestId - Delivery id (input id, launch id, recovery id).
   * @param text - Prompt or input body.
   * @param mode - `queue` appends, `steer` interrupts, `inject` is silent.
   * @param options - Optional per-delivery payload (images, TEAM-5).
   */
  deliver(sessionId: string, requestId: string, text: string, mode: DeliverMode, options?: DeliverOptions): Promise<void>
  /**
   * Put text into the turn that is open right now, without waiting for it to end.
   * @param sessionId - Session from {@link ensureSession}.
   * @param requestId - Delivery id (the runtime echoes it when it reads the text).
   * @param text - What the person wants to change.
   * @returns `true` when the open turn took it; `false` when no turn is open (the caller sends normally).
   */
  steer?(sessionId: string, requestId: string, text: string): Promise<boolean>
  /**
   * Cancel the current turn.
   * @param sessionId - Session to cancel.
   * @param options - `keepInbox` preserves queued undelivered text.
   */
  cancel(sessionId: string, options: { keepInbox: boolean }): Promise<void>
  /**
   * @param sessionId - Session to inspect.
   * @returns `missing` when {@link ensureSession} has not run.
   */
  status(sessionId: string): RunnerStatus
  /**
   * @param sessionId - Session to wait on.
   */
  whenIdle(sessionId: string): Promise<void>
  /**
   * Subscribe to session lifecycle events.
   * @param listener - Receives idle/running/error/inputTaken/userTurnStarted.
   * @returns Disposer.
   */
  onEvent(listener: (event: RunnerEvent) => void): () => void
  /** Advertised capabilities. */
  capabilities(): RunnerCapabilities
  /** Present when {@link RunnerCapabilities.background} is true. */
  background?: RunnerBackground
}

/** Tools the coordinator session must never receive (D-041). */
export const ROUTER_FORBIDDEN_TOOLS: readonly string[] = ['bash']

/**
 * @param role - Session role.
 * @param tools - Tool names the adapter is about to enable.
 * @returns Tools allowed for that role.
 */
export function toolsForRole(role: RunnerRole, tools: readonly string[]): string[] {
  if (role !== 'coordinator') return [...tools]
  return tools.filter(name => !ROUTER_FORBIDDEN_TOOLS.includes(name))
}

/** Worker session id for a ticket. */
export function workerSessionId(ticketId: string): string {
  return `worker-${ticketId}`
}

/**
 * @param sessionId - Session id.
 * @returns Ticket id when `sessionId` is `worker-<ticketId>`.
 */
export function ticketOfSession(sessionId: string): string | undefined {
  return sessionId.startsWith('worker-') ? sessionId.slice('worker-'.length) : undefined
}
