/**
 * EQUIPE-REAL §0 (Muse, 05/11): a request the team does in PARTS is shown as TWO cards, never as a stream of status lines:
 *  - the PLAN, once, by the Coordenação ("Dividi assim:"), whose chips change in place as the parts move (`MessageView.teamPlan`);
 *  - ONE delivery card per request, when every part is ready for the person (`MessageView.deliveryCard`, with the seal).
 * A request is either a CAMPAIGN the Gestor's approved plan opened (Forge: \`campaign_chain\`) or a request SPLIT by function (Bolt:
 * \`split:<msg>:<persona>\`). The cards are messages of the thread (so the person sees them and the stream carries them); their STATE is
 * computed live from the Tasks every time they are read, and \`touch\` tells the stream the message changed (an upsert of the same id).
 * Once a request has its cards, the status lines they replace ("Em andamento", "Pronto" of each part, the closing "Concluído") are no
 * longer shown: the person never loses the signal that it finished, because the delivery card IS that signal. Inert without \`Config.teamwork\`.
 */

import { humanTaskTitle, projectKanban, subjectOf, type MorningTask, type Ticket } from '@deepseek-ai/dsh-persona-engine'
import type { EventRepos, ProductRepos, ScreenRepos, StoredEvent } from '@deepseek-ai/dsh-persona-store'
import { humanTitle } from './ticket-title.ts'
import type { BoardHandoffView, DailyBriefRequestView, DeliveryCardView, StateLineView, TeamPlanPartView, TeamPlanView } from './types.ts'

const KIND = 'team_cards'
const TITLE_MAX = 48
const LABEL_MAX = 24

/** A request as the team sees it: where it came from, its short title and its parts. */
interface RequestSpec {
  requestId: string
  source: 'campaign' | 'split'
  title: string
  ticketIds: string[]
  steps?: Array<{ personaId: string; title: string; shortName: string }>
}

/** What is kept of a request: who is in it and the two messages. */
interface RequestDoc {
  readonly requestId: string
  readonly source: 'campaign' | 'split'
  readonly title: string
  readonly planEventId: string
  readonly deliveryEventId?: string
  /** Campaign: the parts as the plan names them (so a part that is not open yet is still on the card). */
  readonly steps?: readonly { readonly personaId: string; readonly title: string; readonly shortName: string }[]
  readonly signature: string
}

/** Host parts. */
export interface TeamCardsDeps {
  readonly enabled: () => boolean
  readonly now: () => string
  readonly product: Pick<ProductRepos, 'getPersona' | 'listPersonas' | 'getProject'>
  readonly events: Pick<EventRepos, 'append' | 'has' | 'get' | 'subscribe' | 'subscribeChanges' | 'touch'>
  readonly screens: ScreenRepos
  readonly tickets: (projectId: string) => Ticket[]
  readonly conversationOfTicket: (projectId: string, ticketId: string) => { streamKind: 'channel' | 'dm'; ownerId: string; topicId: string; subjectId: string } | undefined
  /** Forge: the campaign a Task belongs to (id, short title, the opened parts in order). */
  readonly requestOf: (projectId: string, ticketId: string) => { readonly requestId: string; readonly title: string; readonly partTicketIds: readonly string[] } | undefined
  readonly reviewing: (projectId: string, ticketId: string) => { readonly personaId: string; readonly round: number } | undefined
  readonly reviewedBy: (projectId: string, ticketId: string) => { readonly personaId: string; readonly at: string; readonly openPoints?: number } | undefined
  readonly handoffChip: (projectId: string, ticketId: string) => BoardHandoffView | undefined
  /** The typed state line of a stored message (the orchestration marks the lines that only tell a Task's state); undefined for any other line. */
  readonly stateLineOf: (projectId: string, eventId: string) => StateLineView | undefined
}

const clip = (text: string, max: number): string => {
  const flat = text.replace(/\s+/gu, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:.!?-]+$/u, '')}…`
}

/** The short name of a part: what the plan gave it, else the first words of its title before "da/do/de" ("Texto da campanha" → "Texto"), else the function. */
function shortNameOf(title: string, fallback: string): string {
  const head = title.split(/\s+(?:da|do|de|das|dos|para|pra)\s+/iu)[0]?.trim() ?? ''
  return clip(head !== '' ? head : fallback, LABEL_MAX)
}

/**
 * The NAME of a request: what it is about, never the person's own sentence ("Preciso de uma campanha de lançamento do nosso produto: texto,
 * arte e posts" → "Campanha de lançamento"). Falls back to the short human title when no subject can be read.
 */
function nameOfRequest(request: string): string {
  const subject = subjectOf(request).subject.replace(/\s+/gu, ' ').trim()
  return clip(subject === '' ? humanTitle(request, TITLE_MAX) : `${subject.charAt(0).toLocaleUpperCase('pt-BR')}${subject.slice(1)}`, TITLE_MAX)
}

/** "Texto, Arte e Posts". */
function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} e ${items.at(-1) ?? ''}`
}

/** The plan and delivery cards of the requests done in parts. */
export class TeamCards {
  private syncing = false
  private readonly stops: Array<() => void> = []

  /** @param deps - Host parts. */
  constructor(private readonly deps: TeamCardsDeps) {
    // Any event of a project may be a Task moving: look again (the cards are cheap to rebuild and idempotent).
    const look = (event: StoredEvent): void => { this.sync(event.projectId) }
    this.stops.push(deps.events.subscribe(look), deps.events.subscribeChanges(look))
  }

  /** Stop listening. */
  dispose(): void {
    for (const stop of this.stops.splice(0)) stop()
  }

  /**
   * The requests of a project that are done in parts: each with its plan card and, once ready, its delivery card. Idempotent.
   * @param projectId - Tenant.
   */
  sync(projectId: string): void {
    if (this.syncing || !this.deps.enabled()) return
    this.syncing = true
    try {
      for (const request of this.requestsOf(projectId)) this.ensure(projectId, request)
    } finally {
      this.syncing = false
    }
  }

  /** The state of the plan card of a thread message, when it is one. @param projectId - Tenant. @param eventId - The message. */
  planViewOf(projectId: string, eventId: string): TeamPlanView | undefined {
    if (!this.deps.enabled() || !eventId.startsWith('team-plan:')) return undefined
    const doc = this.deps.screens.get<RequestDoc>(projectId, KIND, eventId.slice('team-plan:'.length))
    return doc === undefined ? undefined : this.planOf(projectId, doc)
  }

  /** The delivery card of a thread message, when it is one. @param projectId - Tenant. @param eventId - The message. */
  deliveryViewOf(projectId: string, eventId: string): DeliveryCardView | undefined {
    if (!this.deps.enabled() || !eventId.startsWith('team-delivery:')) return undefined
    const doc = this.deps.screens.get<RequestDoc>(projectId, KIND, eventId.slice('team-delivery:'.length))
    if (doc === undefined) return undefined
    const plan = this.planOf(projectId, doc)
    const done = plan.parts.filter(part => part.taskId !== '')
    const sealed = done.map(part => this.deps.reviewedBy(projectId, part.taskId)).find(row => row !== undefined && row.openPoints === undefined)
    const waiting = plan.parts.find(part => part.status === 'needs-you' && part.approvalId !== undefined)
    const reviewer = sealed === undefined ? undefined : this.deps.product.getPersona(sealed.personaId)
    return {
      requestId: doc.requestId, title: doc.title,
      parts: done.map(part => ({ taskId: part.taskId, personaId: part.personaId, shortName: part.shortName, title: part.title })),
      ...(reviewer === undefined ? {} : { reviewedBy: { personaId: reviewer.id, name: reviewer.name } }),
      ...(waiting?.approvalId === undefined ? {} : { approvalId: waiting.approvalId }),
    }
  }

  /**
   * Is this a line that ONLY says a state the cards already carry — decided BEFORE it is written ("Em andamento" of a part of a request that
   * has its plan card; the closing "Concluído" of a request that has its delivery card)? Pure status lines only: never "Pronto" (that line is
   * also where a persona asks the person, so it is read by its typed `stateLine`, see {@link absorbed}).
   * @param projectId - Tenant.
   * @param eventId - The line.
   */
  replaced(projectId: string, eventId: string): boolean {
    if (!this.deps.enabled()) return false
    const split = /^coord-split-(.+)-milestone$/u.exec(eventId)?.[1]
    // The request document of a split is keyed `split-<id>` (see `requestOfTicket`); the id in the line is the bare `<id>`.
    if (split !== undefined) return this.deps.screens.get<RequestDoc>(projectId, KIND, `split-${split}`)?.deliveryEventId !== undefined
    const part = /^(?:exec-(.+)-progress|coord-(.+)-milestone)$/u.exec(eventId)
    const ticketId = part?.[1] ?? part?.[2]
    if (ticketId === undefined) return false
    const ticket = this.deps.tickets(projectId).find(row => row.id === ticketId)
    const request = ticket === undefined ? undefined : this.requestOfTicket(projectId, ticket)
    return request !== undefined && this.deps.screens.get<RequestDoc>(projectId, KIND, request.requestId) !== undefined
  }

  /**
   * Does the thread leave this STORED line out because the cards absorb it? Decided by its typed `stateLine`, never by its id or words: only a
   * line that tells the state of a part of a request is absorbed — its "status" once the plan card exists, the persona's own "result" once the
   * delivery card exists (it is the delivery). A question to the person, an error, a verdict and any other speech carry no `stateLine`
   * and always stay (§0.6, D-079).
   * @param projectId - Tenant.
   * @param eventId - The stored line.
   */
  absorbed(projectId: string, eventId: string): boolean {
    if (!this.deps.enabled()) return false
    if (this.replaced(projectId, eventId)) return true
    const state = this.deps.stateLineOf(projectId, eventId)
    if (state?.groupId === undefined) return false
    const doc = this.deps.screens.get<RequestDoc>(projectId, KIND, state.groupId)
    if (doc === undefined) return false
    return state.text === 'status' || doc.deliveryEventId !== undefined
  }

  private requestOfTicket(projectId: string, ticket: Ticket): { requestId: string } | undefined {
    const split = /^split:([^:]+):/u.exec(ticket.origin.triggerId)?.[1]
    if (split !== undefined) return { requestId: `split-${split}` }
    const campaign = this.deps.requestOf(projectId, ticket.id)
    return campaign === undefined ? undefined : { requestId: campaign.requestId }
  }

  private requestsOf(projectId: string): Array<RequestSpec> {
    const tickets = this.deps.tickets(projectId)
    const out = new Map<string, RequestSpec>()
    for (const ticket of tickets) {
      const split = /^split:([^:]+):/u.exec(ticket.origin.triggerId)?.[1]
      if (split !== undefined) {
        const id = `split-${split}`
        const known = out.get(id)
        if (known !== undefined) { known.ticketIds.push(ticket.id); continue }
        const asked = this.deps.events.get(split)?.body
        out.set(id, { requestId: id, source: 'split', title: nameOfRequest(asked ?? ticket.title), ticketIds: [ticket.id] })
        continue
      }
      const campaign = this.deps.requestOf(projectId, ticket.id)
      if (campaign === undefined || out.has(campaign.requestId)) continue
      const chain = this.deps.screens.get<{ goal: string; steps: Array<{ personaId: string; label: string }> }>(projectId, 'campaign_chain', campaign.requestId)
      out.set(campaign.requestId, {
        requestId: campaign.requestId, source: 'campaign', title: clip(campaign.title, TITLE_MAX), ticketIds: [...campaign.partTicketIds],
        steps: (chain?.steps ?? []).map(step => ({ personaId: step.personaId, title: humanTaskTitle(step.label, chain?.goal ?? ''), shortName: clip(step.label, LABEL_MAX) })),
      })
    }
    // A request of one part is just a Task: no plan to draw.
    return [...out.values()].filter(row => row.source === 'campaign' || row.ticketIds.length >= 2)
  }

  private ensure(projectId: string, request: RequestSpec): void {
    const planEventId = `team-plan:${request.requestId}`
    const existing = this.deps.screens.get<RequestDoc>(projectId, KIND, request.requestId)
    const first = this.deps.tickets(projectId).find(row => row.id === request.ticketIds[0])
    let doc: RequestDoc | undefined = existing
    if (doc === undefined) {
      const coordination = this.deps.product.listPersonas(projectId).find(persona => persona.systemRoles.includes('coordination'))
      const where = first === undefined ? undefined : this.deps.conversationOfTicket(projectId, first.id)
      const project = this.deps.product.getProject(projectId)
      if (coordination === undefined || where === undefined || project === undefined || first === undefined) return
      const draft: RequestDoc = {
        requestId: request.requestId, source: request.source, title: request.title, planEventId, signature: '',
        ...(request.steps === undefined ? {} : { steps: request.steps }),
      }
      this.deps.screens.put(projectId, KIND, request.requestId, draft)
      const plan = this.planOf(projectId, draft)
      this.deps.events.append({
        id: planEventId, workspaceId: project.workspaceId, projectId, streamKind: where.streamKind, ownerId: where.ownerId, type: 'message',
        body: this.planText(plan), actorId: coordination.id, subjectId: where.subjectId, occurredAt: this.deps.now(),
        ...(where.topicId === '' ? {} : { topicId: where.topicId }),
      })
      doc = draft
    }
    const plan = this.planOf(projectId, doc)
    const signature = plan.parts.map(part => `${part.taskId}:${part.status}:${part.withPersonaId ?? ''}`).join('|')
    // Every part is ready for the person (or done): the delivery card, once.
    const ready = plan.parts.length > 0 && plan.parts.every(part => part.taskId !== '' && (part.status === 'done' || part.status === 'needs-you'))
    if (ready && doc.deliveryEventId === undefined) {
      const coordination = this.deps.product.listPersonas(projectId).find(persona => persona.systemRoles.includes('coordination'))
      const firstTicket = this.deps.tickets(projectId).find(row => row.id === plan.parts[0]?.taskId)
      const where = firstTicket === undefined ? undefined : this.deps.conversationOfTicket(projectId, firstTicket.id)
      const project = this.deps.product.getProject(projectId)
      if (coordination !== undefined && where !== undefined && project !== undefined) {
        const deliveryEventId = `team-delivery:${request.requestId}`
        const names = plan.parts.map(part => `${part.title} (${this.deps.product.getPersona(part.personaId)?.name ?? 'equipe'})`)
        this.deps.events.append({
          id: deliveryEventId, workspaceId: project.workspaceId, projectId, streamKind: where.streamKind, ownerId: where.ownerId, type: 'message',
          body: `Pronto: ${doc.title}. ${names.join('; ')}.`, actorId: coordination.id, subjectId: where.subjectId, occurredAt: this.deps.now(),
          ...(where.topicId === '' ? {} : { topicId: where.topicId }),
        })
        doc = { ...doc, deliveryEventId }
      }
    }
    if (doc.signature !== signature || doc !== existing) {
      this.deps.screens.put(projectId, KIND, request.requestId, { ...doc, signature })
      // The chips changed: the stream sends the same message again (an upsert), never a new line.
      if (existing !== undefined && existing.signature !== signature) this.deps.events.touch(planEventId)
      if (doc.deliveryEventId !== undefined) this.deps.events.touch(doc.deliveryEventId)
    }
  }

  /** The plain-text body of the plan card, from ALL its parts as they are now (a part opened after the card went out is in it). */
  planText(plan: TeamPlanView): string {
    const names = plan.parts.map(part => `${this.deps.product.getPersona(part.personaId)?.name ?? 'Equipe'} — ${part.shortName}`)
    return `Dividi assim: ${names.join('; ')}.`
  }

  /** The plain-text body of the delivery card. */
  deliveryText(card: DeliveryCardView): string {
    return `Pronto: ${card.title}. ${card.parts.map(part => `${part.shortName} (${this.deps.product.getPersona(part.personaId)?.name ?? 'equipe'})`).join('; ')}.`
  }

  /**
   * The finished request behind the ONE morning line: its name, the short names of its parts and who did them, in order. Only when every
   * part is done — the same condition under which {@link groupDone} turns the parts into one line; a single Task is not a request.
   * @param projectId - Tenant.
   * @param taskId - The `taskId` of the line (the first part of the request).
   */
  requestOfLine(projectId: string, taskId: string): DailyBriefRequestView | undefined {
    if (!this.deps.enabled()) return undefined
    for (const request of this.requestsOf(projectId)) {
      if (request.ticketIds[0] !== taskId) continue
      const doc = this.deps.screens.get<RequestDoc>(projectId, KIND, request.requestId)
        ?? { requestId: request.requestId, source: request.source, title: request.title, planEventId: '', signature: '', ...(request.steps === undefined ? {} : { steps: request.steps }) }
      const parts = this.planOf(projectId, doc).parts
      if (parts.length < 2 || parts.some(part => part.status !== 'done')) return undefined
      return {
        requestId: request.requestId, title: request.title, parts: parts.map(part => part.shortName),
        personaIds: [...new Set(parts.map(part => part.personaId).filter(id => id !== ''))],
      }
    }
    return undefined
  }

  /**
   * The morning card groups a finished request in ONE line ("Campanha de Natal (Texto, Arte e Posts)") instead of one per part with the
   * long title. Only a request whose parts are ALL done is grouped; a part of an unfinished request stays on its own.
   * @param projectId - Tenant.
   * @param tasks - The Tasks as plain facts.
   * @param by - Who the grouped line is attributed to (the Coordenação).
   */
  groupDone(projectId: string, tasks: readonly MorningTask[], by: string): MorningTask[] {
    if (!this.deps.enabled()) return [...tasks]
    const grouped = new Set<string>()
    const out: MorningTask[] = []
    for (const request of this.requestsOf(projectId)) {
      const parts = request.ticketIds.map(id => tasks.find(task => task.taskId === id))
      const total = Math.max(request.ticketIds.length, request.steps?.length ?? 0)
      if (total < 2 || parts.length < total || parts.some(part => part === undefined || part.state !== 'done')) continue
      const done = parts.filter((part): part is MorningTask => part !== undefined)
      const labels = this.planOf(projectId, this.deps.screens.get<RequestDoc>(projectId, KIND, request.requestId) ?? { requestId: request.requestId, source: request.source, title: request.title, planEventId: '', signature: '', ...(request.steps === undefined ? {} : { steps: request.steps }) }).parts.map(part => part.shortName)
      const first = done[0]
      if (first === undefined) continue
      for (const part of done) grouped.add(part.taskId)
      const endedAt = done.map(part => part.endedAt ?? part.updatedAt).sort().at(-1) ?? first.updatedAt
      out.push({
        taskId: first.taskId, personaId: by, title: `${request.title} (${listWords(labels)})`, state: 'done', endedAt, updatedAt: endedAt,
        grouped: true, // the line stands for the REQUEST, not for the Coordination who carries it: the text says it without a person
      })
    }
    return [...tasks.filter(task => !grouped.has(task.taskId)), ...out]
  }

  private planOf(projectId: string, doc: RequestDoc): TeamPlanView {
    const tickets = this.deps.tickets(projectId)
    const byRequest = doc.source === 'split'
      ? tickets.filter(row => row.origin.triggerId.startsWith(`split:${doc.requestId.slice('split-'.length)}:`))
      : (this.deps.requestOf(projectId, tickets.find(row => this.deps.requestOf(projectId, row.id)?.requestId === doc.requestId)?.id ?? '')?.partTicketIds ?? [])
        .flatMap(id => tickets.filter(row => row.id === id))
    const parts: TeamPlanPartView[] = byRequest.map(ticket => this.partOf(projectId, ticket, doc))
    // A campaign part that is not open yet is still on the card ("queued"), by the title the plan gave it.
    for (const step of (doc.steps ?? []).slice(parts.length)) parts.push({ taskId: '', personaId: step.personaId, shortName: step.shortName, title: clip(step.title, TITLE_MAX), status: 'queued' })
    return { requestId: doc.requestId, title: doc.title, parts }
  }

  private partOf(projectId: string, ticket: Ticket, doc: RequestDoc): TeamPlanPartView {
    const persona = this.deps.product.listPersonas(projectId).find(row => row.name === ticket.execution?.name)
    const title = clip(ticket.title, TITLE_MAX)
    const step = doc.source === 'campaign' ? doc.steps?.find(row => row.personaId === persona?.id) : undefined
    const base = { taskId: ticket.id, personaId: persona?.id ?? '', shortName: step?.shortName ?? shortNameOf(ticket.title, persona?.title ?? ''), title }
    if (ticket.ended !== undefined) {
      const delivered = ticket.ended.outcome === 'completed' || ticket.ended.outcome === 'merged'
      return delivered ? { ...base, status: 'done' } : { ...base, status: 'stopped', reason: 'Esta parte foi encerrada sem entrega.' }
    }
    const chip = this.deps.handoffChip(projectId, ticket.id)
    if (chip?.role === 'waiting') return { ...base, status: 'with-colleague', withPersonaId: chip.otherPersonaId }
    if (this.deps.reviewing(projectId, ticket.id) !== undefined) return { ...base, status: 'reviewing' }
    const column = projectKanban(ticket).column
    if (column === 'review') return { ...base, status: 'needs-you', approvalId: ticket.id }
    if (column === 'blocked') {
      return ticket.attention === undefined
        ? { ...base, status: 'stopped', reason: 'Esta parte parou e precisa de atenção.' }
        : { ...base, status: 'needs-you', approvalId: ticket.id }
    }
    if (column === 'todo') return { ...base, status: 'queued' }
    // A campaign part that waits for the one before it, and (D-100) a part of a split that waits for the text it is made from.
    if (column === 'doing' && projectKanban(ticket).chip === 'waiting') return { ...base, status: 'waiting' }
    return { ...base, status: 'doing' }
  }
}
