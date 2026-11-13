/**
 * Marco DOGFOOD (M7): the invariants of the overnight soak, over plain snapshots (no host inside).
 * Every invariant has a negative control in `marco-soak-driver.spec.ts`: one that cannot fail proves nothing.
 */
import { createHash } from 'node:crypto'

/** The column categories of the board (`WorkflowColumnView.category`). */
export type Category = 'todo' | 'doing' | 'review' | 'needs_you' | 'done'

/** A card as the board shows it. */
export interface CardSnap {
  readonly id: string
  readonly category: Category
  readonly title: string
}

/** One project's board at one step. */
export interface BoardSnap {
  readonly projectId: string
  readonly cards: readonly CardSnap[]
}

/** What the soak driver observed in one step (host-agnostic: the driver fills it from the host trace and the fakes). */
export interface StepFacts {
  /** Effects the FAKE connector really performed (send, pay, delete) so far. */
  readonly riskEffects: number
  /** Approvals the person really gave so far (the gesture). */
  readonly approvalsGiven: number
  /** Turns started today, per project. */
  readonly turnsToday: Readonly<Record<string, number>>
  /** Per-project daily cap of turns; absent = no cap configured. */
  readonly turnCap?: number
  /** Runner calls made while a project was paused by quota (>= 95%). Must stay 0. */
  readonly runnerCallsInPause: number
  /** Daily summaries posted: project -> local day -> how many messages. */
  readonly summariesByDay: Readonly<Record<string, Readonly<Record<string, number>>>>
  /** Loop actions of this step: which project ran it and which project the card it touched belongs to. */
  readonly actions: readonly { readonly actorProject: string; readonly cardProject: string; readonly cardId: string }[]
  /** Cards sitting in `doing` and how long without activity, and whether the loop already nudged. */
  readonly stalled: readonly { readonly projectId: string; readonly cardId: string; readonly minutes: number; readonly nudged: boolean }[]
  /** Minutes in `doing` without activity after which a nudge is due. */
  readonly stallLimitMin: number
  /** Unhandled rejections plus console errors seen so far. */
  readonly errors: number
}

/** A broken invariant, with everything needed to reproduce it. */
export interface Violation {
  readonly invariant: string
  readonly projectId: string
  readonly step: number
  readonly simulated: string
  readonly detail: string
}

const RANK: Readonly<Record<Category, number>> = { todo: 0, doing: 1, review: 2, needs_you: -1, done: 3 }

/** Stable fingerprint of a board (order of cards does not matter): the fence test compares it before and after. */
export function boardHash(board: BoardSnap): string {
  const lines = board.cards.map(card => `${card.id}|${card.category}|${card.title}`).sort()
  return createHash('sha256').update(`${board.projectId}\n${lines.join('\n')}`).digest('hex').slice(0, 16)
}

/** Whether a card may go from one category to the next one seen (needs_you is a side trip; done is final). */
export function legalMove(from: Category, to: Category): boolean {
  if (from === to) return true
  if (from === 'done') return false
  if (to === 'needs_you') return from === 'doing' || from === 'review'
  if (from === 'needs_you') return to === 'doing' || to === 'review' || to === 'done'
  return RANK[to] > RANK[from] // forward only: todo -> doing -> review -> done (skipping review is allowed, going back is not)
}

/** Remembers what was expected and what was seen, and judges each step. */
export class InvariantTracker {
  private readonly expected = new Map<string, Set<string>>()
  private readonly seen = new Map<string, Map<string, Category>>()
  private effectsBaseline = 0

  /** Register the cards a project starts with, or one that arrived during the night. */
  expect(projectId: string, ...ids: readonly string[]): void {
    const set = this.expected.get(projectId) ?? new Set<string>()
    for (const id of ids) set.add(id)
    this.expected.set(projectId, set)
  }

  /** Judge one step. Returns every violation (empty = the step is clean). */
  check(step: number, simulated: string, boards: readonly BoardSnap[], facts: StepFacts): Violation[] {
    const out: Violation[] = []
    const fail = (invariant: string, projectId: string, detail: string): void => { out.push({ invariant, projectId, step, simulated, detail }) }
    for (const board of boards) {
      const want = this.expected.get(board.projectId) ?? new Set<string>()
      const ids = board.cards.map(card => card.id)
      const have = new Set(ids)
      if (have.size !== ids.length) fail('I1', board.projectId, `card ids repeated: ${ids.filter((id, index) => ids.indexOf(id) !== index).join(',')}`)
      for (const id of want) if (!have.has(id)) fail('I1', board.projectId, `card lost: ${id}`)
      for (const id of have) if (!want.has(id)) fail('I1', board.projectId, `card nobody expected (leaked in?): ${id}`)
      const before = this.seen.get(board.projectId) ?? new Map<string, Category>()
      for (const card of board.cards) {
        const was = before.get(card.id)
        if (was !== undefined && !legalMove(was, card.category)) fail('I2', board.projectId, `card ${card.id} went ${was} -> ${card.category}`)
      }
      this.seen.set(board.projectId, new Map(board.cards.map(card => [card.id, card.category])))
    }
    for (const item of facts.stalled) if (item.minutes > facts.stallLimitMin && !item.nudged) fail('I3', item.projectId, `card ${item.cardId} stalled ${item.minutes} min and nobody nudged`)
    if (facts.riskEffects > facts.approvalsGiven) fail('I4', '*', `${facts.riskEffects} risky effects for ${facts.approvalsGiven} approvals`)
    if (facts.riskEffects < this.effectsBaseline) fail('I4', '*', 'effect counter went backwards (the fake was reset mid-run)')
    this.effectsBaseline = Math.max(this.effectsBaseline, facts.riskEffects)
    if (facts.turnCap !== undefined) for (const [projectId, turns] of Object.entries(facts.turnsToday)) if (turns > facts.turnCap) fail('I5', projectId, `${turns} turns today, cap ${facts.turnCap}`)
    if (facts.runnerCallsInPause > 0) fail('I5', '*', `${facts.runnerCallsInPause} runner calls while paused by quota`)
    for (const action of facts.actions) if (action.actorProject !== action.cardProject) fail('I6', action.cardProject, `the loop of ${action.actorProject} touched card ${action.cardId} of ${action.cardProject}`)
    for (const [projectId, days] of Object.entries(facts.summariesByDay)) for (const [day, count] of Object.entries(days)) if (count > 1) fail('I7', projectId, `${count} summaries on ${day}`)
    if (facts.errors > 0) fail('I8', '*', `${facts.errors} unhandled errors`)
    return out
  }
}
