/** Persist explicit report facts with the audience captured at message admission. */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { curateAfterWork, extractFactsFromReport, latestAssignment, mapReportFactForCuration,
  type FactReportInput, type ReportFactAudience, type Ticket } from '@deepseek-ai/dsh-persona-engine'
import type { BrainPage as CurationPage } from '@deepseek-ai/dsh-persona-core'
import type { BrainPage, BrainRepos, ProductRepos, ScreenRepos, StoredEvent } from '@deepseek-ai/dsh-persona-store'
import { resolveSessionActor, sessionCan } from './auth.ts'

/** Final report kept before any presentation clipping. No Remote exposes this record. */
export interface CapturedWorkerReport {
  readonly ticketId: string
  readonly assignmentId: string
  readonly personaId: string
  readonly report: FactReportInput & { readonly state: string }
}

/**
 * Freeze channel readers or DM participants before asynchronous routing starts.
 * @param product - Authoritative project membership.
 * @param screens - Durable host metadata.
 * @param event - Persisted source message.
 */
export function rememberReportAudience(product: ProductRepos, screens: ScreenRepos, event: StoredEvent): void {
  if (screens.get(event.projectId, 'report_audience', event.id) !== undefined) return
  let audience: ReportFactAudience
  if (event.streamId.startsWith('dm:')) {
    const dm = product.getDm(event.streamId.slice(3))
    audience = { kind: 'members', memberIds: dm === undefined ? [] : [dm.participantA, dm.participantB] }
  } else {
    const memberIds = product.listMembers(event.workspaceId).filter((member) => {
      const actor = resolveSessionActor(product, event.workspaceId, member.id)
      return actor !== undefined && sessionCan(actor, 'read', {
        type: 'project', workspaceId: event.workspaceId, projectId: event.projectId,
      })
    }).map(member => member.id)
    audience = { kind: 'channel', channelId: event.streamId.slice(event.streamId.indexOf(':') + 1), memberIds }
  }
  screens.put(event.projectId, 'report_audience', event.id, audience)
}

/**
 * Curate only successful, explicitly reported facts; first delivery never enters this path.
 * @param input - Settled source, persisted ticket/report and local knowledge repositories.
 * @returns Number of pages created or updated by this report; replay is a no-op.
 */
export function curateSettledReport(input: {
  readonly event: StoredEvent
  readonly ticket: Ticket
  readonly brain: BrainRepos
  readonly screens: ScreenRepos
  readonly firstDelivery: boolean
}): number {
  if (input.firstDelivery) return 0
  const { event, ticket, brain, screens } = input
  const assignment = latestAssignment(ticket)
  if (assignment?.report?.state !== 'ready') return 0
  const raw = screens.get<unknown>(event.projectId, 'worker_report', assignment.id)
  if (raw === undefined) return 0
  const captured = capturedReportSchema.parse(raw)
  if (captured.ticketId !== ticket.id || captured.report.state !== 'ready') return 0
  if (screens.get(event.projectId, 'report_curation', assignment.id) !== undefined) return 0
  const rawAudience = screens.get<unknown>(event.projectId, 'report_audience', ticket.origin.triggerId)
  const audience = rawAudience === undefined ? { kind: 'members' as const, memberIds: [event.actorId] }
    : audienceSchema.parse(rawAudience)
  const extraction = extractFactsFromReport(captured.report, { id: ticket.id, audience, firstDelivery: false })
  return brain.store.tx(() => {
    let written = 0
    if (extraction.facts.length > 0) {
      const mapped = extraction.facts.map(mapReportFactForCuration)
      const visibility = mapped[0]?.visibility
      if (visibility === undefined) throw new Error('missing-fact-audience')
      const storedVisibility: BrainPage['visibility'] = visibility.kind === 'members'
        ? { kind: 'members', memberIds: [...visibility.memberIds] } : visibility
      const current = brain.list(event.projectId)
      const result = curateAfterWork({ facts: mapped.map(row => row.fact),
        pages: current.flatMap((page) => { const converted = curationPage(page); return converted === undefined ? [] : [converted] }),
        source: { kind: 'task', id: ticket.id }, visibility, workspaceId: event.workspaceId,
        authorId: captured.personaId, now: Date.parse(captured.report.at), policy: 'auto' })
      for (const [index, action] of result.actions.entries()) {
        if (action.kind === 'create' && !action.needsAccept) {
          const id = `brain-report-${createHash('sha256').update(JSON.stringify([
            ticket.id, action.page.kind, action.page.title, visibility,
          ])).digest('hex').slice(0, 32)}`
          const titleSlug = action.page.title.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
            .replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 60)
          brain.putPage({ id, workspaceId: event.workspaceId, projectId: event.projectId,
            kind: action.page.kind, title: action.page.title, body: action.page.body, visibility: storedVisibility,
            slug: `${titleSlug || 'pagina'}-${id.slice(-16)}`,
            sources: [`task:${ticket.id}`, `report:${assignment.id}`], editorKind: 'persona', editorId: captured.personaId })
          written += 1
        } else if (action.kind === 'update' && !action.needsAccept) {
          const page = brain.get(action.pageId)
          if (page === undefined || page.projectId !== event.projectId) throw new Error('curation-page-missing')
          brain.putPage({ ...page, body: action.body, editorKind: 'persona', editorId: captured.personaId,
            sources: [...new Set([...page.sources, `task:${ticket.id}`, `report:${assignment.id}`])] })
          written += 1
        } else {
          screens.put(event.projectId, 'brain_curation_proposal', `${assignment.id}:${index}`, {
            action, visibility, sourceTicketId: ticket.id, at: captured.report.at,
          })
        }
      }
    }
    screens.put(event.projectId, 'report_curation', assignment.id, { ...extraction, written,
      sourceTicketId: ticket.id, at: captured.report.at })
    return written
  })
}

const capturedReportSchema = z.object({
  ticketId: z.string(), assignmentId: z.string(), personaId: z.string(),
  report: z.looseObject({ state: z.string(), at: z.string(), summary: z.string(), facts: z.unknown().optional() }),
})
const audienceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('members'), memberIds: z.array(z.string()) }),
  z.object({ kind: z.literal('channel'), channelId: z.string(), memberIds: z.array(z.string()) }),
  z.object({ kind: z.literal('thread'), threadId: z.string(), memberIds: z.array(z.string()) }),
  z.object({ kind: z.literal('project'), projectId: z.string() }),
])

function curationPage(page: BrainPage): CurationPage | undefined {
  if (page.visibility.kind === 'persona') return undefined
  return { id: page.id, workspaceId: page.workspaceId, kind: page.kind, title: page.title, body: page.body,
    properties: page.properties, sources: page.sources.filter(source => source.startsWith('task:'))
      .map(source => ({ kind: 'task' as const, id: source.slice(5) })),
    visibility: page.visibility, revision: page.revision, confirmedAt: Date.parse(page.confirmedAt), links: page.links,
    required: page.properties.required === 'true', status: page.status === 'active' ? 'active' : 'replaced', authorId: '',
    createdAt: Date.parse(page.createdAt), lastUsedAt: Date.parse(page.updatedAt), replacedBy: '' }
}
