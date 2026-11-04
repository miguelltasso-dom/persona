/** Desktop attention data derived from persisted tickets and their original audience. */
import { latestAssignment, type Ticket } from '@deepseek-ai/dsh-persona-engine'
import type { EventRepos, ProductRepos } from '@deepseek-ai/dsh-persona-store'
import { runErrorFromBody } from './run-error-wire.ts'
import { doneEventId } from './ticket-done.ts'
import type { AttentionEventView } from './types.ts'

/**
 * Build stable notification ids without applying desktop focus, silence or delivery budgets.
 * @param input - Project tickets, source events, projected stages and the authenticated reader.
 * @returns Only events visible to this reader; completion is restricted to their own requests.
 */
export function ticketAttention(input: {
  readonly projectId: string
  readonly actorId: string
  readonly tickets: readonly Ticket[]
  readonly stages: ReadonlyMap<string, string>
  readonly events: EventRepos
  readonly product: ProductRepos
}): AttentionEventView[] {
  const rows: AttentionEventView[] = []
  const personas = input.product.listPersonas(input.projectId)
  for (const ticket of input.tickets) {
    const origin = input.events.get(ticket.origin.triggerId)
    if (origin === undefined || origin.deleted || origin.projectId !== input.projectId) continue
    if (origin.streamId.startsWith('dm:')) {
      const dm = input.product.getDm(origin.streamId.slice(3))
      if (dm === undefined || (dm.participantA !== input.actorId && dm.participantB !== input.actorId)) continue
    }
    const persona = personas.find(row => row.name === ticket.execution?.name)
    const latest = latestAssignment(ticket)
    const report = latest?.report
    const reply = input.events.get(doneEventId(ticket))
    const error = reply === undefined ? undefined : runErrorFromBody(reply.body)
    const common = { title: ticket.title, ticketId: ticket.id, threadId: origin.subjectId,
      streamId: origin.streamId, personaId: persona?.id ?? '', personaName: persona?.name ?? ticket.execution?.name ?? '',
      ...(persona?.avatar.kind === 'gallery' && /^[a-z0-9-]+$/u.test(persona.avatar.ref) ? { avatarId: persona.avatar.ref } : {}),
      at: report?.at ?? ticket.ended?.at ?? ticket.updatedAt }
    if (ticket.ended === undefined && (error !== undefined || report?.state === 'failed')) {
      rows.push({ ...common, id: `failed:${ticket.id}:${latest?.id ?? 'delivery'}`, kind: 'failed',
        code: error?.code ?? 'engine_unavailable' })
    } else if (ticket.attention !== undefined) {
      const question = report?.state === 'waiting'
      rows.push({ ...common, id: `${question ? 'question' : 'need'}:${ticket.id}:${ticket.attention.id}`,
        kind: question ? 'question' : 'needs-you', question: ticket.attention.question })
    } else if (input.stages.get(ticket.id) === 'review') {
      rows.push({ ...common, id: `review:${ticket.id}:${latest?.id ?? 'draft'}`, kind: 'review' })
    } else if ((ticket.ended?.outcome === 'completed' || ticket.ended?.outcome === 'merged')
      && origin.actorId === input.actorId && input.product.listMembers(origin.workspaceId).some(row => row.id === origin.actorId)) {
      rows.push({ ...common, id: `done:${ticket.id}`, kind: 'done' })
    } else if (input.stages.get(ticket.id) === 'blocked') {
      rows.push({ ...common, id: `need:${ticket.id}:${latest?.id ?? 'blocked'}`, kind: 'needs-you' })
    }
  }
  return rows
}
