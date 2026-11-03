import { expect } from 'vitest'
import { SCOPE, openJourney, say, seedJourney, it } from './journey-host.ts'

it('J2 — pedido vira Tarefa, vai a revisão, Aceitar / Pedir ajustes / Descartar', async () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true, canRecruit: true }])
  say(h, 'm-readme', 'preciso de um README no projeto')
  const doing = h.listTasks(SCOPE)
  expect(doing.length).toBe(1)
  expect(doing[0]?.stage).toBe('doing')
  await h.orchestration.flush(SCOPE.projectId)
  const inReview = h.listTasks(SCOPE)[0]!
  expect(inReview.stage).toBe('review')
  const accepted = await h.acceptReview({
    ...SCOPE, ticketId: inReview.id, mode: 'ff',
  })
  expect(accepted.kind === 'merged' || accepted.kind === 'blocked').toBe(true)
  if (accepted.kind === 'blocked') {
    expect(accepted.explanation).toMatch(/pasta|código/i)
    h.runTicketCommand({
      ...SCOPE, ticketId: inReview.id, command: 'complete', reason: '',
    })
  }
  expect(h.listTasks(SCOPE)[0]?.stage).toBe('done')

  say(h, 'm-docs', 'preciso escrever docs')
  await h.orchestration.flush(SCOPE.projectId)
  const second = h.listTasks(SCOPE).find(item => item.stage !== 'done')
  expect(second).toBeDefined()
  await h.requestChanges({
    ...SCOPE, ticketId: second!.id, feedback: 'Ajusta o título.',
  })
  const afterAsk = h.orchestration.runtime(SCOPE.projectId).repo.tickets.get(second!.id)!
  expect(JSON.stringify(afterAsk)).toMatch(/Ajusta o título/)
  expect(await h.discardReview({
    ...SCOPE, ticketId: second!.id, command: 'complete', reason: '',
  })).toBe(true)
})
