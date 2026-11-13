/**
 * Marco M9 / D-117 (contract: persona-spec/contracts/marco-dogfood-computer-use.md, "A parte do Forge"): the LIFE of a computer run, the part of the loop that enters the cycle without piercing the authority.
 *
 * A run is born from a HUMAN message (never from the board, a routine, an initiative or a hand-off), asks ONE rule before it opens and BEFORE EVERY STEP (Zinc's matrix, through the host's `access`), holds the
 * computer for itself (one persona at a time), and ends in a state the phone reads. Stopping is one synchronous door that never waits for a turn, a slot or the model. Pure: every input is a port.
 */

import { isValidComputerUseTarget, sameComputerUseTarget, type ComputerUseTarget } from '@deepseek-ai/dsh-persona-engine'

/** The states the wire shows (Cobalt K2 + the pauses of Bolt §13 as an attribute + the three the host adds). */
export type ComputerRunState =
  | 'na-fila' | 'preparando' | 'rodando' | 'precisa-de-voce' | 'pausada' | 'parando' | 'parada'
  | 'concluida' | 'falhou' | 'limite' | 'interrompida' | 'expirou'

/** Why a run is paused: the human took the mouse (only the PC gives it back), or nobody is watching on the phone. */
export type PauseKind = 'humano' | 'celular'

/** Where the person asked from. */
export type RunVia = 'pc' | 'phone'

/** Who asks for a run: only the person starts one. */
export type RunOrigin = 'person' | 'quadro' | 'routine' | 'initiative' | 'handoff'

const TERMINAL: ReadonlySet<ComputerRunState> = new Set(['parada', 'concluida', 'falhou', 'limite', 'interrompida', 'expirou'])
const LIVE: ReadonlySet<ComputerRunState> = new Set(['preparando', 'rodando', 'precisa-de-voce', 'pausada', 'parando'])

export interface ComputerRun {
  readonly runId: string
  readonly projectId: string
  readonly personaId: string
  readonly computerId: string
  readonly ticketId: string
  /** The human message the run was born from: its authority. */
  readonly requestEventId: string
  readonly requestedBy: string
  readonly via: RunVia
  readonly state: ComputerRunState
  readonly paused?: PauseKind
  readonly step: number
  readonly startedAt: number
  readonly updatedAt: number
  /** The plain sentence the person reads for a closed run. */
  readonly line?: string
  /** Window target (HWND + PID) bound to this run when scoped to one desktop window. */
  readonly target?: ComputerUseTarget
}

/** What the rule of the host says (Zinc's `ComputerScopeDecision`, through Flint's `computerAccessOf`). */
export type AccessDecision = { readonly allow: true } | { readonly allow: false; readonly reason: string }

export type OpenRefusal = 'computer-needs-person' | 'computer-not-here' | { readonly access: string }

export type StepKind = 'computer_act' | 'credentials'

export type StepDecision = { readonly allow: true; readonly run: ComputerRun } | { readonly allow: false; readonly reason: string; readonly run: ComputerRun | undefined }

/** Outcome of judging whether a desktop window may be targeted (`judgeTargetWindow`). */
export type TargetVerdict = { readonly ok: true } | { readonly ok: false; readonly why: string }

function judgeTarget(
  judge: ((target: ComputerUseTarget) => TargetVerdict) | undefined,
  requireTarget: boolean | undefined,
  target: ComputerUseTarget | undefined,
): TargetVerdict {
  if (judge === undefined) return requireTarget === true ? { ok: false, why: 'no-target-judge' } : { ok: true }
  if (target === undefined) return requireTarget === true ? { ok: false, why: 'no-target' } : { ok: true }
  try {
    return judge(target)
  } catch {
    return { ok: false, why: 'no-target-judge' }
  }
}

/** The ports of the life of a run. */
export interface ComputerRunsDeps {
  readonly now: () => number
  /** The computer this host runs on: the only one it moves. */
  readonly thisComputerId: () => string
  /** Where the persona lives (the home of D-116). */
  readonly homeOf: (personaId: string) => string | undefined
  /** The ONE rule (the host's `computerAccessOf`): read again at every call. */
  readonly access: (personaId: string, commanderId: string) => AccessDecision
  /** The project's load (the admission's `loadOf`): a run in a project at 100% ends at the next step. */
  readonly projectState: (projectId: string) => 'open' | 'reserve' | 'full'
  /** Abort the open turn of the run's runner (the Task's own stop). Called ONCE per stop, synchronously. */
  readonly abort: (run: ComputerRun) => void
  /** Durable memory of the runs. */
  readonly store: { put(run: ComputerRun): void; list(): readonly ComputerRun[] }
  /** Told when a run waiting for the computer gets it (the host starts its Task). */
  readonly onGranted?: (run: ComputerRun) => void
  /** Told on every change (the phone's stream, the trail). */
  readonly onChange?: (run: ComputerRun) => void
  /** How long a paused or approval-waiting run keeps the computer (default 10 min). */
  readonly holdMs?: number
  /** When true, opening a run without a valid target window fails closed (`no-target`). */
  readonly requireTarget?: boolean
  /** Judges whether a chosen/observed window may be controlled (e.g. Rivet's `judgeTargetWindow`). */
  readonly targetVerdict?: (target: ComputerUseTarget) => TargetVerdict
  readonly newId?: () => string
}

/** The runs of this computer. */
export class ComputerRuns {
  private readonly runs = new Map<string, ComputerRun>()
  /** FIFO of the runs waiting for each computer. */
  private readonly queue: string[] = []
  private readonly stopFlag = new Set<string>()
  private readonly controllers = new Map<string, AbortController>()
  private seq = 0

  /** @param deps - The ports. */
  constructor(private readonly deps: ComputerRunsDeps) {
    for (const run of deps.store.list()) {
      this.runs.set(run.runId, run)
      if (!TERMINAL.has(run.state)) this.controllers.set(run.runId, new AbortController())
    }
  }

  /** @returns The run, or `undefined`. */
  get(runId: string): ComputerRun | undefined {
    return this.runs.get(runId)
  }

  /**
   * Per-run cancellation signal aborted synchronously when {@link stop} is called, or when the run fails, expires, or is interrupted on boot.
   * @param runId - The run id.
   * @returns Live or aborted signal for the run, or `undefined` if unknown.
   */
  signalOf(runId: string): AbortSignal | undefined {
    return this.controllers.get(runId)?.signal
  }

  /** @returns The runs that are not closed (what the Stop bar lists). */
  active(): ComputerRun[] {
    return [...this.runs.values()].filter(run => !TERMINAL.has(run.state))
  }

  /**
   * Look up the active (non-terminal) run for a Ticket, or else the most recent closed run for that Ticket.
   * @param ticketId - Ticket id.
   * @returns Matching computer run, or `undefined`.
   */
  byTicket(ticketId: string): ComputerRun | undefined {
    const entries = [...this.runs.values()]
    let latestTerminal: ComputerRun | undefined
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const run = entries[i]
      if (run === undefined || run.ticketId !== ticketId) continue
      if (!TERMINAL.has(run.state)) return run
      latestTerminal ??= run
    }
    return latestTerminal
  }

  /**
   * Open a run. Only a person starts one, only on the computer the persona lives on, only if the rule allows it NOW.
   * @param input - Who, for which persona and request, from where, who asked (`origin`), and optional bound window target.
   * @returns The run (`preparando`, or `na-fila` when another persona has the computer), or why not.
   */
  open(input: Omit<ComputerRun, 'runId' | 'state' | 'step' | 'startedAt' | 'updatedAt' | 'paused' | 'line' | 'computerId'> & { readonly origin: RunOrigin }): { readonly ok: true; readonly run: ComputerRun } | { readonly ok: false; readonly reason: string } {
    if (input.origin !== 'person') return { ok: false, reason: 'computer-needs-person' }
    const computerId = this.deps.thisComputerId()
    if (this.deps.homeOf(input.personaId) !== computerId) return { ok: false, reason: 'computer-not-here' }
    const decision = this.deps.access(input.personaId, input.requestedBy)
    if (!decision.allow) return { ok: false, reason: decision.reason }
    if (input.target !== undefined) {
      if (!isValidComputerUseTarget(input.target)) return { ok: false, reason: 'no-target' }
    } else if (this.deps.requireTarget === true) {
      return { ok: false, reason: 'no-target' }
    }
    const { origin, target: rawTarget, ...rest } = input
    void origin
    const target: ComputerUseTarget | undefined = rawTarget === undefined
      ? undefined
      : {
        windowHandle: rawTarget.windowHandle.trim(),
        processId: rawTarget.processId,
        ...(rawTarget.title === undefined ? {} : { title: rawTarget.title }),
      }
    const targetVerdict = judgeTarget(this.deps.targetVerdict, this.deps.requireTarget, target)
    if (!targetVerdict.ok) return { ok: false, reason: targetVerdict.why }
    const at = this.deps.now()
    this.seq += 1
    const runId = this.deps.newId?.() ?? `run-${String(this.seq)}`
    this.controllers.set(runId, new AbortController())
    const busy = [...this.runs.values()].some(run => run.computerId === computerId && LIVE.has(run.state))
    const run = this.put({
      ...rest,
      ...(target === undefined ? {} : { target }),
      runId,
      computerId,
      state: busy ? 'na-fila' : 'preparando',
      step: 0,
      startedAt: at,
      updatedAt: at,
    })
    if (busy) this.queue.push(run.runId)
    return { ok: true, run }
  }

  /**
   * The gate of EVERY step: nothing acts unless this says so. The rule is read again (the persona may have moved, the computer may have changed kind, the list may have changed).
   * @param runId - The run.
   * @param kind - What the step does (`credentials` never goes by the phone).
   * @param observedTarget - Optional window target reported by the OS before acting; drift closes the run fail-closed.
   * @returns The run advanced one step, or why the step does not happen (the run is closed or paused with the sentence that says why).
   */
  beforeStep(runId: string, kind: StepKind = 'computer_act', observedTarget?: ComputerUseTarget): StepDecision {
    const run = this.runs.get(runId)
    if (run === undefined) return { allow: false, reason: 'run-unknown', run: undefined }
    if (this.stopFlag.has(runId) || run.state === 'parando' || TERMINAL.has(run.state)) return { allow: false, reason: 'run-stopped', run }
    if (run.state === 'pausada' || run.state === 'precisa-de-voce' || run.state === 'na-fila') return { allow: false, reason: 'run-not-running', run }
    if (this.deps.requireTarget === true && observedTarget === undefined) {
      const closed = this.close(run, 'falhou', 'Não consegui confirmar a janela; parei.')
      return { allow: false, reason: 'target-unverified', run: closed }
    }
    if (observedTarget !== undefined && (!isValidComputerUseTarget(observedTarget) || (run.target !== undefined && !sameComputerUseTarget(run.target, observedTarget)))) {
      const closed = this.close(run, 'falhou', 'A janela alvo mudou; parei.')
      return { allow: false, reason: 'outside-window', run: closed }
    }
    if (run.target === undefined && this.deps.requireTarget === true) {
      const closed = this.close(run, 'falhou', 'Falta a janela alvo; parei.')
      return { allow: false, reason: 'no-target', run: closed }
    }
    const targetJudge = judgeTarget(this.deps.targetVerdict, this.deps.requireTarget, observedTarget ?? run.target)
    if (!targetJudge.ok) {
      const line = targetJudge.why === 'no-target-judge' ? 'Não consegui confirmar a janela; parei.' : 'A janela alvo mudou; parei.'
      const closed = this.close(run, 'falhou', line)
      return { allow: false, reason: targetJudge.why, run: closed }
    }
    const decision = this.deps.access(run.personaId, run.requestedBy)
    const moved = this.deps.homeOf(run.personaId) !== run.computerId
    if (!decision.allow || moved) {
      const closed = this.close(run, 'falhou', moved ? 'O computador mudou; parei.' : 'A permissão mudou; parei.')
      return { allow: false, reason: moved || decision.allow ? 'computer-not-here' : decision.reason, run: closed }
    }
    if (this.deps.projectState(run.projectId) === 'full') {
      const closed = this.close(run, 'limite', 'O projeto atingiu o limite de hoje; o último passo já tinha saído.')
      return { allow: false, reason: 'project-full', run: closed }
    }
    if (kind === 'credentials' && run.via === 'phone') return { allow: false, reason: 'pc-only', run }
    return { allow: true, run: this.put({ ...run, state: 'rodando', step: run.step + 1 }) }
  }

  /** @param runId - The run whose approval card waits for the person: it holds the computer, not a slot or a turn. */
  needsApproval(runId: string): ComputerRun | undefined {
    return this.move(runId, run => (run.state === 'rodando' || run.state === 'preparando' ? { ...run, state: 'precisa-de-voce' } : undefined))
  }

  /** @param runId - The run whose card the person approved: it goes on. */
  approved(runId: string): ComputerRun | undefined {
    return this.move(runId, run => (run.state === 'precisa-de-voce' ? { ...run, state: 'rodando' } : undefined))
  }

  /** @param runId - The human took the mouse or the keyboard: it stops at once and only the PC gives it back. */
  humanTookOver(runId: string): ComputerRun | undefined {
    return this.move(runId, run => (LIVE.has(run.state) && run.state !== 'parando' ? { ...run, state: 'pausada', paused: 'humano' } : undefined))
  }

  /** @param runId - A run asked from the phone lost the device that watches it (the leash): it pauses itself. */
  leashLost(runId: string): ComputerRun | undefined {
    return this.move(runId, run => (run.via === 'phone' && (run.state === 'rodando' || run.state === 'preparando' || run.state === 'precisa-de-voce') ? { ...run, state: 'pausada', paused: 'celular' } : undefined))
  }

  /**
   * Give a paused run back. The PC always can; the phone only a pause caused by the phone (the leash) and only with the device back.
   * @param runId - The run.
   * @param from - Where the gesture comes from.
   * @param deviceBack - The phone is watching again (stream reconnected, session rechecked).
   * @returns The run, or why not (`pc-only`).
   */
  resume(runId: string, from: RunVia, deviceBack: boolean = false): { readonly ok: true; readonly run: ComputerRun } | { readonly ok: false; readonly reason: string } {
    const run = this.runs.get(runId)
    if (run === undefined || run.state !== 'pausada') return { ok: false, reason: 'run-not-paused' }
    if (from === 'phone' && (run.paused !== 'celular' || !deviceBack)) return { ok: false, reason: 'pc-only' }
    const { paused, ...rest } = run
    void paused
    return { ok: true, run: this.put({ ...rest, state: 'rodando' }) }
  }

  /**
   * STOP: one synchronous door, outside the project's lane, the slot queue and the model. The next tool call is refused at once; the runner's turn is aborted once; the run is only `parada`
   * when the host confirms the step in flight came back ({@link ComputerRuns.actReturned}) — never by guess. Idempotent. Works whatever the project's load.
   * @param runId - The run.
   * @returns The run as it stands (`parando`, or `parada` at once when it was only waiting).
   */
  stop(runId: string): ComputerRun | undefined {
    const run = this.runs.get(runId)
    if (run === undefined) return undefined
    if (TERMINAL.has(run.state) || run.state === 'parando') return run
    if (run.state === 'na-fila') {
      this.queue.splice(this.queue.indexOf(runId), 1)
      this.abortSignal(runId)
      return this.close(run, 'parada', 'Cancelada antes de começar.')
    }
    this.stopFlag.add(runId)
    const stopping = this.put({ ...run, state: 'parando' })
    this.abortSignal(runId)
    this.deps.abort(stopping)
    return stopping
  }

  /**
   * The host tells that the step in flight came back (or the runner was killed after the grace): only now a stopping run is `parada`.
   * @param runId - The run.
   * @param forced - The runner had to be killed: the line says the last step may already have gone out.
   */
  actReturned(runId: string, forced = false): ComputerRun | undefined {
    const run = this.runs.get(runId)
    if (run === undefined || run.state !== 'parando') return run
    return this.close(run, 'parada', forced ? 'Parada; o último passo já tinha saído.' : 'Parada.')
  }

  /**
   * A run ends.
   * @param runId - The run.
   * @param state - How it ended.
   * @param line - The sentence the person reads.
   */
  finish(runId: string, state: 'concluida' | 'falhou' | 'limite', line: string): ComputerRun | undefined {
    const run = this.runs.get(runId)
    if (run === undefined || TERMINAL.has(run.state)) return run
    return this.close(run, state, line)
  }

  /**
   * A paused or approval-waiting run does not hold the computer forever.
   * @returns The runs that expired.
   */
  sweep(): ComputerRun[] {
    const hold = this.deps.holdMs ?? 10 * 60_000
    const expired = [...this.runs.values()].filter(run => (run.state === 'pausada' || run.state === 'precisa-de-voce') && this.deps.now() - run.updatedAt >= hold)
    return expired.map(run => this.close(run, 'expirou', 'Ficou parada tempo demais; soltei o computador.'))
  }

  /** The host started again: a run that was alive is `interrompida` and NEVER goes on by itself (no mouse moves after a restart). */
  interruptOnBoot(): ComputerRun[] {
    const open = [...this.runs.values()].filter(run => !TERMINAL.has(run.state))
    this.queue.length = 0
    for (const run of open) this.abortSignal(run.runId)
    return open.map(run => this.put({ ...run, state: 'interrompida', line: 'O app fechou no meio; não continuei sozinha. Peça de novo.' }))
  }

  private abortSignal(runId: string): void {
    const controller = this.controllers.get(runId)
    if (controller !== undefined && !controller.signal.aborted) controller.abort()
  }

  private put(run: ComputerRun): ComputerRun {
    const stamped = { ...run, updatedAt: this.deps.now() }
    this.runs.set(stamped.runId, stamped)
    this.deps.store.put(stamped)
    this.deps.onChange?.(stamped)
    return stamped
  }

  private move(runId: string, change: (run: ComputerRun) => ComputerRun | undefined): ComputerRun | undefined {
    const run = this.runs.get(runId)
    if (run === undefined) return undefined
    const next = change(run)
    return next === undefined ? run : this.put(next)
  }

  /** Close a run, let go of the computer and hand it to the next one waiting. */
  private close(run: ComputerRun, state: ComputerRunState, line: string): ComputerRun {
    this.stopFlag.delete(run.runId)
    if (state !== 'concluida') this.abortSignal(run.runId)
    const closed = this.put({ ...run, state, line })
    // a run that only WAITED (cancelled in the queue) never held the computer: nothing to hand over while another run still has it
    if ([...this.runs.values()].some(other => other.computerId === run.computerId && LIVE.has(other.state))) return closed
    const next = this.queue.shift()
    const waiting = next === undefined ? undefined : this.runs.get(next)
    if (waiting !== undefined && waiting.state === 'na-fila') {
      const granted = this.put({ ...waiting, state: 'preparando' })
      this.deps.onGranted?.(granted)
    }
    return closed
  }
}
