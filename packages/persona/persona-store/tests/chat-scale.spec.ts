import { expect, it } from 'vitest'
import { EventRepos, ProductRepos, seedScaleWorkspace, SCALE, openTempStore } from '../src/index.ts'

it('v12 chat columns: reply, edit, react, pin, audit', async () => {
  const handle = await openTempStore()
  try {
    const product = new ProductRepos(handle.store, () => '2026-11-03T15:00:00.000Z')
    product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
    product.createMember({ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' })
    product.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
    const events = new EventRepos(handle.store, () => '2026-11-03T15:00:00.000Z')
    const first = events.append({
      id: 'm1', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
      type: 'message', body: 'oi', actorId: 'ana', subjectId: 'm1', occurredAt: '2026-11-03T15:00:00.000Z',
    })
    const reply = events.append({
      id: 'm2', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
      type: 'message', body: 'ok', actorId: 'ana', subjectId: 'm1', occurredAt: '2026-11-03T15:00:01.000Z',
      replyToId: first.id,
    })
    expect(reply.replyToId).toBe('m1')
    events.edit(first.id, 'oi (edit)', '2026-11-03T15:01:00.000Z')
    expect(events.get(first.id)?.editedAt).toBe('2026-11-03T15:01:00.000Z')
    events.addReaction({ eventId: first.id, actorId: 'ana', stickerId: 'stamp-aprovado', projectId: 'pp' })
    expect(events.listReactions(first.id)).toEqual([{ stickerId: 'stamp-aprovado', actorId: 'ana' }])
    events.pin({ streamId: first.streamId, eventId: first.id, projectId: 'pp', pinnedBy: 'ana' })
    expect(events.isPinned(first.id)).toBe(true)
    events.addAudit({
      id: 'a1', eventId: first.id, projectId: 'pp', actorId: 'ana', action: 'edit', detail: 'oi (edit)',
    })
    expect(events.listAudit(first.id)[0]?.action).toBe('edit')
    expect(handle.store.checkpointWal()).toEqual({ busy: 0, log: 0, checkpointed: 0 })
  } finally {
    await handle.dispose()
  }
})

it('scale seed writes the asked counts on a file store', async () => {
  const handle = await openTempStore()
  try {
    seedScaleWorkspace(handle.store)
    const messages = handle.store.db.prepare('SELECT COUNT(*) AS n FROM event').get() as { n: number }
    const tickets = handle.store.db.prepare('SELECT COUNT(*) AS n FROM engine_ticket').get() as { n: number }
    const personas = handle.store.db.prepare('SELECT COUNT(*) AS n FROM persona').get() as { n: number }
    const projects = handle.store.db.prepare('SELECT COUNT(*) AS n FROM project').get() as { n: number }
    expect(messages.n).toBe(SCALE.messages)
    expect(tickets.n).toBe(SCALE.tasks)
    expect(personas.n).toBe(SCALE.personas)
    expect(projects.n).toBe(SCALE.projects)
    const ck = handle.store.checkpointWal()
    expect(ck.busy).toBe(0)
  } finally {
    await handle.dispose()
  }
})
