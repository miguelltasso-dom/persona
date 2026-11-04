/**
 * Own computer-use loop (wave 3): plan → act → verify (capture + UIA tree) →
 * retry with a limit → report. Ports only — Rivet owns Windows/UIA and MCP;
 * Muse owns overlay/replay UI. Fake ports are the test default.
 */

import { DomainError } from '@deepseek-ai/dsh-persona-core'

/** Pill / frame copy when the human takes the mouse or keyboard. */
export const YOU_TOOK_OVER = 'você assumiu'

const CRED = /(?:sk-|tok-|api[_-]?key|bearer\s|password\s*=)/iu

export interface A11yBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** One UIA (or fake) node. Rivet maps Windows AutomationElement → this. */
export interface A11yNode {
  readonly id: string
  readonly role: string
  readonly name: string
  readonly value?: string
  readonly bounds?: A11yBounds
  readonly children?: readonly A11yNode[]
}

export interface ScreenObservation {
  readonly atMs: number
  readonly captureRef: string
  readonly tree: A11yNode
}

export interface DesktopObservePort {
  /**
   * @returns Screenshot ref plus accessibility tree (live UIA or fake).
   */
  observe(): Promise<ScreenObservation>
}

export type ComputerAction =
  | { readonly kind: 'click'; readonly target: string; readonly x: number; readonly y: number }
  | { readonly kind: 'type'; readonly target: string; readonly text: string }
  | { readonly kind: 'key'; readonly key: string }
  | { readonly kind: 'scroll'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'wait'; readonly ms: number }

export interface ActResult {
  readonly ok: boolean
  readonly detail: string
}

export interface DesktopActPort {
  /**
   * @param action - Trusted step action (already gated).
   * @returns Failure with {@link YOU_TOOK_OVER} if the human grabbed control.
   */
  act(action: ComputerAction): Promise<ActResult>
}

/**
 * Explicit post-condition. `after` is the human sentence
 * ("depois de clicar em Salvar, aparece o toast X"); matchers are machine-checkable.
 */
export interface StepExpectation {
  readonly after: string
  readonly nameIncludes?: string
  readonly role?: string
  readonly valueIncludes?: string
}

export interface ComputerUseStep {
  readonly id: string
  readonly intent: string
  readonly action: ComputerAction
  readonly expectation: StepExpectation
}

export interface ComputerUsePlan {
  readonly goal: string
  readonly personaId: string
  readonly steps: readonly ComputerUseStep[]
}

export type ControlOwner = 'persona' | 'human'
export type ControlReason = 'running' | 'human_input' | 'resumed' | 'paused'

export interface SharedControl {
  readonly owner: ControlOwner
  readonly reason: ControlReason
  readonly message: string
}

export interface SharedControlPort {
  /**
   * @returns Current owner. Rivet updates this on mouse/keyboard.
   */
  snapshot(): SharedControl
}

export type ComputerSensitiveKind = 'computer_act' | 'credentials'

export type PermissionDecision =
  | { readonly decision: 'allow' }
  | { readonly decision: 'deny'; readonly reason: string }
  | { readonly decision: 'ask'; readonly approvalId: string; readonly reason: string }

export interface StepPermissionPort {
  /**
   * Rivet binds this to `McpGateway.call` / `classifySensitive` (`computer_act`).
   * @param input - Step id, action, and sensitive kind.
   */
  request(input: {
    readonly stepId: string
    readonly action: ComputerAction
    readonly kind: ComputerSensitiveKind
  }): Promise<PermissionDecision>
}

export interface ComputerUseLimits {
  readonly maxSteps: number
  readonly maxAttemptsPerStep: number
  readonly maxMs: number
  readonly maxBudgetTokens: number
}

export const DEFAULT_COMPUTER_USE_LIMITS: ComputerUseLimits = {
  maxSteps: 20,
  maxAttemptsPerStep: 3,
  maxMs: 120_000,
  maxBudgetTokens: 8_000,
}

export type ReplayResult =
  | 'verified'
  | 'retry'
  | 'failed'
  | 'paused'
  | 'denied'
  | 'needs_approval'
  | 'limit'

export interface ReplaySaw {
  readonly beforeRef: string
  readonly afterRef: string
  readonly names: readonly string[]
}

export interface ReplayEntry {
  readonly stepId: string
  readonly attempt: number
  readonly atMs: number
  readonly saw: ReplaySaw
  readonly did: ComputerAction | { readonly kind: 'none' }
  readonly expectation: string
  readonly result: ReplayResult
  readonly detail: string
}

export type ComputerUseStatus =
  | 'done'
  | 'failed'
  | 'paused'
  | 'needs_approval'
  | 'denied'
  | 'limit'

export interface ComputerUseReport {
  readonly status: ComputerUseStatus
  readonly message: string
  readonly replay: readonly ReplayEntry[]
  readonly control: SharedControl
  readonly stepsVerified: number
  readonly attempts: number
}

/**
 * @param node - Tree root.
 * @param visit - Called pre-order.
 */
export function walkA11y(node: A11yNode, visit: (n: A11yNode) => void): void {
  visit(node)
  for (const child of node.children ?? []) walkA11y(child, visit)
}

/**
 * @param node - Tree root.
 * @returns Visible names in pre-order (for replay / UI).
 */
export function treeNames(node: A11yNode): string[] {
  const names: string[] = []
  walkA11y(node, (row) => {
    if (row.name !== '') names.push(row.name)
  })
  return names
}

/**
 * @param obs - Capture + tree after the action.
 * @param expectation - Required `after` plus at least one matcher.
 */
export function verifyExpectation(
  obs: ScreenObservation,
  expectation: StepExpectation,
): { ok: boolean; reason: string } {
  let hit: A11yNode | undefined
  walkA11y(obs.tree, (node) => {
    if (hit !== undefined) return
    if (expectation.nameIncludes !== undefined) {
      if (!node.name.toLowerCase().includes(expectation.nameIncludes.toLowerCase())) return
    }
    if (expectation.role !== undefined && node.role !== expectation.role) return
    if (expectation.valueIncludes !== undefined) {
      const value = node.value ?? ''
      if (!value.toLowerCase().includes(expectation.valueIncludes.toLowerCase())) return
    }
    hit = node
  })
  if (hit !== undefined) return { ok: true, reason: expectation.after }
  return { ok: false, reason: `não conferiu: ${expectation.after}` }
}

/**
 * @param action - Planned desktop action.
 * @returns Kind that must pass Rivet's MCP gateway, or omitted for `wait`.
 */
export function classifyComputerAction(action: ComputerAction): ComputerSensitiveKind | undefined {
  if (action.kind === 'wait') return undefined
  if (action.kind === 'type' && CRED.test(action.text)) return 'credentials'
  return 'computer_act'
}

/**
 * @param plan - Trusted plan from the worker.
 */
export function assertComputerUsePlan(plan: ComputerUsePlan): void {
  if (plan.goal.trim() === '' || plan.personaId.trim() === '') {
    throw new DomainError('INVALID_COMPUTER_USE', 'GOAL')
  }
  if (plan.steps.length === 0) throw new DomainError('INVALID_COMPUTER_USE', 'EMPTY')
  for (const step of plan.steps) {
    if (step.id.trim() === '' || step.intent.trim() === '') {
      throw new DomainError('INVALID_COMPUTER_USE', 'STEP')
    }
    if (step.expectation.after.trim() === '') {
      throw new DomainError('INVALID_COMPUTER_USE', 'EXPECTATION')
    }
    if (
      step.expectation.nameIncludes === undefined
      && step.expectation.role === undefined
      && step.expectation.valueIncludes === undefined
    ) {
      throw new DomainError('INVALID_COMPUTER_USE', 'MATCHER')
    }
  }
}

/**
 * Immediate pause. Rivet calls this on any mouse/keyboard while the persona drives.
 * @param _current - Ignored; takeover always wins.
 */
export function noteHumanInput(_current?: SharedControl): SharedControl {
  return { owner: 'human', reason: 'human_input', message: YOU_TOOK_OVER }
}

/**
 * Explicit hand-back only. Never auto-resume.
 * @param _current - Ignored; resume always returns persona ownership.
 */
export function resumeSharedControl(_current?: SharedControl): SharedControl {
  return { owner: 'persona', reason: 'resumed', message: '' }
}

/**
 * @returns Initial persona-owned control.
 */
export function runningControl(): SharedControl {
  return { owner: 'persona', reason: 'running', message: '' }
}

/**
 * In-memory control. Rivet calls `humanTookOver` on any mouse/keyboard; resume is explicit.
 */
export function createMemorySharedControl(): SharedControlPort & {
  humanTookOver(): SharedControl
  resume(): SharedControl
} {
  let state = runningControl()
  return {
    snapshot: () => state,
    humanTookOver: () => {
      state = noteHumanInput(state)
      return state
    },
    resume: () => {
      state = resumeSharedControl(state)
      return state
    },
  }
}

/**
 * @param script - Observations in call order; last row repeats.
 */
export function fakeObservePort(script: readonly ScreenObservation[]): DesktopObservePort {
  let index = 0
  return {
    observe() {
      if (script.length === 0) throw new DomainError('INVALID_COMPUTER_USE', 'EMPTY_OBSERVE')
      const row = script[Math.min(index, script.length - 1)]
      if (row === undefined) throw new DomainError('INVALID_COMPUTER_USE', 'EMPTY_OBSERVE')
      index += 1
      return Promise.resolve(row)
    },
  }
}

/**
 * @param handler - Optional scripted result (default ok).
 */
export function fakeActPort(
  handler?: (action: ComputerAction) => ActResult,
): DesktopActPort & { readonly actions: ComputerAction[] } {
  const actions: ComputerAction[] = []
  return {
    actions,
    act(action) {
      actions.push(action)
      return Promise.resolve(handler === undefined ? { ok: true, detail: action.kind } : handler(action))
    },
  }
}

/**
 * @param mode - allow / deny / ask (MCP pending).
 */
export function fakePermissionPort(mode: 'allow' | 'deny' | 'ask'): StepPermissionPort {
  return {
    request(input) {
      if (mode === 'allow') return Promise.resolve({ decision: 'allow' as const })
      if (mode === 'deny') return Promise.resolve({ decision: 'deny' as const, reason: `recusado: ${input.kind}` })
      return Promise.resolve({
        decision: 'ask' as const,
        approvalId: `appr-${input.stepId}`,
        reason: 'Precisa de você',
      })
    },
  }
}

function emptySaw(): ReplaySaw {
  return { beforeRef: '', afterRef: '', names: [] }
}

function sawOf(before: ScreenObservation | undefined, after: ScreenObservation | undefined): ReplaySaw {
  const tree = after?.tree ?? before?.tree
  return {
    beforeRef: before?.captureRef ?? '',
    afterRef: after?.captureRef ?? '',
    names: tree === undefined ? [] : treeNames(tree),
  }
}

function entry(input: {
  readonly stepId: string
  readonly attempt: number
  readonly atMs: number
  readonly saw: ReplaySaw
  readonly did: ComputerAction | { readonly kind: 'none' }
  readonly expectation: string
  readonly result: ReplayResult
  readonly detail: string
}): ReplayEntry {
  return input
}

/**
 * Compact projection the overlay can play back without the live desktop.
 * @param replay - Entries from one run.
 */
export function projectReplayForUi(replay: readonly ReplayEntry[]): readonly ReplayEntry[] {
  return replay.map(row => ({ ...row, saw: { ...row.saw, names: [...row.saw.names] } }))
}

/**
 * Plan → act → verify → retry → report. Stops on human takeover, deny, ask, or limits.
 * @param input - Trusted plan plus ports (fake in tests; Rivet in the desktop).
 */
export async function runComputerUse(input: {
  readonly plan: ComputerUsePlan
  readonly observe: DesktopObservePort
  readonly act: DesktopActPort
  readonly permission: StepPermissionPort
  readonly control: SharedControlPort
  readonly limits?: ComputerUseLimits
  readonly now: () => number
  readonly spendTokens?: (step: ComputerUseStep) => number
}): Promise<ComputerUseReport> {
  assertComputerUsePlan(input.plan)
  const limits = input.limits ?? DEFAULT_COMPUTER_USE_LIMITS
  const replay: ReplayEntry[] = []
  const startedAt = input.now()
  let tokens = 0
  let attempts = 0
  let stepsVerified = 0

  const finish = (status: ComputerUseStatus, message: string): ComputerUseReport => ({
    status,
    message,
    replay,
    control: input.control.snapshot(),
    stepsVerified,
    attempts,
  })

  const hitLimit = (why: string, stepId: string, expectation: string): ComputerUseReport => {
    replay.push(entry({
      stepId,
      attempt: 0,
      atMs: input.now(),
      saw: emptySaw(),
      did: { kind: 'none' },
      expectation,
      result: 'limit',
      detail: why,
    }))
    return finish('limit', why)
  }

  if (input.plan.steps.length > limits.maxSteps) {
    const first = input.plan.steps[0]
    if (first === undefined) throw new DomainError('INVALID_COMPUTER_USE', 'EMPTY')
    return hitLimit(`limite de passos (${String(limits.maxSteps)})`, first.id, input.plan.goal)
  }

  for (const step of input.plan.steps) {
    if (input.now() - startedAt >= limits.maxMs) {
      return hitLimit(`limite de tempo (${String(limits.maxMs)}ms)`, step.id, step.expectation.after)
    }
    const cost = input.spendTokens === undefined ? 1 : input.spendTokens(step)
    if (tokens + cost > limits.maxBudgetTokens) {
      return hitLimit(`limite de orçamento (${String(limits.maxBudgetTokens)})`, step.id, step.expectation.after)
    }

    if (input.control.snapshot().owner === 'human') {
      replay.push(entry({
        stepId: step.id,
        attempt: 0,
        atMs: input.now(),
        saw: emptySaw(),
        did: { kind: 'none' },
        expectation: step.expectation.after,
        result: 'paused',
        detail: YOU_TOOK_OVER,
      }))
      return finish('paused', YOU_TOOK_OVER)
    }

    const kind = classifyComputerAction(step.action)
    if (kind !== undefined) {
      const gate = await input.permission.request({ stepId: step.id, action: step.action, kind })
      if (gate.decision === 'deny') {
        replay.push(entry({
          stepId: step.id,
          attempt: 0,
          atMs: input.now(),
          saw: emptySaw(),
          did: { kind: 'none' },
          expectation: step.expectation.after,
          result: 'denied',
          detail: gate.reason,
        }))
        return finish('denied', gate.reason)
      }
      if (gate.decision === 'ask') {
        replay.push(entry({
          stepId: step.id,
          attempt: 0,
          atMs: input.now(),
          saw: emptySaw(),
          did: { kind: 'none' },
          expectation: step.expectation.after,
          result: 'needs_approval',
          detail: gate.reason,
        }))
        return finish('needs_approval', gate.reason)
      }
    }

    const before = await input.observe.observe()
    if (input.control.snapshot().owner === 'human') {
      replay.push(entry({
        stepId: step.id,
        attempt: 0,
        atMs: input.now(),
        saw: sawOf(before, undefined),
        did: { kind: 'none' },
        expectation: step.expectation.after,
        result: 'paused',
        detail: YOU_TOOK_OVER,
      }))
      return finish('paused', YOU_TOOK_OVER)
    }

    let verified = false
    for (let attempt = 1; attempt <= limits.maxAttemptsPerStep; attempt += 1) {
      if (input.now() - startedAt >= limits.maxMs) {
        return hitLimit(`limite de tempo (${String(limits.maxMs)}ms)`, step.id, step.expectation.after)
      }
      if (input.control.snapshot().owner === 'human') {
        replay.push(entry({
          stepId: step.id,
          attempt,
          atMs: input.now(),
          saw: sawOf(before, undefined),
          did: { kind: 'none' },
          expectation: step.expectation.after,
          result: 'paused',
          detail: YOU_TOOK_OVER,
        }))
        return finish('paused', YOU_TOOK_OVER)
      }

      attempts += 1
      tokens += cost
      const acted = await input.act.act(step.action)
      if (!acted.ok && acted.detail.includes(YOU_TOOK_OVER)) {
        replay.push(entry({
          stepId: step.id,
          attempt,
          atMs: input.now(),
          saw: sawOf(before, undefined),
          did: step.action,
          expectation: step.expectation.after,
          result: 'paused',
          detail: YOU_TOOK_OVER,
        }))
        return finish('paused', YOU_TOOK_OVER)
      }

      const after = await input.observe.observe()
      const check = verifyExpectation(after, step.expectation)
      if (check.ok) {
        replay.push(entry({
          stepId: step.id,
          attempt,
          atMs: input.now(),
          saw: sawOf(before, after),
          did: step.action,
          expectation: step.expectation.after,
          result: 'verified',
          detail: check.reason,
        }))
        verified = true
        stepsVerified += 1
        break
      }
      const last = attempt >= limits.maxAttemptsPerStep
      replay.push(entry({
        stepId: step.id,
        attempt,
        atMs: input.now(),
        saw: sawOf(before, after),
        did: step.action,
        expectation: step.expectation.after,
        result: last ? 'failed' : 'retry',
        detail: check.reason,
      }))
      if (last) return finish('failed', check.reason)
    }
    if (!verified) return finish('failed', step.expectation.after)
  }

  return finish('done', input.plan.goal)
}
