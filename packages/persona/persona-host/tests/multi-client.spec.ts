import { expect } from 'vitest'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' } as const

function seed() {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite pedidos claros.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  return h
}

async function takeUpserts(
  stream: AsyncIterable<{ kind: string; events: ReadonlyArray<{ id: string }> }>,
  signal: AbortController,
  count: number,
): Promise<string[]> {
  const ids: string[] = []
  for await (const frame of stream) {
    if (frame.kind === 'upsert') {
      for (const event of frame.events) ids.push(event.id)
      if (ids.length >= count) {
        signal.abort()
        break
      }
    }
  }
  return ids
}

it('two clients on one workspace converge messages and board without duplicates', async () => {
  const h = seed()
  const desktop = new AbortController()
  const browser = new AbortController()
  const req = {
    ...scope, streamKind: 'channel' as const, ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 50,
  }
  const desktopFollow = h.followMessages(req, desktop.signal)
  const browserFollow = h.followMessages(req, browser.signal)
  const desktopWait = takeUpserts(desktopFollow, desktop, 1)
  const browserWait = takeUpserts(browserFollow, browser, 1)
  await new Promise(resolve => setTimeout(resolve, 40))
  h.postMessage({
    id: 'm-shared', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: 'preciso de um readme', actorId: 'ana', subjectId: 't',
    occurredAt: '2026-11-03T20:00:00.000Z',
  })
  const [deskIds, webIds] = await Promise.all([desktopWait, browserWait])
  expect(deskIds).toEqual(['m-shared'])
  expect(webIds).toEqual(['m-shared'])
  const listed = h.listMessages(req).events.filter(item => item.id === 'm-shared')
  expect(listed).toHaveLength(1)
  await h.orchestration.flush(scope.projectId)
  const boardA = h.getProjectBoard(scope)
  const boardB = h.getProjectBoard(scope)
  expect(boardA.cards.map(card => card.ticketId).sort()).toEqual(boardB.cards.map(card => card.ticketId).sort())
  const ids = boardA.cards.map(card => card.ticketId)
  expect(new Set(ids).size).toBe(ids.length)
})
