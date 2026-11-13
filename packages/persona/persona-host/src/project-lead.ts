/**
 * Marco Dogfood M2: the responsible's loop. One `step` per project per cycle (called by the host scheduler's cycle — no timer of its own, no `Date.now`): gates → chase → pull (+ distribute) → day summary.
 * Only the pull starts the model (`drive`); everything else is deterministic and free. ALL state is in the KV (idempotent per cycle, survives a restart); every action is ONE trail line (origin `quadro`).
 * The loop never concludes a card, never grants a connector and never touches another project: it starts Tasks (which stop at the approval card for anything risky) and nudges.
 */

import type { LeadTrail } from './lead-trail.ts'

/** A card of the project's board as the loop reads it. */
export interface LeadCard {
  readonly id: string
  readonly title: string
  /** Board category. The queue is `todo`; `doing` is what can be chased. */
  readonly column: 'todo' | 'doing' | 'review' | 'needs_you' | 'done'
  readonly ownerId?: string
  /** It waits for the PERSON (an approval, an open question, a result to Aplicar/Descartar): the loop leaves it alone. */
  readonly waitsForPerson: boolean
  /** How long a `doing` card has had no progress. */
  readonly stalledMs?: number
}

/** A persona of the team as the loop reads her. */
export interface LeadPersona {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly paused: boolean
  /** Open Tasks she already has (the load). */
  readonly openCount: number
  /** She is inside her own daily budget. */
  readonly budgetLeft: boolean
}

export type LeadGate = 'paused' | 'quiet' | 'no-engine' | 'no-responsible'
export type AdmitAnswer = { readonly ok: true } | { readonly ok: false; readonly why: string; readonly resumeAt?: string }
export type SummaryOutcome = 'not-due' | 'waiting' | 'posted' | 'quiet-day'

/** What the host binds (tests bind fakes). */
export interface LeadPorts {
  /** The host's single clock, in ms. */
  nowMs(): number
  /** The LOCAL day (`AAAA-MM-DD`) of that clock. */
  dayOf(): string
  responsible(projectId: string): { readonly id: string; readonly name: string } | undefined
  /** Why the loop must not act now (pause, silence window, no engine), or undefined. */
  gate(projectId: string): LeadGate | undefined
  cards(projectId: string): readonly LeadCard[]
  personas(projectId: string): readonly LeadPersona[]
  /** The `doing` column is full: pulling would break the WIP. */
  wipFull(projectId: string): boolean
  /** The Forge's question, asked right before a model start, for the very card about to start (the host answers with that card's own key, so the run that follows is not counted twice). */
  admit(projectId: string, ticketId: string): AdmitAnswer
  /** Start the Task for this persona (the ONLY model call). */
  drive(projectId: string, ticketId: string, personaId: string, origin: 'quadro'): void
  /** One deterministic line in the Task's thread, written as the responsible. */
  nudge(projectId: string, ticketId: string, personaId: string, text: string): void
  /** Raise the Task to the person ("Precisa de você"). */
  escalate(projectId: string, ticketId: string): void
  /** The day summary of one LOCAL day (Anvil's composer behind it): is it due, and did it go? */
  summary(projectId: string, dayLocal: string): SummaryOutcome
  /** The screens KV (the loop's whole memory). */
  readonly state: { get<T>(projectId: string, kind: string, id: string): T | undefined; put(projectId: string, kind: string, id: string, value: unknown): void }
}

/** The scheduler's own daily budget of each persona (turns and tokens), handed to the loop on every step: the loop never starts a turn the budget refuses and COUNTS the ones it starts. */
export interface LeadBudget {
  may(personaId: string): boolean
  spend(personaId: string): void
}

/** The default ceiling of cards the loop starts per project per day (the care view shows it as the board's pace). */
export const LEAD_PULLS_PER_DAY = 24

export interface LeadOptions {
  /** A `doing` card with no progress for this long is chased. */
  readonly stallAfterMs: number
  /** Nudges before the card is raised to the person. */
  readonly maxChases: number
  /** Cards the loop starts per project per day. */
  readonly maxPullsPerDay: number
  /** v1.1: also GIVE a card with no owner to the least loaded persona (needs `assignTicket` in the orchestrator, which does not exist yet). Default off: only cards that already have an owner are driven. */
  readonly distribute?: boolean
}

interface ChaseDoc { count: number; lastAt: number; escalated: boolean }

const HOLD_TEXT: Readonly<Record<LeadGate, string>> = {
  paused: 'A equipe está pausada: não puxei nada.',
  quiet: 'Janela de silêncio: o quadro espera até ela acabar.',
  'no-engine': 'Sem motor de IA conectado: o quadro espera.',
  'no-responsible': 'Este projeto ainda não tem time: nada a tocar.',
}

/** @returns The local day before `AAAA-MM-DD` (calendar arithmetic on the date itself: no time zone involved). */
function dayBefore(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10)
}

const fold = (value: string): string => value.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
const wordsOf = (value: string): string[] => fold(value).split(/[^a-z0-9]+/u).filter(word => word.length >= 4)

/** How many words of the card's title are (a stem of) a word of the persona's title. */
function titleScore(card: string, persona: string): number {
  const mine = wordsOf(persona)
  return wordsOf(card).filter(word => mine.some(other => other.startsWith(word.slice(0, 4)) && (other.startsWith(word) || word.startsWith(other.slice(0, Math.max(4, other.length - 1)))))).length
}

export class ProjectLead {
  private readonly ports: LeadPorts
  private readonly trail: LeadTrail
  private readonly options: LeadOptions

  /** @param ports - What the host binds. @param trail - The trail. @param options - Stall window, nudges and the day's ceiling of cards. */
  constructor(ports: LeadPorts, trail: LeadTrail, options: LeadOptions) {
    this.ports = ports
    this.trail = trail
    this.options = options
  }

  /**
   * One cycle of the loop for ONE project.
   * @param projectId - The project.
   * @param budget - The scheduler's daily budget of each persona (absent = only the persona's own `budgetLeft` fact).
   */
  step(projectId: string, budget?: LeadBudget): void {
    this.trail.cycle(projectId)
    const day = this.ports.dayOf()
    this.ports.state.put(projectId, 'lead_active', day, { at: this.ports.nowMs() }) // the loop ran today (even if a gate held it): a day it never ran is not summarized later
    const gate = this.ports.gate(projectId)
    if (gate !== undefined) {
      this.hold(projectId, `gate:${gate}:${day}`, HOLD_TEXT[gate])
      return
    }
    this.chase(projectId, day)
    this.pull(projectId, day, budget)
    this.summarize(projectId, day)
  }

  private hold(projectId: string, key: string, detail: string): void {
    this.trail.record({ kind: 'lead:hold', projectId, detail, key })
  }

  private chase(projectId: string, day: string): void {
    const now = this.ports.nowMs()
    const personas = this.ports.personas(projectId)
    for (const card of this.ports.cards(projectId)) {
      if (card.column !== 'doing') continue
      const doc = this.ports.state.get<ChaseDoc>(projectId, 'lead_chase', card.id)
      if ((card.stalledMs ?? 0) < this.options.stallAfterMs) {
        if (doc !== undefined) this.ports.state.put(projectId, 'lead_chase', card.id, { count: 0, lastAt: 0, escalated: false }) // she moved: the chase starts over later
        continue
      }
      const owner = personas.find(persona => persona.id === card.ownerId)
      if (card.waitsForPerson || owner === undefined || owner.paused || doc?.escalated === true) continue
      try {
        if (doc === undefined || doc.count < this.options.maxChases) {
          const hours = Math.max(1, Math.round((card.stalledMs ?? 0) / 3_600_000))
          this.ports.nudge(projectId, card.id, owner.id, `${owner.name}, o cartão «${card.title}» está parado há ${String(hours)} h. Precisa de algo?`)
          this.ports.state.put(projectId, 'lead_chase', card.id, { count: (doc?.count ?? 0) + 1, lastAt: now, escalated: false })
          this.trail.record({ kind: 'lead:chase', projectId, ticketId: card.id, personaId: owner.id, detail: `Cobrei ${owner.name} pelo cartão «${card.title}»: parado há ${String(hours)} h.` })
        } else if (now - doc.lastAt >= this.options.stallAfterMs) {
          this.ports.escalate(projectId, card.id)
          this.ports.state.put(projectId, 'lead_chase', card.id, { ...doc, escalated: true })
          this.trail.record({ kind: 'lead:escalate', projectId, ticketId: card.id, personaId: owner.id, detail: `O cartão «${card.title}» continua parado: passei para você decidir.` })
        }
      } catch {
        // A chase that failed is never written as done (nothing was said, nothing is counted): ONE honest line a day, and the loop goes on with the next card and the pull.
        this.hold(projectId, `chase-error:${card.id}:${day}`, `Não consegui cobrar o cartão «${card.title}» agora: tento de novo no próximo ciclo.`)
      }
    }
  }

  private pull(projectId: string, day: string, budget: LeadBudget | undefined): void {
    if (this.ports.wipFull(projectId)) return // a full column is normal, not a hold
    const waiting = this.ports.cards(projectId).filter(card => card.column === 'todo' && !card.waitsForPerson && this.ports.state.get<{ day: string }>(projectId, 'lead_pull', card.id)?.day !== day)
    let next: LeadCard | undefined
    let target: { readonly persona: LeadPersona; readonly reason: string } | undefined
    for (const card of waiting) {
      target = this.assignee(projectId, card, budget)
      if (target !== undefined) { next = card; break }
      // v1: the loop drives a card that already has an owner who can work now; one without a usable owner is NOT guessed — it is said once a day and the next card is tried.
      this.hold(projectId, `noowner:${card.id}:${day}`, `O cartão «${card.title}» não tem quem o faça agora: escolha o dono no quadro.`)
    }
    if (next === undefined || target === undefined) return
    const pulled = this.ports.state.get<{ n: number }>(projectId, 'lead_pull_day', day)?.n ?? 0
    if (pulled >= this.options.maxPullsPerDay) {
      this.hold(projectId, `cap:${day}`, `Cheguei ao teto de ${String(this.options.maxPullsPerDay)} cartões por dia: o resto fica para amanhã.`)
      return
    }
    const answer = this.ports.admit(projectId, next.id)
    if (!answer.ok) {
      this.hold(projectId, `admit:${answer.why}:${day}`, `Segurei os cartões novos (${answer.why})${answer.resumeAt === undefined ? '' : `; volto em ${answer.resumeAt}`}.`)
      return
    }
    // The marker comes BEFORE the model start: the authority of the run reads it (a card born from a person's message and pulled at 2 a.m. is the BOARD's run, not the person's).
    this.ports.state.put(projectId, 'lead_pull', next.id, { day, at: this.ports.nowMs() })
    budget?.spend(target.persona.id) // counted BEFORE the start (like the scheduler's own drives): a start that fails still used the day's try
    try {
      this.ports.drive(projectId, next.id, target.persona.id, 'quadro')
    } catch {
      // The start failed: no pull line, no pull counted against the day's ceiling; the marker above keeps the card out of today's loop (tried again tomorrow).
      this.hold(projectId, `drive-error:${next.id}:${day}`, `Não consegui entregar «${next.title}» a ${target.persona.name} agora: tento de novo amanhã.`)
      return
    }
    this.ports.state.put(projectId, 'lead_pull_day', day, { n: pulled + 1 })
    this.trail.record({ kind: 'lead:pull', projectId, ticketId: next.id, personaId: target.persona.id, detail: `Puxei «${next.title}» e entreguei a ${target.persona.name}: ${target.reason}.` })
  }

  private assignee(projectId: string, card: LeadCard, budget: LeadBudget | undefined): { readonly persona: LeadPersona; readonly reason: string } | undefined {
    const personas = this.ports.personas(projectId)
    const usable = (persona: LeadPersona): boolean => !persona.paused && persona.budgetLeft && (budget?.may(persona.id) ?? true)
    const owner = personas.find(persona => persona.id === card.ownerId && usable(persona))
    if (owner !== undefined) return { persona: owner, reason: 'o cartão já era dela' }
    if (this.options.distribute !== true) return undefined // v1: there is no API to give a card to someone else (the Executor chose its owner when it was born)
    const lead = this.ports.responsible(projectId)
    const others = personas.filter(persona => persona.id !== lead?.id && usable(persona))
    const best = others
      .map((persona, order) => ({ persona, order, score: titleScore(card.title, persona.title) }))
      .sort((left, right) => left.persona.openCount - right.persona.openCount || right.score - left.score || left.order - right.order)[0]
    if (best !== undefined) return { persona: best.persona, reason: best.persona.openCount === 0 ? 'estava livre' : 'menor carga' }
    const self = lead === undefined ? undefined : personas.find(persona => persona.id === lead.id && usable(persona)) // the responsible is no exception: paused or out of budget she does not start a turn either
    return self === undefined ? undefined : { persona: self, reason: 'ninguém do time estava livre' }
  }

  /** Today, and yesterday when the loop was active yesterday (a summary held by the silence window past midnight still goes at the end of it). Never an older day: it is not a late summary of two days ago. */
  private summarize(projectId: string, day: string): void {
    const yesterday = dayBefore(day)
    if (this.ports.state.get(projectId, 'lead_active', yesterday) !== undefined) this.summarizeDay(projectId, yesterday)
    this.summarizeDay(projectId, day)
  }

  private summarizeDay(projectId: string, day: string): void {
    if (this.ports.state.get(projectId, 'lead_summary', day) !== undefined) return
    const outcome = this.ports.summary(projectId, day)
    if (outcome === 'posted') {
      this.ports.state.put(projectId, 'lead_summary', day, { at: this.ports.nowMs() })
      this.trail.record({ kind: 'lead:summary', projectId, detail: 'Postei o resumo do dia no canal.', key: `summary:${day}` })
    } else if (outcome === 'quiet-day') {
      this.ports.state.put(projectId, 'lead_summary', day, { at: this.ports.nowMs(), quiet: true })
      this.trail.record({ kind: 'lead:summary', projectId, detail: 'Dia sem movimento: nada a resumir, não postei.', key: `summary:${day}` })
    }
  }
}
