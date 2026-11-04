import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { CHAT_STICKERS } from '../src/stickers.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createMember({
    id: 'bob', workspaceId: 'ws', projectId: 'pp', displayName: 'Bob', handle: 'bob', role: 'member',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'quiet', name: 'Quiet', title: 'Arquivo',
    description: 'Guarda.', personality: 'Calma.', instructions: 'Arquive.',
    avatarKind: 'gallery', avatarRef: 'nina', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.product.updatePersona({
    ...h.product.getPersona('coord')!,
    systemRoles: ['coordination'],
  }, 'pp')
  h.setPersonaTalkAcl({
    ...scope, personaId: 'quiet', mode: 'chosen',
    principals: [{ kind: 'person', id: 'ana', name: 'Ana' }],
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

function post(h: PersonaHost, id: string, body: string): ReturnType<PersonaHost['postMessage']> {
  return h.postMessage({
    id, ...scope, streamKind: 'channel', ownerId: 'geral',
    body, actorId: 'ana', subjectId: id, occurredAt: '2026-11-03T15:00:00.000Z',
  })
}

it('listStickers is the Brush catalog', () => {
  expect(host().listStickers()).toEqual(CHAT_STICKERS.map(item => ({ id: item.id, asset: item.asset })))
})

it('react, reply, pin, edit, delete leave audit', () => {
  const h = host()
  seed(h)
  const first = post(h, 'm1', 'olá equipe')
  const reacted = h.reactToMessage({ ...scope, eventId: first.id, stickerId: 'stamp-aprovado' })
  expect(reacted.reactions[0]?.stickerId).toBe('stamp-aprovado')
  expect(reacted.reactions[0]?.actorIds).toEqual(['ana'])
  const reply = h.replyToMessage({ ...scope, eventId: first.id, body: 'combinado', id: 'm2' })
  expect(reply.replyToId).toBe(first.id)
  const pinned = h.pinMessage({ ...scope, eventId: first.id })
  expect(pinned.pinned).toBe(true)
  expect(h.listPinned({
    ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 10,
  }).map(item => item.id)).toEqual([first.id])
  const edited = h.editMessage({ ...scope, eventId: first.id, body: 'olá equipe (edit)' })
  expect(edited.body).toBe('olá equipe (edit)')
  expect(edited.editedAt).not.toBe('')
  expect(h.deleteMessage({ ...scope, eventId: first.id })).toBe(true)
  expect(h.listMessages({
    ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 50,
  }).events.map(item => item.id)).toEqual([reply.id])
  const audit = h.listMessageAudit({ ...scope, eventId: first.id }).map(row => row.action)
  expect(audit).toEqual(expect.arrayContaining(['react', 'pin', 'edit', 'delete']))
})

it('suggestMentions hides personas the actor cannot address', () => {
  const h = host()
  seed(h)
  h.createProject({ id: 'site', workspaceId: 'ws', name: 'Site', description: '' })
  h.createPersona({
    workspaceId: 'ws', projectId: 'site', id: 'quiet-site', name: 'Quiet', title: 'Arquivo',
    description: 'Guarda.', personality: 'Calma.', instructions: 'Arquive.',
    avatarKind: 'gallery', avatarRef: 'nina', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'site', id: 'open-site', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.setPersonaTalkAcl({
    workspaceId: 'ws', projectId: 'site', personaId: 'quiet-site', mode: 'chosen',
    principals: [{ kind: 'person', id: 'ana', name: 'Ana' }],
  })
  const shared = { workspaceId: 'ws', projectId: 'site' }
  const asOwner = h.suggestMentions({ ...shared, query: '' }).map(item => item.personaId)
  expect(asOwner).toEqual(expect.arrayContaining(['quiet-site', 'open-site']))
  h.sessionMemberId = 'bob'
  const asBob = h.suggestMentions({ ...shared, query: '' }).map(item => item.personaId)
  expect(asBob).toContain('open-site')
  expect(asBob).not.toContain('quiet-site')
})

it('unknown sticker and foreign edit are refused', () => {
  const h = host()
  seed(h)
  const first = post(h, 'm1', 'oi')
  expect(() => h.reactToMessage({ ...scope, eventId: first.id, stickerId: 'nao-existe' })).toThrow(/sticker/)
  h.sessionMemberId = 'bob'
  expect(() => h.editMessage({ ...scope, eventId: first.id, body: 'hack' })).toThrow(/forbidden/)
})
