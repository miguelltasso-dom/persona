import { citedCardTicketId } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import { SCOPE, openJourney, say, seedJourney, it } from './journey-host.ts'

it('C2 — Precisa de você: a pessoa responde, o cartão abre a Tarefa, marco no canal', async () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true, canRecruit: true }])
  say(h, 'm-ask', 'preciso de um README no projeto?')
  await h.orchestration.flush(SCOPE.projectId)
  const task = h.listTasks(SCOPE)[0]
  expect(task).toBeDefined()
  const page = h.listMessages({
    ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 40,
  })
  expect(page.events.some(item => /Precisa de você/i.test(item.body))).toBe(true)
  const inbox = h.listApprovals(SCOPE).filter(item => item.kind === 'attention')
  expect(inbox.some(item => item.id === task!.id && item.status === 'pending')).toBe(true)

  expect(h.answerAttention({ ...SCOPE, ticketId: task!.id, text: 'src/' })).toBe(true)
  const after = h.orchestration.runtime(SCOPE.projectId).repo.tickets.get(task!.id)
  expect(after?.attention).toBeUndefined()
  expect(JSON.stringify(after?.inputs)).toMatch(/src\//)
  expect(h.listApprovals(SCOPE).some(item => item.kind === 'attention' && item.id === task!.id && item.status === 'pending')).toBe(false)

  const pointer = `ticket/${task!.id}`
  expect(citedCardTicketId(pointer)).toBe(task!.id)
  const ctx = h.getTurnContext({
    ...SCOPE, ticketId: citedCardTicketId(pointer)!, command: 'complete', reason: '',
  })
  expect(ctx.ticketId).toBe(task!.id)
  expect(ctx.title.length).toBeGreaterThan(0)

  if (task!.stage === 'review') {
    h.runTicketCommand({ ...SCOPE, ticketId: task!.id, command: 'complete', reason: '' })
  }
  h.orchestration.completeReview(SCOPE.projectId, task!.id)
  const later = h.listMessages({
    ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 50,
  })
  expect(later.events.some(item => item.id === `coord-${task!.id}-milestone` && /Concluído/.test(item.body))).toBe(true)
})
