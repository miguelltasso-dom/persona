import { RECOVERY_NOTE } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import type { MessageView } from '../../src/types.ts'
import { SCOPE, dbPathOf, openJourneyFile, reopenJourney, say, seedJourney, it } from './journey-host.ts'

/**
 * D-075 / D-079: a courtesy such as "oi" is answered by a REACTION (no model), not by a reply message; the invariant is "never silence":
 * a reply, a reaction or a visible status line. The return of the message `m-talk`, as stable keys (so a restart can prove nothing is
 * duplicated).
 */
function talkReturns(events: readonly MessageView[]): string[] {
  const replies = events.filter(item => item.id.includes('m-talk') && item.id.includes('reply')).map(item => `reply:${item.id}`)
  const reactions = (events.find(item => item.id === 'm-talk')?.reactions ?? [])
    .flatMap(reaction => reaction.actorIds.map(actor => `reaction:${reaction.stickerId}:${actor}`))
  return [...replies, ...reactions].sort()
}

it('J8 — host cai no meio da Tarefa e da resposta; retoma sem duplicar', async () => {
  const first = openJourneyFile()
  seedJourney(first, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true, canRecruit: true }])
  say(first, 'm-talk', 'oi')
  await first.orchestration.flush(SCOPE.projectId)
  const talkPage = first.listMessages({
    ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 40,
  })
  const talkBefore = talkReturns(talkPage.events)
  expect(talkBefore.length, '"oi" got no reply, no reaction and no status line: the conversation went mute').toBeGreaterThanOrEqual(1)

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
  // After the restart the return is still there exactly once: nothing duplicated, nothing lost.
  expect(talkReturns(again.events)).toEqual(talkBefore)
})
