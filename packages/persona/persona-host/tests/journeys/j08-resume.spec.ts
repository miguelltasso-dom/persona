import { RECOVERY_NOTE } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import { SCOPE, dbPathOf, openJourneyFile, reopenJourney, say, seedJourney, it } from './journey-host.ts'

it('J8 — host cai no meio da Tarefa e da resposta; retoma sem duplicar', async () => {
  const first = openJourneyFile()
  seedJourney(first, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true, canRecruit: true }])
  say(first, 'm-talk', 'oi')
  await first.orchestration.flush(SCOPE.projectId)
  const talkPage = first.listMessages({
    ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 40,
  })
  const talkReplies = talkPage.events.filter(item => item.id.includes('reply'))
  expect(talkReplies).toHaveLength(1)

  say(first, 'm-work', 'preciso de um README no projeto')
  const tickets = first.orchestration.runtime(SCOPE.projectId).repo.tickets.list()
  expect(tickets).toHaveLength(1)
  const path = dbPathOf(first)
  first.store.close()

  const second = reopenJourney(path)
  second.orchestration.runtime(SCOPE.projectId)
  expect(second.orchestration.runtime(SCOPE.projectId).recoveryNotes).toContain(RECOVERY_NOTE)
  await second.orchestration.flush(SCOPE.projectId)
  expect(second.orchestration.runtime(SCOPE.projectId).repo.tickets.list()).toHaveLength(1)
  const again = second.listMessages({
    ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 40,
  })
  expect(again.events.filter(item => item.id === talkReplies[0]!.id)).toHaveLength(1)
  expect(again.events.filter(item => item.id.includes('m-talk') && item.id.includes('reply'))).toHaveLength(1)
})
