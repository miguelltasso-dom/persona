import { expect } from 'vitest'
import { SCOPE, openJourney, say, seedJourney, it } from './journey-host.ts'

it('J4 — trocar quem exerce Coordenação não apaga histórico nem Tarefas', async () => {
  const h = openJourney()
  seedJourney(h, [
    { id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true, canRecruit: true },
    { id: 'bento', name: 'Bento', title: 'Engenharia', canRecruit: true },
  ])
  say(h, 'm1', 'preciso de um README no projeto')
  await h.orchestration.flush(SCOPE.projectId)
  const beforeTasks = h.listTasks(SCOPE)
  expect(beforeTasks.length).toBeGreaterThan(0)
  const beforePage = h.listMessages({
    ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 40,
  })
  expect(beforePage.events.some(item => item.actorId === 'coord')).toBe(true)

  const guia = h.product.getPersona('coord')!
  const bento = h.product.getPersona('bento')!
  h.product.updatePersona({ ...guia, systemRoles: [] }, SCOPE.projectId)
  h.product.updatePersona({ ...bento, systemRoles: ['coordination'] }, SCOPE.projectId)
  expect(h.listPersonas(SCOPE).find(item => item.id === 'bento')?.systemRoles).toContain('coordination')
  expect(h.listPersonas(SCOPE).find(item => item.id === 'coord')?.systemRoles).not.toContain('coordination')

  expect(h.listTasks(SCOPE).map(item => item.id)).toEqual(beforeTasks.map(item => item.id))
  const afterPage = h.listMessages({
    ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 40,
  })
  expect(afterPage.events.map(item => item.id)).toEqual(beforePage.events.map(item => item.id))

  say(h, 'm2', 'oi, tudo bem?')
  await h.orchestration.flush(SCOPE.projectId)
  const later = h.listMessages({
    ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 40,
  })
  expect(later.events.some(item => item.actorId === 'bento')).toBe(true)
  expect(h.listTasks(SCOPE).length).toBe(beforeTasks.length)
})
