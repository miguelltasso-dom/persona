/**
 * A persona's STRUCTURED question (contracts/structured-question.md): chips, single or multiple choice, a sequence of up to
 * five questions asked one at a time, free text and files always allowed. This module opens the question on the Ticket (through
 * the engine), posts its card in the thread where the work was asked, remembers the answers for the read-only card, and
 * keeps the persona inside the attention budget: one open question per Ticket, a few interruptions a day, no repeats.
 * The persona never gets stuck: a refusal is a sentence handed back to the model, with the way forward.
 */

import {
  AskError,
  askInputOf,
  normalizeAskQuestions,
  type Ticket,
  type WorkerReport,
} from '@deepseek-ai/dsh-persona-engine'
import type { EventRepos, ProductRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import { personaAskBody, personaAskSentence } from './persona-ask-wire.ts'
import type { PersonaAskCardView, PersonaAskView } from './types.ts'

const KIND = 'persona_ask'
const BUDGET_KIND = 'ask_budget'
/** Interruptions a persona may open per day (a whole sequence counts as one). */
export const ASK_DAILY_BUDGET = 4
const REPEAT_WINDOW_MS = 86_400_000
/** A line a persona leaves when she goes on without an answer. */
export const ASSUMPTION_MAX = 200

interface AskRecord extends PersonaAskCardView {
  readonly projectId: string
  readonly cardId: string
  readonly createdAt: string
  readonly answer?: { readonly optionIds: readonly string[]; readonly text: string; readonly attachmentIds: readonly string[]; readonly answeredAt: string }
}

/** The host parts the module reads and writes. */
export interface PersonaAskDeps {
  readonly product: Pick<ProductRepos, 'getPersona' | 'listPersonas' | 'getProject' | 'listChannels'>
  readonly screens: ScreenRepos
  readonly events: Pick<EventRepos, 'append' | 'has'>
  readonly orchestration: {
    now(): string
    runtime(projectId: string): {
      readonly repo: { readonly tickets: { get(id: string): Ticket | undefined; list(): Ticket[] } }
      readonly engine: { report(ticketId: string, report: WorkerReport): Ticket }
    }
    conversationOfTicket(projectId: string, ticketId: string): { streamKind: 'channel' | 'dm'; ownerId: string; topicId: string; subjectId: string } | undefined
  }
}

/** What the tool hands back to the model. */
export type AskResult = { readonly ok: true; readonly askId: string } | { readonly ok: false; readonly message: string }

const flat = (value: string): string => value.replace(/\s+/gu, ' ').trim().toLowerCase()

/** Structured questions: store, budget and cards. */
export class PersonaAsks {
  private readonly deps: PersonaAskDeps

  /** @param deps - Host parts. */
  constructor(deps: PersonaAskDeps) {
    this.deps = deps
  }

  /**
   * The persona asks (the `persona_ask` tool). Opens the first question on the Ticket and posts its card; the worker then waits.
   * @param input - Who asks, on which Ticket, and what: 1..5 questions, chips optional, in any shape a model writes (read with
   * `askInputOf`, validated by `normalizeAskQuestions`).
   * @returns The Attention id, or a Portuguese sentence for the model saying why nothing was opened.
   */
  ask(input: { readonly projectId: string; readonly ticketId: string; readonly personaId: string; readonly questions: unknown; readonly askedBy?: string }): AskResult {
    const { projectId, ticketId, personaId } = input
    const rt = this.deps.orchestration.runtime(projectId)
    const ticket = rt.repo.tickets.get(ticketId)
    const persona = this.deps.product.getPersona(personaId)
    if (ticket === undefined || ticket.ended !== undefined || persona === undefined || persona.projectId !== projectId) {
      return { ok: false, message: 'Essa tarefa já terminou; não há ninguém para perguntar agora.' }
    }
    if (ticket.attention !== undefined) {
      return { ok: false, message: 'Você já tem uma pergunta aberta nesta tarefa. Espere a resposta; ela volta para você.' }
    }
    let questions: ReturnType<typeof normalizeAskQuestions>
    try {
      questions = normalizeAskQuestions(askInputOf(input.questions))
    } catch (error: unknown) {
      if (error instanceof AskError) return { ok: false, message: error.message }
      throw error
    }
    const now = this.deps.orchestration.now()
    const first = flat(questions[0]?.question ?? '')
    const repeated = this.records(projectId).some(row => row.ticketId === ticketId && flat(row.question) === first
      && Date.parse(now) - Date.parse(row.createdAt) < REPEAT_WINDOW_MS)
    if (repeated) return { ok: false, message: 'Você já perguntou isso. Espere a resposta ou siga com a melhor suposição.' }
    const day = now.slice(0, 10)
    const used = this.deps.screens.get<{ day: string; count: number }>(projectId, BUDGET_KIND, personaId)
    const count = used?.day === day ? used.count : 0
    if (count >= ASK_DAILY_BUDGET) {
      return { ok: false, message: 'Você já fez as perguntas de hoje. Siga com a melhor suposição e avise a pessoa com persona_ask({ assumption: "…" }), em uma linha.' }
    }
    let opened: Ticket
    try {
      opened = rt.engine.report(ticketId, {
        state: 'waiting',
        summary: `Pergunta: ${questions[0]?.question ?? ''}`,
        ask: questions,
        ...(input.askedBy === undefined ? {} : { askedBy: input.askedBy }),
      })
    } catch {
      return { ok: false, message: 'Não consegui abrir a pergunta agora. Siga com a melhor suposição.' }
    }
    this.deps.screens.put(projectId, BUDGET_KIND, personaId, { day, count: count + 1 })
    const attention = opened.attention
    if (attention === undefined) return { ok: false, message: 'Não consegui abrir a pergunta agora. Siga com a melhor suposição.' }
    this.openCard(projectId, opened)
    return { ok: true, askId: attention.id }
  }

  /**
   * The persona goes on without an answer (the budget said no, or the question is not worth interrupting): one honest line in
   * the thread so the person can correct her. Never counts against the budget.
   * @param input - Who, on which Ticket, and what she assumes.
   */
  assume(input: { readonly projectId: string; readonly ticketId: string; readonly personaId: string; readonly assumption: string }): { readonly ok: boolean; readonly message: string } {
    const line = input.assumption.replace(/\s+/gu, ' ').trim()
    const persona = this.deps.product.getPersona(input.personaId)
    const where = this.deps.orchestration.conversationOfTicket(input.projectId, input.ticketId)
    const workspaceId = this.deps.product.getProject(input.projectId)?.workspaceId
    if (line === '' || persona === undefined || where === undefined || workspaceId === undefined) return { ok: false, message: 'Escreva em uma linha o que você vai supor.' }
    const shown = line.length <= ASSUMPTION_MAX ? line : `${line.slice(0, ASSUMPTION_MAX - 1).trimEnd()}…`
    const id = `ask-assume:${input.ticketId}:${String(this.records(input.projectId).length)}:${this.deps.orchestration.now()}`
    this.deps.events.append({
      id, workspaceId, projectId: input.projectId, streamKind: where.streamKind, ownerId: where.ownerId, type: 'message',
      body: `${persona.name} seguiu sem a sua resposta: ${shown}`, actorId: persona.id, subjectId: where.subjectId,
      occurredAt: this.deps.orchestration.now(), ...(where.topicId === '' ? {} : { topicId: where.topicId }),
    })
    return { ok: true, message: 'Registrei a suposição no fio. Siga com o trabalho.' }
  }

  /**
   * Post the card of the Ticket's open structured question, once. Called when a persona asks and when a sequence advances.
   * @param projectId - Tenant.
   * @param ticket - Ticket (fresh) whose Attention may be structured.
   */
  openCard(projectId: string, ticket: Ticket): void {
    const attention = ticket.attention
    const ask = attention?.ask
    if (attention === undefined || ask === undefined) return
    if (this.deps.screens.get<AskRecord>(projectId, KIND, attention.id) !== undefined) return
    const persona = this.deps.product.listPersonas(projectId).find(row => row.name === ticket.execution?.name)
    const where = this.deps.orchestration.conversationOfTicket(projectId, ticket.id)
    const workspaceId = this.deps.product.getProject(projectId)?.workspaceId
    if (persona === undefined || where === undefined || workspaceId === undefined) return
    const card: PersonaAskCardView = {
      askId: attention.id, ticketId: ticket.id, personaId: persona.id, personaName: persona.name, question: attention.question,
      ...(ask.options === undefined ? {} : { options: ask.options }),
      multiple: ask.multiple,
      ...(ask.step === undefined ? {} : { step: ask.step }),
    }
    const cardId = `ask-card:${attention.id}`
    const now = this.deps.orchestration.now()
    if (!this.deps.events.has(cardId)) {
      this.deps.events.append({
        id: cardId, workspaceId, projectId, streamKind: where.streamKind, ownerId: where.ownerId, type: 'message',
        body: personaAskBody(card, personaAskSentence(persona.name, attention.question, ask.options)),
        actorId: persona.id, subjectId: where.subjectId, occurredAt: now, ...(where.topicId === '' ? {} : { topicId: where.topicId }),
      })
    }
    this.put({ ...card, projectId, cardId, createdAt: now })
  }

  /**
   * Remember what was answered, for the read-only card.
   * @param projectId - Tenant.
   * @param attentionId - The question that was answered.
   * @param answer - Chips, words and files.
   */
  recordAnswer(projectId: string, attentionId: string, answer: { readonly optionIds: readonly string[]; readonly text: string; readonly attachmentIds: readonly string[] }): void {
    const row = this.deps.screens.get<AskRecord>(projectId, KIND, attentionId)
    if (row === undefined || row.answer !== undefined) return
    this.put({ ...row, answer: { ...answer, answeredAt: this.deps.orchestration.now() } })
  }

  /**
   * @param projectId - Tenant.
   * @param ticketId - Only this Ticket's questions, when given.
   * @returns Structured questions with their live state, oldest first.
   */
  list(projectId: string, ticketId?: string): PersonaAskView[] {
    const tickets = this.deps.orchestration.runtime(projectId).repo.tickets
    return this.records(projectId)
      .filter(row => ticketId === undefined || row.ticketId === ticketId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.step?.index ?? 0) - (b.step?.index ?? 0) || a.askId.localeCompare(b.askId))
      .map((row) => {
        const ticket = tickets.get(row.ticketId)
        const status = ticket?.attention?.id === row.askId ? 'open' as const
          : row.answer !== undefined ? 'answered' as const
            : ticket === undefined || ticket.ended !== undefined ? 'cancelled' as const
              : 'answered' as const // answered in plain words, or replaced by the worker: it is no longer waiting
        const { projectId: _project, ...card } = row
        return { ...card, status }
      })
  }

  private records(projectId: string): AskRecord[] {
    return this.deps.screens.list<AskRecord>(projectId, KIND)
  }

  private put(row: AskRecord): void {
    this.deps.screens.put(row.projectId, KIND, row.askId, row)
  }
}
