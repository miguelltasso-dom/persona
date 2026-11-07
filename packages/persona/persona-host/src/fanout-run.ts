/**
 * CV-8: runs a fan-out. One message of the person becomes ONE typed line per persona consulted (D-079: nobody is left without a
 * line). Everything that touches the world is injected, so this is testable without a model, a clock or the store:
 *  - `gateOf` says who is paused / at the limit (no call is made for those, they still get their line);
 *  - `ask` is ONE answer-only conversation turn of a persona;
 *  - `pick` is the Coordenação's single call for "Quem tiver algo a dizer";
 *  - `post` writes one line.
 * The calls run through a small pool (`concurrency`): thirty personas never mean thirty calls at once.
 */

import { classifyFanoutAnswer, fanoutPrompt, parseRelevant, planFanout, relevancePrompt, type FanoutGate, type FanoutKind, type FanoutSource, type RosterEntry } from './fanout-plan.ts'

/** What the line says; `failed` is the honest state of a turn that threw or came back empty. */
export type FanoutLineKind = FanoutKind | 'failed'

/** One typed line of the block. */
export interface FanoutLine<P> {
  readonly fanoutId: string
  readonly source: FanoutSource
  readonly persona: P
  readonly kind: FanoutLineKind
  /** 1-based position and the size of the block. */
  readonly index: number
  readonly total: number
  /** The persona's words (`reply`). */
  readonly text?: string
  /** When the limit lifts (`limit`). */
  readonly until?: string
  /** Safe sentence for `failed`. */
  readonly message?: string
  /** "Quem tiver algo a dizer" and nobody was picked: the one line of the Coordenação. */
  readonly nobody?: true
}

export interface FanoutDeps<P extends { readonly name: string; readonly title: string }> {
  gateOf(persona: P): FanoutGate
  ask(persona: P, prompt: string): Promise<string>
  /** The Coordenação's pick (only for `source: 'relevant'`). */
  pick?(prompt: string): Promise<string>
  post(line: FanoutLine<P>): void
  readonly concurrency?: number
}

export interface FanoutInput<P extends { readonly name: string; readonly title: string }> {
  readonly fanoutId: string
  readonly source: FanoutSource
  readonly personas: readonly P[]
  readonly message: string
  readonly deps: FanoutDeps<P>
  /** "Quem tiver algo a dizer" with nobody picked: this persona (the Coordenação) says so, once. */
  readonly coordination?: P
  /** The instruction each persona gets; defaults to the whole-team prompt. */
  readonly promptOf?: (persona: P, total: number) => string
}

export interface FanoutResult {
  readonly total: number
  readonly counts: Readonly<Record<FanoutLineKind, number>>
  readonly calls: number
}

const MAX_PICK = 5
/** Safe sentences for a `failed` line (the tooltip); the line itself is written by the UI. */
export const FAILED_ERROR = 'Houve um problema ao responder. Tente de novo em instantes.'
export const FAILED_EMPTY = 'A resposta veio vazia. Tente de novo.'

/**
 * Run the fan-out to the end. Never throws for a persona's failure: that becomes its `failed` line.
 * @param input - Audience, message and injected world.
 */
export async function runFanout<P extends { readonly name: string; readonly title: string }>(input: FanoutInput<P>): Promise<FanoutResult> {
  const { deps } = input
  const counts: Record<FanoutLineKind, number> = { reply: 0, nothing: 0, limit: 0, paused: 0, failed: 0 }
  let calls = 0
  let audience = [...input.personas]
  if (input.source === 'relevant') {
    const roster: RosterEntry[] = audience.map(persona => ({ name: persona.name, title: persona.title }))
    let picked: P[] = []
    if (deps.pick !== undefined && roster.length > 0) {
      calls += 1
      try {
        picked = parseRelevant(await deps.pick(relevancePrompt(input.message, roster)), audience, MAX_PICK)
      } catch {
        picked = [] // the pick failed: below, the block says nobody was picked rather than asking thirty personas
      }
    }
    audience = picked
    if (audience.length === 0 && input.coordination !== undefined) {
      deps.post({ fanoutId: input.fanoutId, source: input.source, persona: input.coordination, kind: 'nothing', index: 1, total: 1, nobody: true })
      counts.nothing += 1
      return { total: 1, counts, calls }
    }
  }
  const total = audience.length
  const steps = planFanout(audience, deps.gateOf)
  const emit = (index: number, line: Omit<FanoutLine<P>, 'fanoutId' | 'source' | 'index' | 'total'>): void => {
    counts[line.kind] += 1
    deps.post({ fanoutId: input.fanoutId, source: input.source, index, total, ...line })
  }
  const work: Array<() => Promise<void>> = []
  steps.forEach((step, at) => {
    const index = at + 1
    if (step.action === 'paused') { emit(index, { persona: step.persona, kind: 'paused' }); return }
    if (step.action === 'limit') { emit(index, { persona: step.persona, kind: 'limit', ...(step.until === undefined ? {} : { until: step.until }) }); return }
    work.push(async () => {
      calls += 1
      try {
        const answer = classifyFanoutAnswer(await deps.ask(step.persona, input.promptOf === undefined ? fanoutPrompt(input.message, total, input.source) : input.promptOf(step.persona, total)))
        if (answer.kind === 'reply') emit(index, { persona: step.persona, kind: 'reply', text: answer.text })
        else if (answer.kind === 'nothing') emit(index, { persona: step.persona, kind: 'nothing' })
        else emit(index, { persona: step.persona, kind: 'failed', message: FAILED_EMPTY })
      } catch {
        // Never the raw error text (jargon, paths): a fixed, honest sentence. The UI shows it in the tooltip of "{name} não conseguiu responder agora."
        emit(index, { persona: step.persona, kind: 'failed', message: FAILED_ERROR })
      }
    })
  })
  const width = Math.max(1, deps.concurrency ?? 3)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(width, work.length) }, async () => {
    while (next < work.length) {
      const mine = work[next]
      next += 1
      if (mine !== undefined) await mine()
    }
  }))
  return { total, counts, calls }
}
