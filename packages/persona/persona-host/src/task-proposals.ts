/**
 * P1-9 “Proposta de {persona}” (contracts/task-proposals.md): the daily initiative of a persona becomes a visible card in
 * #geral with Aceitar · Agora não, inside the attention budget of PROACTIVITY §6.
 *
 * The scheduler talks to this through two calls and nothing else: `offer` (per persona, when its daily initiative is due:
 * records what is worth proposing, never posts) and `flush` (once, at the end of the project's cycle: ONE card — single or
 * digest — for everything recorded). `expire` closes the proposals nobody answered. Persons talk to it through the
 * Remotes `listTaskProposals`, `decideTaskProposal`, `reopenTaskProposal`, `getProposalStats`.
 *
 * Zero model calls: a proposal comes from an OBSERVED fact (a Ticket stuck on a question, a Ticket without progress, a goal
 * with nothing moving), the words come from the engine (`persona-engine/src/task-proposal.ts`).
 */

import {
  MAX_OPEN_PROPOSALS,
  draftTaskProposals,
  freshStats,
  hasPendingDelivery,
  mayOfferProposal,
  planProposalCard,
  proposalExpired,
  proposalPlainText,
  proposalsAllowedPerDay,
  recordProposalDecision,
  revertProposalDecline,
  snoozeActive,
  type ProposalLocale,
  type ProposalStats,
  type TaskFact,
  type TaskProposalDraft,
  type Ticket,
} from '@deepseek-ai/dsh-persona-engine'
import type { EventRepos, ProductRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import { inSilence, type ProactivityHost } from './proactivity.ts'
import type { PostResult, TeamRequest } from './proactivity-scheduler.ts'
import { RemoteFault } from './remote-guard.ts'
import { taskProposalBody } from './task-proposal-wire.ts'
import type { ProposalStatsView, TaskProposalCardView, TaskProposalView } from './types.ts'

const PROPOSAL_KIND = 'task_proposal'
const STATS_KIND = 'proposal_stats'
const DAY_MS = 86_400_000
/** A Ticket is “stale” without progress for this long; a question unanswered for this long is worth a nudge. */
const STALE_MS = 2 * DAY_MS
const BLOCKED_MS = DAY_MS
const FACT_ORDER: Record<TaskFact['kind'], number> = { blocked: 0, stale: 1, deadline: 2, error: 3, goal: 4 }

type Status = 'queued' | 'open' | 'accepted' | 'declined' | 'expired'

/** One stored proposal. */
interface ProposalRecord {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly personaName: string
  readonly key: string
  readonly question: string
  readonly reason: string
  readonly request: string
  readonly status: Status
  readonly createdAt: string
  /** Start of the 3-day clock (moved by a reopen). */
  readonly openedAt: string
  readonly cardId?: string
  readonly decidedAt?: string
  readonly ticketId?: string
  /** Stats before a decline, so Desfazer puts the acceptance back. */
  readonly statsBefore?: ProposalStats
}

/** A persona's stats plus the counters of the day. */
interface StatsDoc extends ProposalStats {
  readonly day?: string
  readonly offeredToday?: number
  readonly lastOfferedAt?: string
}

/** What the scheduler needs (the port it is given). */
export interface TaskProposalPort {
  /** A persona's daily initiative is due: record what is worth proposing. Never posts. @returns How many were recorded. */
  offer(input: { readonly workspaceId: string; readonly projectId: string; readonly personaId: string; readonly nowIso: string; readonly goalObjective?: string }): number
  /** End of the project's cycle: post ONE card for everything recorded. @returns true when a card went out. */
  flush(projectId: string, nowIso: string): boolean
  /** Close the proposals nobody answered in 3 days. */
  expire(projectId: string, nowIso: string): void
  /** HONEST-1: how many proposals are recorded and waiting for the card (so the team's quiet window can say it held the card back). */
  queued?(projectId: string): number
}

/** What the host binds. */
export interface TaskProposalDeps {
  readonly product: Pick<ProductRepos, 'getPersona' | 'listPersonas' | 'listChannels'>
  readonly screens: ScreenRepos
  readonly events: Pick<EventRepos, 'append' | 'has'>
  readonly proactivity: Pick<ProactivityHost, 'getAutonomy'> & { readonly offsetMinutes?: (iso: string) => number }
  readonly orchestration: {
    now(): string
    runtime(projectId: string): { readonly repo: { readonly tickets: { list(): Ticket[] } } }
    /** Where a Task lives (its conversation): a Task born in a private DM is never proposed about in the shared channel. */
    conversationOfTicket?(projectId: string, ticketId: string): { readonly streamKind: 'channel' | 'dm' } | undefined
  }
  /** Goal objective of the project's active sprint, when there is one. */
  readonly activeGoal: (projectId: string) => string | undefined
  /** Posts `@{persona} …` as the person; the pipeline makes it a Ticket (or holds it). */
  readonly postRequest: (request: TeamRequest) => PostResult
  /** The person who decides (the session actor). */
  readonly humanActorId: (workspaceId: string) => string | undefined
  readonly locale?: ProposalLocale
}

/** P1-9 store + rules. */
export class TaskProposalHost implements TaskProposalPort {
  private readonly deps: TaskProposalDeps

  /** @param deps - Host parts. */
  constructor(deps: TaskProposalDeps) {
    this.deps = deps
  }

  private get locale(): ProposalLocale { return this.deps.locale ?? 'pt' }

  // ---- scheduler side -----------------------------------------------------

  offer(input: { readonly workspaceId: string; readonly projectId: string; readonly personaId: string; readonly nowIso: string; readonly goalObjective?: string }): number {
    const { projectId, personaId, nowIso } = input
    const persona = this.deps.product.getPersona(personaId)
    if (persona === undefined || persona.projectId !== projectId) return 0
    const autonomy = this.deps.proactivity.getAutonomy(projectId, personaId)
    if (autonomy.mode !== 'propose') return 0
    if (inSilence(nowIso, autonomy.silenceStart, autonomy.silenceEnd, this.deps.proactivity.offsetMinutes?.(nowIso) ?? 0)) return 0 // the quiet window is the person's (on their wall clock)
    const records = this.records(projectId)
    const live = records.filter(row => row.status === 'queued' || (row.status === 'open' && !proposalExpired(row.openedAt, nowIso)))
    const stats = this.statsOf(personaId, nowIso)
    const gate = mayOfferProposal({
      basePerDay: autonomy.proposalBudget,
      stats,
      offeredToday: stats.offeredToday ?? 0,
      ...(stats.lastOfferedAt === undefined ? {} : { lastOfferedAt: stats.lastOfferedAt }),
      openInProject: live.length,
      now: nowIso,
    })
    if (!gate.allowed) return 0
    const tickets = this.deps.orchestration.runtime(projectId).repo.tickets.list()
    const silenced = new Set(records
      .filter(row => row.status === 'queued' || row.status === 'open'
        || ((row.status === 'declined' || row.status === 'accepted') && snoozeActive(row.decidedAt ?? row.createdAt, nowIso)))
      .map(row => row.key))
    const drafts = draftTaskProposals({
      facts: this.factsOf(projectId, persona, tickets, nowIso, input.goalObjective),
      existing: tickets.filter(ticket => ticket.ended === undefined).map(ticket => ({ title: ticket.title, ticketId: ticket.id })),
      silencedKeys: silenced,
      locale: this.locale,
    })
    const room = Math.min(
      MAX_OPEN_PROPOSALS - live.length,
      proposalsAllowedPerDay(autonomy.proposalBudget, stats.rate) - (stats.offeredToday ?? 0),
    )
    const chosen = drafts.slice(0, Math.max(0, room))
    chosen.forEach((draft, index) => { this.queue(input.workspaceId, projectId, persona.id, persona.name, draft, nowIso, index) })
    return chosen.length
  }

  flush(projectId: string, nowIso: string): boolean {
    const queued = this.records(projectId).filter(row => row.status === 'queued')
    if (queued.length === 0) return false
    const open = this.records(projectId).filter(row => row.status === 'open' && !proposalExpired(row.openedAt, nowIso)).length
    const room = Math.max(0, MAX_OPEN_PROPOSALS - open)
    const plan = planProposalCard(queued.slice(0, room))
    for (const row of queued.slice(room)) this.deps.screens.delete(projectId, PROPOSAL_KIND, row.id) // over the cap: not shown, forgotten
    if (plan === undefined) return false
    const card: TaskProposalCardView = {
      kind: plan.kind,
      items: plan.items.map(row => ({ id: row.id, personaId: row.personaId, personaName: row.personaName, question: row.question, reason: row.reason })),
    }
    const first = plan.items[0]
    if (first === undefined) return false
    const coordination = this.deps.product.listPersonas(projectId).find(persona => persona.systemRoles.includes('coordination'))
    const author = plan.kind === 'single' ? first.personaId : (coordination?.id ?? first.personaId)
    const cardId = `proposal-card:${first.id}`
    const channel = this.deps.product.listChannels(projectId).find(row => row.name === 'geral')?.id ?? 'geral'
    const workspaceId = first.workspaceId
    if (!this.deps.events.has(cardId)) {
      this.deps.events.append({
        id: cardId,
        workspaceId,
        projectId,
        streamKind: 'channel',
        ownerId: channel,
        type: 'message',
        body: taskProposalBody(card, proposalPlainText({ kind: plan.kind, items: card.items }, this.locale)),
        actorId: author,
        subjectId: '',
        occurredAt: nowIso,
      })
    }
    for (const row of plan.items) this.put({ ...row, status: 'open', openedAt: nowIso, cardId })
    for (const personaId of new Set(plan.items.map(row => row.personaId))) {
      const stats = this.statsOf(personaId, nowIso)
      const count = plan.items.filter(row => row.personaId === personaId).length
      this.putStats(personaId, { ...stats, day: nowIso.slice(0, 10), offeredToday: (stats.offeredToday ?? 0) + count, lastOfferedAt: nowIso })
    }
    return true
  }

  queued(projectId: string): number {
    return this.records(projectId).filter(row => row.status === 'queued').length
  }

  expire(projectId: string, nowIso: string): void {
    for (const row of this.records(projectId)) {
      if (row.status === 'open' && proposalExpired(row.openedAt, nowIso)) this.put({ ...row, status: 'expired', decidedAt: nowIso })
    }
  }

  // ---- person side --------------------------------------------------------

  /** @param projectId - Tenant. @returns Everything the person was offered, newest first, with its live state. */
  list(projectId: string): TaskProposalView[] {
    const now = this.deps.orchestration.now()
    const tickets = this.deps.orchestration.runtime(projectId).repo.tickets.list()
    return this.records(projectId)
      .filter(row => row.status !== 'queued' && row.cardId !== undefined)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .map(row => this.viewOf(row, now, tickets))
  }

  /**
   * Aceitar (a Ticket is made) or Agora não (silenced for 7 days). Idempotent: an answered proposal returns its state.
   * @param projectId - Tenant.
   * @param id - Proposal.
   * @param accept - Aceitar or Agora não.
   * @param workspaceId - Workspace of the person.
   */
  decide(workspaceId: string, projectId: string, id: string, accept: boolean): TaskProposalView {
    const now = this.deps.orchestration.now()
    const row = this.require(projectId, id)
    const tickets = (): Ticket[] => this.deps.orchestration.runtime(projectId).repo.tickets.list()
    if (row.status !== 'open') return this.viewOf(row, now, tickets())
    if (proposalExpired(row.openedAt, now)) {
      const expired = { ...row, status: 'expired' as const, decidedAt: now }
      this.put(expired)
      return this.viewOf(expired, now, tickets())
    }
    const stats = this.statsOf(row.personaId, now)
    if (!accept) {
      const declined = { ...row, status: 'declined' as const, decidedAt: now, statsBefore: { accepted: stats.accepted, declined: stats.declined, rate: stats.rate } }
      this.put(declined)
      this.putStats(row.personaId, { ...stats, ...recordProposalDecision(stats, false) })
      return this.viewOf(declined, now, tickets())
    }
    const persona = this.deps.product.getPersona(row.personaId)
    const human = this.deps.humanActorId(workspaceId)
    if (persona === undefined || persona.projectId !== projectId || human === undefined) {
      throw new RemoteFault('conflict', 'Não consegui criar a tarefa agora. Tente de novo.')
    }
    const requestId = `proposal-accept:${row.id}`
    const posted = this.deps.postRequest({
      workspaceId, projectId, id: requestId, actorId: human, personaId: persona.id, kind: 'proposal',
      body: `@${persona.name} ${row.request}`,
    })
    // A request the pipeline held (full project, silence window) is still the person's answer: it is released later.
    if (!posted.ok && !this.deps.events.has(requestId)) {
      throw new RemoteFault('conflict', 'Não consegui criar a tarefa agora. Tente de novo.')
    }
    const accepted = { ...row, status: 'accepted' as const, decidedAt: now, ...(posted.ok ? { ticketId: posted.ticketId } : {}) }
    this.put(accepted)
    this.putStats(row.personaId, { ...stats, ...recordProposalDecision(stats, true) })
    return this.viewOf(accepted, now, tickets())
  }

  /**
   * Desfazer of “Agora não”: only a declined proposal that is still inside its 7 days opens again; the acceptance goes back.
   * @param projectId - Tenant.
   * @param id - Proposal.
   */
  reopen(projectId: string, id: string): TaskProposalView {
    const now = this.deps.orchestration.now()
    const row = this.require(projectId, id)
    const tickets = this.deps.orchestration.runtime(projectId).repo.tickets.list()
    if (row.status !== 'declined' || row.statsBefore === undefined) return this.viewOf(row, now, tickets)
    const stats = this.statsOf(row.personaId, now)
    const { decidedAt: _decidedAt, statsBefore, ...rest } = row
    const reopened: ProposalRecord = { ...rest, status: 'open', openedAt: now }
    this.put(reopened)
    this.putStats(row.personaId, { ...stats, ...revertProposalDecline(stats, statsBefore) })
    return this.viewOf(reopened, now, tickets)
  }

  /** @param projectId - Tenant. @returns How each persona's proposals were received. */
  stats(projectId: string): ProposalStatsView[] {
    return this.deps.product.listPersonas(projectId).map((persona) => {
      const stats = this.deps.screens.get<StatsDoc>(projectId, STATS_KIND, persona.id) ?? freshStats()
      return { personaId: persona.id, personaName: persona.name, accepted: stats.accepted, declined: stats.declined, rate: stats.rate }
    })
  }

  // ---- internals ----------------------------------------------------------

  /** Observed facts, most important first: a question waiting a day, a Ticket without progress, a goal with nothing moving. */
  private factsOf(
    projectId: string,
    persona: { readonly name: string; readonly systemRoles: readonly string[] },
    tickets: readonly Ticket[],
    nowIso: string,
    goalObjective: string | undefined,
  ): TaskFact[] {
    const now = Date.parse(nowIso)
    const facts: TaskFact[] = []
    const speaksForTeam = persona.systemRoles.includes('coordination')
    for (const ticket of tickets) {
      if (ticket.ended !== undefined || hasPendingDelivery(ticket)) continue // a result waiting for the person is theirs to review
      // A Task born in a private DM is not the shared channel's to talk about: its title and the question the persona asked there are the DM's.
      if (this.deps.orchestration.conversationOfTicket?.(projectId, ticket.id)?.streamKind === 'dm') continue
      // A persona proposes about HER work; the Coordenação speaks for what nobody owns.
      const owner = ticket.execution?.name
      if (owner === undefined || owner === '' ? !speaksForTeam : owner !== persona.name) continue
      const idleMs = now - Date.parse(ticket.updatedAt)
      if (!Number.isFinite(idleMs)) continue
      if (ticket.attention !== undefined) {
        if (idleMs >= BLOCKED_MS) facts.push({ kind: 'blocked', title: ticket.title, detail: ticket.attention.question, ticketId: ticket.id })
      } else if (idleMs >= STALE_MS && ticket.assignments.at(-1)?.state !== 'running') {
        facts.push({ kind: 'stale', title: ticket.title, ageDays: Math.floor(idleMs / DAY_MS), ticketId: ticket.id })
      }
    }
    const objective = goalObjective ?? this.deps.activeGoal(projectId)
    const moving = tickets.some(ticket => ticket.ended === undefined && ticket.assignments.at(-1)?.state === 'running')
    // The goal belongs to the team: the Coordenação is the one who asks about it.
    if (speaksForTeam && objective !== undefined && objective.trim() !== '' && !moving) facts.push({ kind: 'goal', title: objective })
    return facts.sort((a, b) => FACT_ORDER[a.kind] - FACT_ORDER[b.kind])
  }

  private queue(workspaceId: string, projectId: string, personaId: string, personaName: string, draft: TaskProposalDraft, nowIso: string, index: number): void {
    const id = `prop:${personaId}:${stamp(draft.key)}:${nowIso}:${String(index)}`
    this.put({
      id, workspaceId, projectId, personaId, personaName, key: draft.key, question: draft.question, reason: draft.reason, request: draft.request,
      status: 'queued', createdAt: nowIso, openedAt: nowIso,
    })
  }

  private records(projectId: string): ProposalRecord[] {
    return this.deps.screens.list<ProposalRecord>(projectId, PROPOSAL_KIND)
  }

  private require(projectId: string, id: string): ProposalRecord {
    const row = this.deps.screens.get<ProposalRecord>(projectId, PROPOSAL_KIND, id)
    if (row === undefined || row.projectId !== projectId || row.status === 'queued') throw new RemoteFault('not-found', 'Proposta não encontrada neste projeto.')
    return row
  }

  private put(row: ProposalRecord): void {
    this.deps.screens.put(row.projectId, PROPOSAL_KIND, row.id, row)
  }

  /** Stats with the day counters rolled over. */
  private statsOf(personaId: string, nowIso: string): StatsDoc {
    const projectId = this.deps.product.getPersona(personaId)?.projectId ?? ''
    const stored: StatsDoc = this.deps.screens.get<StatsDoc>(projectId, STATS_KIND, personaId) ?? freshStats()
    return stored.day === nowIso.slice(0, 10)
      ? stored
      : { accepted: stored.accepted, declined: stored.declined, rate: stored.rate, ...(stored.lastOfferedAt === undefined ? {} : { lastOfferedAt: stored.lastOfferedAt }) }
  }

  private putStats(personaId: string, stats: StatsDoc): void {
    const projectId = this.deps.product.getPersona(personaId)?.projectId
    if (projectId !== undefined) this.deps.screens.put(projectId, STATS_KIND, personaId, stats)
  }

  private viewOf(row: ProposalRecord, now: string, tickets: readonly Ticket[]): TaskProposalView {
    const expired = row.status === 'open' && proposalExpired(row.openedAt, now)
    const requestId = `proposal-accept:${row.id}`
    const ticket = row.status === 'accepted'
      ? (row.ticketId === undefined ? tickets.find(item => item.origin.triggerId === requestId) : tickets.find(item => item.id === row.ticketId))
      : undefined
    return {
      id: row.id,
      personaId: row.personaId,
      personaName: row.personaName,
      question: row.question,
      reason: row.reason,
      status: expired ? 'expired' : row.status === 'queued' ? 'open' : row.status,
      cardId: row.cardId ?? '',
      createdAt: row.createdAt,
      ...(row.decidedAt === undefined ? {} : { decidedAt: row.decidedAt }),
      ...(ticket === undefined ? {} : { ticketId: ticket.id, ticketTitle: ticket.title }),
    }
  }
}

/** Short stable token of a key, for ids. */
function stamp(key: string): string {
  let hash = 0
  for (const char of key) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  return hash.toString(36)
}
