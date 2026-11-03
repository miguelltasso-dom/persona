import { expect } from 'vitest'
import { MutantRunBook } from '../src/mutant-run.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

it('queues the second run on a ticket and refuses a third; subject stays the first', () => {
  const h = host()
  const book = new MutantRunBook(h.screens.screens)
  expect(book.claim('pp', 't1', 'assunto-a', 'm1')).toBe('running')
  expect(book.claim('pp', 't1', 'assunto-b', 'm2')).toBe('queued')
  expect(book.claim('pp', 't1', 'assunto-c', 'm3')).toBe('refused')
  expect(book.subjectOf('pp', 't1')).toBe('assunto-a')
  const next = book.release('pp', 't1')
  expect(next?.status).toBe('running')
  expect(next?.subjectId).toBe('assunto-a')
})

it('keeps coordination replies on the captured subject when a later message uses another', async () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.product.updatePersona({
    ...h.product.getPersona('coord')!,
    systemRoles: ['coordination'],
  }, 'pp')
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  h.postMessage({
    id: 'm1', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 'assunto-a',
    occurredAt: '2026-11-03T15:00:00.000Z',
  })
  const ticket = h.orchestration.runtime('pp').repo.tickets.list()[0]
  expect(ticket).toBeDefined()
  expect(h.orchestration.mutant?.claim('pp', ticket!.id, 'assunto-b', 'm2')).toBe('queued')
  await h.orchestration.flush('pp')
  const page = h.listMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    actorId: 'ana', afterSeq: 0, limit: 50,
  })
  const coord = page.events.filter(item => item.actorId === 'coord')
  expect(coord.length).toBeGreaterThan(0)
  expect(coord.every(item => item.subjectId === 'assunto-a')).toBe(true)
})
