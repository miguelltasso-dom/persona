/**
 * HT-6 / D-084 (contracts/harness-tools.md §2-F): "aposentar" — the undo of a direct hire, and a choice of the person. A retired persona leaves
 * the team, her history stays, her name and face are free again, and `resumePersona` brings her back. Owner only; never the Coordenação.
 */
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { GALLERY_ANIMALS } from '../src/hire-identity.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

function open(): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
    { id: 'teo', name: 'Teo', title: 'Arte' },
  ])
  h.createMember({ id: 'bob', ...SCOPE, displayName: 'Bob', handle: 'bob', role: 'member' })
  h.sessionMemberId = 'ana'
  return h
}

const ids = (h: PersonaHost): string[] => h.listPersonas(SCOPE).map(row => row.id).sort()

it('retired: she is not on the team any more, the history still names her, and she is listed apart', () => {
  const h = open()
  h.postMessage({ id: 'm1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: 'oi, @Bia', actorId: 'ana', subjectId: 'm1' })
  h.events.append({ id: 'bia-says', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message', body: 'Olá!', actorId: 'bia', subjectId: 'm1', occurredAt: '2026-11-05T12:00:00.000Z' })
  const done = h.retirePersona({ ...SCOPE, personaId: 'bia' })
  expect(done.personaId).toBe('bia')
  expect(done.retiredAt).toMatch(/^\d{4}-/u)
  expect(ids(h)).toEqual(['guia', 'teo'])
  expect(h.listTeam(SCOPE).personas.map(row => row.id).sort()).toEqual(['guia', 'teo'])
  expect(h.listRetiredPersonas(SCOPE).map(row => row.id)).toEqual(['bia'])
  expect(h.listRetiredPersonas(SCOPE)[0]?.retiredAt).toBe(done.retiredAt)
  // what she wrote is still there, and her record still resolves her name for it
  expect(h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 50 }).events.some(row => row.id === 'bia-says')).toBe(true)
  expect(h.product.getPersona('bia')?.name).toBe('Bia')
})

it('her name and face are free again: a new persona may take them', () => {
  const h = open()
  const face = h.listPersonas(SCOPE).find(row => row.id === 'bia')?.avatarRef ?? ''
  expect(GALLERY_ANIMALS).toContain(face)
  h.retirePersona({ ...SCOPE, personaId: 'bia' })
  const again = h.createPersona({
    id: 'bia2', ...SCOPE, name: 'Bia', title: 'Redação', description: 'Escreve.', personality: 'Clara.', instructions: 'Ajude.',
    avatarKind: 'gallery', avatarRef: face, runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  expect(again.avatarRef).toBe(face)
  expect(h.listPersonas(SCOPE).filter(row => row.name === 'Bia')).toHaveLength(1) // one Bia on the team
})

it('idempotent, reversible by resumePersona, and the card still opens', () => {
  const h = open()
  const first = h.retirePersona({ ...SCOPE, personaId: 'teo' })
  expect(h.retirePersona({ ...SCOPE, personaId: 'teo' })).toEqual(first) // the same instant: nothing was done twice
  const card = h.resumePersona({ ...SCOPE, personaId: 'teo' })
  expect(card.personaId).toBe('teo')
  expect(ids(h)).toEqual(['bia', 'guia', 'teo'])
  expect(h.listRetiredPersonas(SCOPE)).toEqual([])
})

it('the Coordenação cannot be retired; only the workspace owner retires; a stranger id is not found', () => {
  const h = open()
  expect(() => h.retirePersona({ ...SCOPE, personaId: 'guia' })).toThrow(/Coordenação não pode ser aposentada/iu)
  expect(() => h.retirePersona({ ...SCOPE, personaId: 'ghost' })).toThrow(/não existe mais/iu)
  h.sessionMemberId = 'bob'
  expect(() => h.retirePersona({ ...SCOPE, personaId: 'bia' })).toThrow('forbidden')
  h.sessionMemberId = 'ana'
  expect(ids(h)).toEqual(['bia', 'guia', 'teo']) // nothing changed
})

it('a retired persona is never woken: a mention does not reach her and the routing ignores her', async () => {
  const h = open()
  h.retirePersona({ ...SCOPE, personaId: 'bia' })
  const before = h.orchestration.runtime('pp').repo.tickets.list().length
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Bia escreva o texto da campanha', actorId: 'ana', subjectId: 'u1' })
  await h.orchestration.flush('pp')
  const tasks = h.orchestration.runtime('pp').repo.tickets.list().slice(before)
  expect(tasks.some(ticket => ticket.execution?.name === 'Bia')).toBe(false)
})
