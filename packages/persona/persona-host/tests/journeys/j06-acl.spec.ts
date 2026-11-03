import { expect } from 'vitest'
import { SCOPE, openJourney, seedJourney, it } from './journey-host.ts'

it('J6 — convidado sem papel não vê DM, projeto privado nem Cofre', () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true }])
  h.createMember({
    id: 'guest', workspaceId: 'ws', projectId: 'pp', displayName: 'G', handle: 'g', role: 'guest',
  })
  h.createDm({ id: 'secret', workspaceId: 'ws', projectId: 'pp', participantA: 'ana', participantB: 'coord' })
  h.vault.createRecord({
    id: 'v-secret', workspaceId: 'ws', projectId: 'pp', kind: 'constraint',
    body: 'Nunca citar o CNPJ.', authorId: 'ana',
    visibility: { kind: 'persona', personaId: 'coord' },
  })
  h.sessionMemberId = 'guest'
  expect(h.listProjects(SCOPE)).toEqual([])
  expect(h.listDms(SCOPE)).toEqual([])
  expect(h.listMessages({
    ...SCOPE, streamKind: 'dm', ownerId: 'secret', actorId: 'guest', afterSeq: 0, limit: 10,
  })).toEqual({ events: [], nextSeq: 0 })
  expect(() => h.listMemory(SCOPE)).toThrow('forbidden')
})
