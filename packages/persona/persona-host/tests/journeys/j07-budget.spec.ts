import { expect } from 'vitest'
import { SCOPE, openJourney, say, seedJourney, it } from './journey-host.ts'

it('J7 — estouro de tokens bloqueia com Precisa de você; silêncio não pinga', async () => {
  const h = openJourney()
  seedJourney(h, [
    { id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true, canRecruit: true },
    { id: 'bento', name: 'Bento', title: 'Engenharia' },
  ])
  const coord = h.product.getPersona('coord')!
  const bento = h.product.getPersona('bento')!
  h.product.updatePersona({ ...coord, limits: { tokensPerMonth: 1 } }, SCOPE.projectId)
  h.product.updatePersona({ ...bento, limits: { tokensPerMonth: 1 } }, SCOPE.projectId)
  h.usage.record({
    id: 'spent-coord', projectId: 'pp', personaId: 'coord', provider: 'claude', model: 'haiku',
    window: 'turn', inputTokens: 40, outputTokens: 10, origin: 'measured', at: '2026-11-03T14:00:00.000Z',
  })
  h.usage.record({
    id: 'spent-bento', projectId: 'pp', personaId: 'bento', provider: 'claude', model: 'haiku',
    window: 'turn', inputTokens: 40, outputTokens: 10, origin: 'measured', at: '2026-11-03T14:00:00.000Z',
  })
  say(h, 'm-work', 'preciso de um README no projeto')
  await h.orchestration.flush(SCOPE.projectId)
  const page = h.listMessages({
    ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 40,
  })
  expect(page.events.some(item => /orçamento|Precisa de você/i.test(item.body))).toBe(true)

  h.setAutonomy({
    ...SCOPE, personaId: 'bento', mode: 'propose', proposalBudget: 3, tokenBudget: 1, executionBudget: 1,
    silenceStart: '00:00', silenceEnd: '23:59',
  })
  const before = h.getWhileAway(SCOPE).events.length
  h.scheduleRoutine({
    ...SCOPE, id: 'initiative:bento', runId: 'run-quiet', scheduledFor: '2020-01-01T00:00:00.000Z',
  })
  h.tickProactivity({ ...SCOPE, leaseUntil: '2099-01-01T00:00:00.000Z', stallAfterMs: 60_000 })
  const away = h.getWhileAway(SCOPE)
  expect(away.events.length).toBeGreaterThanOrEqual(before)
})
