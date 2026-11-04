import { expect } from 'vitest'
import { ticketAttention } from '../src/attention.ts'
import { SCOPE, openJourney, say, seedJourney, it } from './journeys/journey-host.ts'

it('a direct question carries persona and deep-link data and resolves when answered', async () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true }])
  say(h, 'question-request', 'preciso de um README no projeto?')
  await h.orchestration.flush(SCOPE.projectId)
  const abort = new AbortController()
  const stream = h.attentionEvents(SCOPE, abort.signal)[Symbol.asyncIterator]()
  try {
    const frame = await stream.next()
    if (frame.done) throw new Error('attention-stream-ended')
    const question = frame.value.events.find(row => row.kind === 'question')
    expect(question).toMatchObject({ personaId: 'coord', personaName: 'Guia', avatarId: 'guia', threadId: 'question-request', streamId: 'channel:geral' })
    if (question === undefined) throw new Error('missing-question')
    h.answerAttention({ ...SCOPE, ticketId: question.ticketId, text: 'Na pasta src.' })
    const resolved = await stream.next()
    expect(resolved.value).toMatchObject({ kind: 'resolved', events: [], eventIds: [question.id] })
  } finally {
    abort.abort()
    await stream.return?.()
  }
})

it('done is sent only to the human requester; failure preserves the structured run-error code', async () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true }])
  say(h, 'task-request', 'Crie um README para o projeto')
  await h.orchestration.flush(SCOPE.projectId)
  const ticket = h.orchestration.runtime(SCOPE.projectId).repo.tickets.list()[0]
  if (ticket === undefined) throw new Error('missing-ticket')
  const collect = (actorId: string, completed: boolean) => ticketAttention({ ...SCOPE, actorId,
    tickets: [{ ...ticket, ...(completed ? { ended: { at: ticket.updatedAt, by: 'executor' as const, outcome: 'completed' as const } } : {}) }],
    stages: new Map(), events: h.events, product: h.product })
  expect(collect('ana', true)).toContainEqual(expect.objectContaining({ kind: 'done', ticketId: ticket.id, personaName: 'Guia' }))
  expect(collect('bia', true).some(row => row.kind === 'done')).toBe(false)
  const done = h.events.get(`coord-${ticket.id}-done`)
  if (done === undefined) throw new Error('missing-response')
  h.events.edit(done.id, '[[run-error:{"code":"quota_exhausted","provider":"claude","persona":"Guia"}]]', done.occurredAt)
  const failed = collect('ana', false).find(row => row.kind === 'failed')
  expect(failed).toMatchObject({ code: 'quota_exhausted', ticketId: ticket.id, personaId: 'coord' })
  expect(collect('ana', false).find(row => row.kind === 'failed')?.id).toBe(failed?.id)
  const persona = h.product.getPersona('coord')
  if (persona === undefined) throw new Error('missing-notification-persona')
  h.product.updatePersona({ ...persona, avatar: { kind: 'upload', ref: 'C:/private/avatar.png' } }, SCOPE.projectId)
  expect(collect('ana', false).find(row => row.kind === 'failed')).not.toHaveProperty('avatarId')
  h.product.updatePersona({ ...persona, avatar: { kind: 'gallery', ref: '../private/avatar' } }, SCOPE.projectId)
  expect(collect('ana', false).find(row => row.kind === 'failed')).not.toHaveProperty('avatarId')
})
