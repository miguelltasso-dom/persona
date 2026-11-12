/**
 * Map a turn-level OAR runner onto the engine session Runner port.
 *
 * A turn is driven by one `deliver` call (queue) that consumes the runtime stream. A steer ("Direcionar agora") does not
 * start a turn: it goes into the turn that is open, through the runtime's own `steer` (the CLI reads it at its next step).
 * The runtime echoes the input id when it reads it (`inputRead`) and reports it when it drops it (`inputDropped`); a steer
 * accepted but never read goes back to the queue and is delivered as the next turn, so nothing the person wrote is lost.
 */

import type { RunHandle, Runner as TurnRunner, StartTurnInput, TurnMcpServer, TurnToolSet } from '../contract.ts'
import type { AuthorityKind } from '../authority/authority-table.ts'
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
  /**
   * COLHEITA 17: extra MCP servers of ONE turn (the persona's browser, attached to the Chrome of its profile). Called on
   * every delivered turn; absent = none. A CLI with `mcpTools: 'unavailable'` receives none.
   */
  serversFor?: (turn: { ticketId: string; assignmentId: string; personaId: string; cwd: string; role: RunnerRole }) => readonly TurnMcpServer[] | undefined
  /**
   * Carbon P0-03a: who ONE turn acts for (`person`, `routine`, `unattended`), derived by the host from the real origin of the turn's Task. Called on every delivered turn (the runner is warm
   * across Tasks); the answer rides in `StartTurnInput.authority` and arms the runner's own gate. Absent = nothing is said and the gate defaults to `person`.
   */
  authorityFor?: (turn: { ticketId: string; assignmentId: string; personaId: string; cwd: string; role: RunnerRole }) => AuthorityKind | undefined
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
  /** Steers accepted into the turn that is open, by request id (the runtime echoes it back when it reads). */
  steers: Map<string, string>
  /** Steer request ids the runtime echoed as read. */
  read: Set<string>
  /** Steer texts the runtime dropped before reading: they go back to the queue after this turn. */
  dropped: string[]
  /** The person pressed Parar: a dropped steer must not start a turn of its own. */
  cancelled?: boolean
  /** The turn in flight (its queued messages included): what `whenIdle` waits for. */
  turn?: Promise<void>
}

/**
 * The session port plus what the HOST needs to let one go. The engine's `Runner` port has no `dispose` (it is Forge's, and a fake runner has nothing to release);
 * the host finds this one by name when it evicts a warm runner ("Assumir controle", a model or account change, a pause, quitting).
 */
export type OarSessionRunner = Runner & {
  /**
   * Stop what this session runner holds: every open turn is cancelled (the CLI stops calling tools, MCP servers and the browser included), the turn runner is
   * released (the CLI process goes), and no more work is taken. Idempotent. A turn that does not wind down in {@link DISPOSE_SETTLE_MS} does not hold the host.
   */
  dispose(): Promise<void>
}

/** How long a cancelled turn gets to wind down before the turn runner is released anyway: a wedged CLI must not hang the host on quit. */
export const DISPOSE_SETTLE_MS = 3_000

/**
 * Session-port facade over an OAR turn runner (explicit permission required).
 * @param options - turn runner, run identity, and permission mode.
 */
export function createOarSessionRunner(options: OarSessionOptions): OarSessionRunner {
  const now = options.now ?? (() => new Date())
  const sessions = new Map<string, Live>()
  const listeners = new Set<(event: RunnerEvent) => void>()
  /** P0-12: set once by `dispose`; from then on nothing new is started behind the back of whoever dropped this runner. */
  let disposed = false

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

  /**
   * Start one turn and consume it. Steers accepted while it runs are tracked here; the ones the runtime does not read
   * end up in `live.dropped` for the caller to put back in the queue.
   */
  const runTurn = async (
    live: Live,
    sessionId: string,
    requestId: string,
    prompt: string,
    images: readonly { path: string; mediaType?: string }[] | undefined,
  ): Promise<void> => {
    const input: StartTurnInput = {
      ticketId: live.ticketId,
      assignmentId: requestId,
      personaId: options.personaId,
      cwd: live.cwd,
      prompt,
      model: options.model,
      permissionMode: options.permissionMode,
      // TEAM-5: images of THIS delivery only (never sticky). A refusal comes from start() as ImagesRefusedError and takes the catch below.
      ...(images === undefined || images.length === 0 ? {} : { images }),
    }
    let handle: RunHandle
    let offered: TurnToolSet | undefined
    try {
      // HT-0: the host opens its gateway lease for THIS turn (identity = this assignment) and hands the runner the bound tools.
      offered = options.toolsFor?.({ ticketId: live.ticketId, assignmentId: requestId, personaId: options.personaId, cwd: live.cwd, role: live.role })
      if (offered !== undefined) input.mcpTools = offered
      const extra = options.serversFor?.({ ticketId: live.ticketId, assignmentId: requestId, personaId: options.personaId, cwd: live.cwd, role: live.role })
      if (extra !== undefined && extra.length > 0) input.extraMcpServers = extra
      const authority = options.authorityFor?.({ ticketId: live.ticketId, assignmentId: requestId, personaId: options.personaId, cwd: live.cwd, role: live.role })
      if (authority !== undefined) input.authority = authority
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
    if (disposed) {
      // P0-12: the runner was disposed while this turn was still opening (the runtime had not answered `start` yet, so `dispose` had no handle to cancel).
      // The turn opened behind the back of whoever dropped this runner: it is cancelled the moment it has a handle, and never streams.
      delete live.handle
      try {
        await options.turn.cancel(handle)
      } catch (error) {
        void error // the turn runner is released by `dispose` anyway
      }
      return
    }
    live.steers = new Map()
    live.read = new Set()
    for await (const event of options.turn.stream(handle)) {
      if (event.type === 'inputRead') {
        // Read: the steer is consumed and a later drop of the same id must not put it back in the queue.
        live.read.add(event.inputId)
        live.steers.delete(event.inputId)
        continue
      }
      if (event.type === 'inputDropped') {
        const dropped = live.steers.get(event.inputId)
        if (dropped !== undefined) {
          live.dropped.push(dropped)
          live.steers.delete(event.inputId)
        }
      }
      // No early break on `ended`: the runtime may echo (or drop) a steer right after the turn's last report, and that
      // echo is what tells "read" from "unread". The stream itself ends after the turn's pending events.
    }
    delete live.handle
    // Only an EXPLICIT drop hands the text back. A runtime that keeps its own queue reads an accepted steer in the next
    // turn, and "no echo" is not proof of "not read" (OAR's user_message is an acknowledgement, not model consumption).
    live.steers.clear()
    live.read.clear()
  }

  return {
    ensureSession: (id: string, cwd: string, title: string, role: RunnerRole) => {
      if (disposed) return Promise.reject(new Error('session runner disposed'))
      const existing = sessions.get(id)
      if (existing !== undefined) {
        existing.cwd = cwd
        existing.title = title
        existing.role = role
        return Promise.resolve()
      }
      sessions.set(id, {
        cwd, title, role, status: 'idle', seen: new Set(), ticketId: id.replace(/^worker-/u, ''), ownerNorms: false,
        steers: new Map(), read: new Set(), dropped: [], cancelled: false,
      })
      return Promise.resolve()
    },
    deliver: async (sessionId: string, requestId: string, text: string, mode: DeliverMode, deliverOptions?: DeliverOptions) => {
      if (disposed) throw new Error('session runner disposed')
      const live = sessions.get(sessionId)
      if (live === undefined) throw new Error(`missing session ${sessionId}`)
      if (live.seen.has(requestId)) return
      live.seen.add(requestId)
      // A message that arrives while the turn is open goes INTO that turn (the CLI reads it at its next step). It never opens a second
      // turn on a busy session: the runtime would refuse it, the open turn's tools (MCP) would be closed under its feet and the person's text
      // would be lost (S1 P0-06). When the runtime cannot take it now (no `steer`, still opening, refused), it WAITS and runs right after the
      // open turn, in order, as one of the turn's own queued texts.
      const open = (): boolean => live.status === 'running' // read through a call: the turn may end while the steer is awaited
      if (open()) {
        if (live.handle !== undefined && options.turn.steer !== undefined) {
          const accepted = await options.turn.steer(live.handle, requestId, text)
          if (accepted) {
            live.steers.set(requestId, text)
            emit('userTurnStarted', sessionId, requestId)
            return
          }
        }
        // The turn may have ended while the steer was awaited: then this message opens the next one, below. Still open: it waits its turn.
        if (open()) {
          live.dropped.push(text)
          return
        }
      }
      live.status = 'running'
      live.cancelled = false
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
      const drive = async (): Promise<void> => {
        try {
          await runTurn(live, sessionId, requestId, prompt, deliverOptions?.images)
          // What the runtime accepted but never read, and what arrived while it ran and could not be steered, goes to the queue: it is the next
          // turn, in order, unless the person stopped. Parar can arrive while `runTurn` is awaiting the runtime, so the flag is read through a
          // call: TypeScript narrows the property after `live.cancelled = false` above and rejects a direct comparison as having no overlap.
          // Every queued text runs exactly once (a drop removes its id from `steers`, and a requeued text is the turn's own prompt), so the loop
          // is bounded by the person's messages — a cap would silently lose the tail.
          const stopped = (): boolean => live.cancelled === true
          let requeued = 0
          while (live.dropped.length > 0 && !stopped()) {
            const next = live.dropped.shift()
            if (next === undefined) break
            requeued += 1
            await runTurn(live, sessionId, `${requestId}:requeue:${String(requeued)}`, next, undefined)
          }
          live.dropped.length = 0
        } catch (error) {
          // A turn that fails must not leave the session "running" (every later message would wait for a turn that is not there). What was
          // queued behind it stays, and goes after the next turn.
          delete live.handle
          if (live.status === 'running') { // a turn that never started already said so (runTurn)
            live.status = 'idle'
            emit('idle', sessionId, requestId)
          }
          throw error
        }
        live.status = 'idle'
        emit('inputTaken', sessionId, requestId)
        emit('idle', sessionId, requestId)
      }
      const turn = drive()
      live.turn = turn
      try {
        await turn
      } finally {
        if (live.turn === turn) delete live.turn
      }
    },
    steer: async (sessionId: string, requestId: string, text: string): Promise<boolean> => {
      const live = sessions.get(sessionId)
      if (live === undefined || live.handle === undefined || live.status !== 'running') return false
      if (live.seen.has(requestId)) return true
      if (options.turn.steer === undefined) return false
      const accepted = await options.turn.steer(live.handle, requestId, text)
      if (!accepted) return false
      live.seen.add(requestId)
      live.steers.set(requestId, text)
      emit('userTurnStarted', sessionId, requestId)
      return true
    },
    cancel: async (sessionId: string, cancelOptions: { keepInbox: boolean }) => {
      const live = sessions.get(sessionId)
      if (live === undefined) return
      live.cancelled = true
      live.dropped.length = 0
      if (live.handle !== undefined) await options.turn.cancel(live.handle)
      if (!cancelOptions.keepInbox) live.seen.clear()
      delete live.handle
      live.status = 'idle'
      emit('idle', sessionId)
    },
    status: (sessionId: string) => sessions.get(sessionId)?.status ?? 'missing',
    // The turn in flight, queued messages included. A turn that failed is its caller's error, not this wait's.
    whenIdle: async (sessionId: string) => {
      for (let live = sessions.get(sessionId); live?.turn !== undefined; live = sessions.get(sessionId)) {
        await live.turn.catch(() => undefined)
      }
    },
    onEvent: (listener: (event: RunnerEvent) => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    capabilities,
    dispose: async () => {
      if (disposed) return
      disposed = true
      const winding: Promise<unknown>[] = []
      for (const live of sessions.values()) {
        live.cancelled = true // a requeued text must not open a turn of its own
        live.dropped.length = 0
        const handle = live.handle
        delete live.handle
        if (handle !== undefined) {
          winding.push((async () => {
            try {
              await options.turn.cancel(handle)
            } catch (error) {
              void error // the turn runner is released below anyway
            }
          })())
        }
        if (live.turn !== undefined) winding.push(live.turn.catch(() => undefined))
      }
      const deadline = Promise.withResolvers<void>()
      const timer = setTimeout(() => { deadline.resolve() }, DISPOSE_SETTLE_MS)
      timer.unref()
      try {
        await Promise.race([Promise.allSettled(winding), deadline.promise])
      } finally {
        clearTimeout(timer)
      }
      for (const live of sessions.values()) live.status = 'idle'
      try {
        await options.turn.dispose?.() // the CLI process and the MCP servers it carried
      } catch (error) {
        void error // a dispose that fails has nobody left to tell: the runner is already out of the host's warm map
      }
    },
  }
}
