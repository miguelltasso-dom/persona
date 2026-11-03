import { looksLikeCredential } from '@deepseek-ai/dsh-persona-core'
import { expect } from 'vitest'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

it('exportDiagnostics is JSON without secrets or message bodies', async () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  h.postMessage({
    id: 'm1', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'segredo sk-ant-api03-ABCDEFGHIJKLMNOPQRST', actorId: 'ana', subjectId: 't',
    occurredAt: '2026-11-03T15:00:00.000Z',
  })
  const { json } = await h.exportDiagnostics()
  const parsed = JSON.parse(json) as { product: string; counts: { events: number } }
  expect(parsed.product).toBe('persona')
  expect(parsed.counts.events).toBeGreaterThan(0)
  expect(json).not.toMatch(/sk-ant/)
  expect(json).not.toMatch(/segredo/)
  expect(looksLikeCredential(json)).toBe(false)
})
