/**
 * "Proposta de {persona}" (P1-9, contracts/task-proposals.md): the daily initiative becomes a visible card with Aceitar ·
 * Agora não, inside PROACTIVITY §6's attention budget. Everything here is pure and deterministic: a proposal comes from an
 * OBSERVED fact (a stuck or stale Ticket, a deadline, a recurring error, an open goal with nothing moving), never from a
 * model and never from thin air. The host stores them, posts the card and creates the Ticket on Aceitar.
 */

import { nearRatio, normalizeRouteText } from './preroute/rules.ts'

/** Language of the words a proposal shows. */
export type ProposalLocale = 'pt' | 'en'

/** What the team observed that is worth proposing. */
export type TaskFactKind = 'blocked' | 'stale' | 'deadline' | 'error' | 'goal'

/** One observed fact. */
export interface TaskFact {
  readonly kind: TaskFactKind
  /** Ticket title, event title or the goal's objective. */
  readonly title: string
  /** `blocked`: the question holding it; `deadline`/`error`: the fact in a line. */
  readonly detail?: string
  /** `stale`: whole days without progress. */
  readonly ageDays?: number
  /** `deadline`: when it is due, already written for the person ("sexta às 14h"). */
  readonly whenLabel?: string
  /** The Ticket the fact is about, when there is one. */
  readonly ticketId?: string
}

/** A proposal the persona may make. */
export interface TaskProposalDraft {
  /** Same fact ⇒ same key (kind + normalized title): the dedupe and “Agora não” memory. */
  readonly key: string
  readonly kind: TaskFactKind
  /** “Posso retomar “Relatório de sexta”?” */
  readonly question: string
  /** One line, only fact. */
  readonly reason: string
  /** What becomes the Ticket when the person accepts (the host addresses it to the persona). */
  readonly request: string
  readonly ticketId?: string
}

/** Work already on the table, for the near-duplicate check. */
export interface ProposalWorkItem {
  readonly title: string
  readonly ticketId?: string
}

/** Per-persona memory of how proposals were received. */
export interface ProposalStats {
  readonly accepted: number
  readonly declined: number
  /** Rolling acceptance (4 samples), starts neutral. */
  readonly rate: number
}

/** A card as the thread shows it. */
export interface ProposalCardPlan<T> {
  readonly kind: 'single' | 'digest'
  readonly items: readonly T[]
}

/** Open proposals a project may have without an answer; also the digest size. */
export const MAX_OPEN_PROPOSALS = 3
/** An unanswered proposal expires after this long (neutral for the acceptance rate). */
export const PROPOSAL_EXPIRES_MS = 3 * 86_400_000
/** “Agora não” silences the same proposal for this long. */
export const PROPOSAL_SNOOZE_MS = 7 * 86_400_000
/** Neutral starting acceptance. */
export const NEUTRAL_RATE = 0.5
/** Title length shown in a question. */
export const PROPOSAL_TITLE_MAX = 60
const DUPLICATE = 0.85
const BLOCKED_REASON_MAX = 90

/** @returns The starting stats of a persona nobody has answered yet. */
export function freshStats(): ProposalStats {
  return { accepted: 0, declined: 0, rate: NEUTRAL_RATE }
}

/**
 * Title as the question shows it: whitespace collapsed, cut at {@link PROPOSAL_TITLE_MAX} with “…”.
 * @param title - Raw title.
 */
export function clipProposalTitle(title: string): string {
  const flat = title.replace(/\s+/gu, ' ').trim()
  return flat.length <= PROPOSAL_TITLE_MAX ? flat : `${flat.slice(0, PROPOSAL_TITLE_MAX - 1).trimEnd()}…`
}

/**
 * Stable key of a fact: the same thing observed tomorrow is the same proposal.
 * @param fact - Observed fact.
 */
export function proposalKey(fact: Pick<TaskFact, 'kind' | 'title'>): string {
  return `${fact.kind}:${normalizeRouteText(fact.title)}`
}

function quoted(title: string): string {
  return `“${clipProposalTitle(title)}”`
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/gu, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}

/**
 * The question a persona asks, in the person's words (TASK-PROPOSAL-SPEC §1).
 * @param fact - Observed fact.
 * @param locale - Language.
 */
export function proposalQuestion(fact: TaskFact, locale: ProposalLocale): string {
  const title = quoted(fact.title)
  const pt = locale === 'pt'
  switch (fact.kind) {
    case 'blocked': return pt ? `Posso destravar ${title}?` : `Can I unblock ${title}?`
    case 'stale': return pt ? `Posso retomar ${title}?` : `Can I pick ${title} back up?`
    case 'deadline': {
      const when = fact.whenLabel?.trim() ?? ''
      if (pt) return when === '' ? `Posso adiantar ${title}?` : `Posso adiantar ${title}? Vence ${when}.`
      return when === '' ? `Can I get ahead on ${title}?` : `Can I get ahead on ${title}? Due ${when}.`
    }
    case 'error': return pt ? `Posso resolver o erro que se repete em ${title}?` : `Can I fix the error that keeps happening in ${title}?`
    case 'goal': return pt ? `Posso dar o próximo passo em ${title}?` : `Can I take the next step on ${title}?`
  }
}

/**
 * The one-line reason, only fact.
 * @param fact - Observed fact.
 * @param locale - Language.
 */
export function proposalReason(fact: TaskFact, locale: ProposalLocale): string {
  const pt = locale === 'pt'
  switch (fact.kind) {
    case 'blocked': {
      const question = clip(fact.detail ?? '', BLOCKED_REASON_MAX)
      return question !== '' ? question : pt ? 'Está esperando uma resposta.' : 'It is waiting for an answer.'
    }
    case 'stale': {
      const days = Math.max(1, Math.floor(fact.ageDays ?? 0))
      if (pt) return days === 1 ? 'Está parado há 1 dia.' : `Está parado há ${String(days)} dias.`
      return days === 1 ? 'It has been stuck for 1 day.' : `It has been stuck for ${String(days)} days.`
    }
    case 'deadline': {
      const line = clip(fact.detail ?? '', BLOCKED_REASON_MAX)
      return line !== '' ? line : pt ? 'O prazo está chegando.' : 'The deadline is coming up.'
    }
    case 'error': {
      const line = clip(fact.detail ?? '', BLOCKED_REASON_MAX)
      return line !== '' ? line : pt ? 'O erro apareceu mais de uma vez.' : 'The error showed up more than once.'
    }
    case 'goal': return pt ? 'O objetivo está aberto e nada está andando.' : 'The goal is open and nothing is moving.'
  }
}

/**
 * The request that becomes a Ticket on Aceitar. Always work (starts with a work verb) and always asks for evidence.
 * @param fact - Observed fact.
 * @param locale - Language.
 */
export function proposalRequest(fact: TaskFact, locale: ProposalLocale): string {
  const title = quoted(fact.title)
  const reason = proposalReason(fact, locale)
  if (locale === 'pt') {
    const head = {
      blocked: `Destrave ${title}`,
      stale: `Retome ${title}`,
      deadline: `Adiante ${title}`,
      error: `Resolva o erro que se repete em ${title}`,
      goal: `Dê o próximo passo em ${title}`,
    }[fact.kind]
    return `${head}. Motivo: ${reason} Faça o que estiver ao seu alcance e relate com evidência; se depender de mim, diga exatamente o que falta.`
  }
  // Heads start with verbs `wantsWork` knows, so the accepted proposal always becomes a Ticket.
  const head = {
    blocked: `Fix the blocker on ${title}`,
    stale: `Review ${title} and get it moving again`,
    deadline: `Plan and deliver ${title} ahead of the deadline`,
    error: `Fix the error that keeps happening in ${title}`,
    goal: `Plan and do the next step on ${title}`,
  }[fact.kind]
  return `${head}. Why: ${reason} Do what you can and report with evidence; if it depends on me, say exactly what is missing.`
}

/** Input of {@link draftTaskProposals}. */
export interface DraftInput {
  readonly facts: readonly TaskFact[]
  /** Open and recent Tickets: a fact whose proposal another open Ticket already covers is dropped. */
  readonly existing: readonly ProposalWorkItem[]
  /** Keys of proposals that are open, or were declined less than {@link PROPOSAL_SNOOZE_MS} ago. */
  readonly silencedKeys?: ReadonlySet<string>
  readonly locale: ProposalLocale
}

/**
 * Facts → proposals. Nothing empty, nothing silenced, nothing another open Ticket (not the fact's own) already covers, no
 * two near-identical in the same set. Order of the facts is kept (the host sorts by what matters most).
 * @param input - Facts and context.
 */
export function draftTaskProposals(input: DraftInput): TaskProposalDraft[] {
  const drafts: TaskProposalDraft[] = []
  const outgoing: string[] = []
  for (const fact of input.facts) {
    if (fact.title.trim() === '') continue
    const key = proposalKey(fact)
    if (input.silencedKeys?.has(key) === true) continue
    const subject = normalizeRouteText(fact.title)
    const covered = input.existing.some(item => (fact.ticketId === undefined || item.ticketId !== fact.ticketId)
      && nearRatio(subject, normalizeRouteText(item.title)) >= DUPLICATE)
    if (covered) continue
    const question = proposalQuestion(fact, input.locale)
    if (outgoing.some(other => nearRatio(normalizeRouteText(question), normalizeRouteText(other)) >= DUPLICATE)) continue
    outgoing.push(question)
    drafts.push({
      key,
      kind: fact.kind,
      question,
      reason: proposalReason(fact, input.locale),
      request: proposalRequest(fact, input.locale),
      ...(fact.ticketId === undefined ? {} : { ticketId: fact.ticketId }),
    })
  }
  return drafts
}

/**
 * The person answered: move the rolling acceptance (4 samples) and count it. Expiring does not count.
 * @param stats - Before.
 * @param accepted - Aceitar (true) or Agora não (false).
 */
export function recordProposalDecision(stats: ProposalStats, accepted: boolean): ProposalStats {
  const samples = 4
  return {
    accepted: stats.accepted + (accepted ? 1 : 0),
    declined: stats.declined + (accepted ? 0 : 1),
    rate: (stats.rate * (samples - 1) + (accepted ? 1 : 0)) / samples,
  }
}

/**
 * Undo of “Agora não” (reopen): puts the stats back as before that decision.
 * @param stats - After the decline.
 * @param before - The stats saved at decision time.
 */
export function revertProposalDecline(stats: ProposalStats, before: ProposalStats): ProposalStats {
  return { accepted: stats.accepted, declined: Math.max(0, stats.declined - 1), rate: before.rate }
}

/**
 * How many proposals a persona may make per day given how they are received. Never zero.
 * @param basePerDay - The autonomy budget.
 * @param rate - Rolling acceptance 0–1.
 */
export function proposalsAllowedPerDay(basePerDay: number, rate: number): number {
  const base = Math.max(1, Math.floor(basePerDay))
  const safe = Math.min(1, Math.max(0, rate))
  if (safe >= 0.5) return base
  if (safe >= 0.25) return Math.max(1, Math.floor(base / 2))
  return 1
}

/**
 * Minimum time between two proposals of the same persona: none while they are welcome, longer when they are not.
 * @param rate - Rolling acceptance 0–1.
 */
export function proposalMinGapMs(rate: number): number {
  const safe = Math.min(1, Math.max(0, rate))
  return safe >= 0.25 ? 0 : Math.round(86_400_000 * (2 - safe))
}

/** Why a proposal may not be offered now. */
export type OfferRefusal = 'budget' | 'gap' | 'open-cap'

/** Input of {@link mayOfferProposal}. */
export interface OfferInput {
  readonly basePerDay: number
  readonly stats: ProposalStats
  /** Proposals this persona already put on a card today. */
  readonly offeredToday: number
  /** When this persona last put one on a card (ISO). */
  readonly lastOfferedAt?: string
  /** Proposals waiting for an answer in the whole project. */
  readonly openInProject: number
  readonly now: string
}

/**
 * The attention budget in one place (PROACTIVITY §6): per-persona daily allowance (shrunk by a low acceptance), the gap a
 * low acceptance asks for, and the cap of open proposals in the project.
 * @param input - Counters and clock.
 */
export function mayOfferProposal(input: OfferInput): { allowed: true } | { allowed: false; why: OfferRefusal } {
  if (input.openInProject >= MAX_OPEN_PROPOSALS) return { allowed: false, why: 'open-cap' }
  if (input.offeredToday >= proposalsAllowedPerDay(input.basePerDay, input.stats.rate)) return { allowed: false, why: 'budget' }
  const gap = proposalMinGapMs(input.stats.rate)
  if (gap > 0 && input.lastOfferedAt !== undefined) {
    const since = Date.parse(input.now) - Date.parse(input.lastOfferedAt)
    if (Number.isFinite(since) && since < gap) return { allowed: false, why: 'gap' }
  }
  return { allowed: true }
}

/**
 * One item is a single card; two or three become ONE digest. Never more than {@link MAX_OPEN_PROPOSALS} (the rest waits).
 * @param items - Proposals to show now, best first.
 */
export function planProposalCard<T>(items: readonly T[]): ProposalCardPlan<T> | undefined {
  const shown = items.slice(0, MAX_OPEN_PROPOSALS)
  if (shown.length === 0) return undefined
  return { kind: shown.length === 1 ? 'single' : 'digest', items: shown }
}

/**
 * Whether an unanswered proposal ran out its time.
 * @param createdAt - When it was offered (ISO).
 * @param now - Clock (ISO).
 */
export function proposalExpired(createdAt: string, now: string): boolean {
  const age = Date.parse(now) - Date.parse(createdAt)
  return Number.isFinite(age) && age >= PROPOSAL_EXPIRES_MS
}

/**
 * Whether a declined proposal is still silenced.
 * @param decidedAt - When “Agora não” was chosen (ISO).
 * @param now - Clock (ISO).
 */
export function snoozeActive(decidedAt: string, now: string): boolean {
  const age = Date.parse(now) - Date.parse(decidedAt)
  return !Number.isFinite(age) || age < PROPOSAL_SNOOZE_MS
}

/**
 * The plain sentence a client that does not know the card still shows (TASK-PROPOSAL-SPEC §5).
 * @param plan - What the card carries.
 * @param locale - Language.
 */
export function proposalPlainText(
  plan: ProposalCardPlan<{ readonly personaName: string; readonly question: string; readonly reason: string }>,
  locale: ProposalLocale,
): string {
  const first = plan.items[0]
  if (plan.kind === 'single' && first !== undefined) {
    return locale === 'pt'
      ? `${first.personaName} sugeriu: ${first.question} (${first.reason})`
      : `${first.personaName} suggested: ${first.question} (${first.reason})`
  }
  const count = String(plan.items.length)
  return locale === 'pt'
    ? `A equipe tem ${count} sugestões para você. Abra a Persona para responder.`
    : `The team has ${count} suggestions for you. Open Persona to reply.`
}
