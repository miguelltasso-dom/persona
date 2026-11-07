/**
 * Map a turn-level OAR runner onto the engine session Runner port.
 */

import type { RunHandle, Runner as TurnRunner, StartTurnInput, TurnToolSet } from '../contract.ts'
import type { DeliverMode, DeliverOptions, Runner, RunnerCapabilities, RunnerEvent, RunnerRole, RunnerStatus } from '../port.ts'
import { prefixOwnerNorms } from '../proactivity/owner-prompt.ts'

export interface OarSessionOptions {
  turn: TurnRunner
  personaId: string
  personaName?: string
  personaTitle?: string
  /** Talk never receives owner-norm / worker wrapping. */
  purpose?: 'talk' | 'task'
  /** OPT-6 / W3: ask the worker for a short final report. Default off (needs a real-model check first). */
  leanReport?: boolean
  model: string
  permissionMode: 'prompt' | 'allow-once' | 'deny'
  now?: () => Date
  /**
   * HT-0: product tools for ONE turn. Called on every delivered turn; the host opens its gateway lease for that assignment and
   * returns tools bound to it (and `close` to release the lease). Absent = the turn has no product tools. Never read from the prompt.
   */
  toolsFor?: (turn: { ticketId: string; assignmentId: string; personaId: string; cwd: string; role: RunnerRole }) => TurnToolSet | undefined
}

interface Live {
  cwd: string
  title: string
  role: RunnerRole
  status: Exclude<RunnerStatus, 'missing'>
  seen: Set<string>
  ticketId: string
  handle?: RunHandle
  ownerNorms: boolean
}

/**
 * Session-port facade over an OAR turn runner (explicit permission required).
 * @param options - turn runner, run identity, and permission mode.
 */
export function createOarSessionRunner(options: OarSessionOptions): Runner {
  const now = options.now ?? (() => new Date())
  const sessions = new Map<string, Live>()
  const listeners = new Set<(event: RunnerEvent) => void>()

  const emit = (type: RunnerEvent['type'], sessionId: string, requestId?: string): void => {
    const event: RunnerEvent = { type, sessionId, at: now().toISOString() }
    if (requestId !== undefined) event.requestId = requestId
    for (const listener of listeners) listener(event)
  }

  const capabilities = (): RunnerCapabilities => ({
    steer: true,
    removeQueued: false,
    reportsInputTaken: true,
    background: false,
    tools: options.turn.capabilities().mcpTools === 'available' ? 'mcp' : 'native',
    resume: options.turn.capabilities().resume,
    // TEAM-5: only a CLI proven to read images says `available`; the host asks this before it attaches one.
    ...(options.turn.capabilities().images === undefined ? {} : { images: options.turn.capabilities().images }),
  })

  return {
    ensureSession: async (id: string, cwd: string, title: string, role: RunnerRole) => {
      const existing = sessions.get(id)
      if (existing !== undefined) {
        existing.cwd = cwd
        existing.title = title
        existing.role = role
        return
      }
      sessions.set(id, { cwd, title, role, status: 'idle', seen: new Set(), ticketId: id.replace(/^worker-/u, ''), ownerNorms: false })
    },
    deliver: async (sessionId: string, requestId: string, text: string, mode: DeliverMode, deliverOptions?: DeliverOptions) => {
      const live = sessions.get(sessionId)
      if (live === undefined) throw new Error(`missing session ${sessionId}`)
      if (live.seen.has(requestId)) return
      live.seen.add(requestId)
      live.status = 'running'
      emit(mode === 'steer' ? 'userTurnStarted' : 'running', sessionId, requestId)
      let prompt = text
      const wrapWorker = options.purpose !== 'talk' && live.role === 'worker'
      if (wrapWorker && !live.ownerNorms) {
        prompt = prefixOwnerNorms(text, {
          id: options.personaId,
          name: options.personaName ?? options.personaId,
          ...(options.personaTitle === undefined ? {} : { title: options.personaTitle }),
        }, options.leanReport === true ? { leanReport: true } : {})
        live.ownerNorms = true
      }
      const input: StartTurnInput = {
        ticketId: live.ticketId,
        assignmentId: requestId,
        personaId: options.personaId,
        cwd: live.cwd,
        prompt,
        model: options.model,
        permissionMode: options.permissionMode,
        // TEAM-5: images of THIS delivery only (never sticky). A refusal comes from start() as ImagesRefusedError and takes the catch below.
        ...(deliverOptions?.images === undefined || deliverOptions.images.length === 0 ? {} : { images: deliverOptions.images }),
      }
      let handle: RunHandle
      let offered: TurnToolSet | undefined
      try {
        // HT-0: the host opens its gateway lease for THIS turn (identity = this assignment) and hands the runner the bound tools.
        offered = options.toolsFor?.({ ticketId: live.ticketId, assignmentId: requestId, personaId: options.personaId, cwd: live.cwd, role: live.role })
        if (offered !== undefined) input.mcpTools = offered
        handle = await options.turn.start(input)
      } catch (error) {
        if (offered?.close !== undefined) {
          try {
            await offered.close()
          } catch (closeError) {
            void closeError
          }
        }
        // The turn never started (e.g. the real-turn cap refused it). Undo the optimistic bookkeeping so a retry of
        // this request is a real attempt, not a silent "already delivered", and the session does not stay "running".
        live.seen.delete(requestId)
        live.status = 'idle'
        emit('idle', sessionId, requestId)
        throw error
      }
      live.handle = handle
      for await (const event of options.turn.stream(handle)) {
        if (event.type === 'ended') break
      }
      live.status = 'idle'
      emit('inputTaken', sessionId, requestId)
      emit('idle', sessionId, requestId)
    },
    cancel: async (sessionId: string, cancelOptions: { keepInbox: boolean }) => {
      const live = sessions.get(sessionId)
      if (live === undefined) return
      if (live.handle !== undefined) await options.turn.cancel(live.handle)
      if (!cancelOptions.keepInbox) live.seen.clear()
      live.status = 'idle'
      emit('idle', sessionId)
    },
    status: (sessionId: string) => sessions.get(sessionId)?.status ?? 'missing',
    whenIdle: async (sessionId: string) => {
      const live = sessions.get(sessionId)
      if (live === undefined || live.status === 'idle') return
    },
    onEvent: (listener: (event: RunnerEvent) => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    capabilities,
  }
}
