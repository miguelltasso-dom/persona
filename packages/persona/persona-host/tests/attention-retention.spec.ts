import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import PersonaHost from '../src/index.ts'
import { SqliteRetention } from '@deepseek-ai/dsh-persona-store'

const roots: Context[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => root.fiber.dispose())) })

function host(): PersonaHost {
  const ctx = new Context()
  roots.push(ctx)
  return new PersonaHost(ctx)
}

function seed(h: PersonaHost): { workspaceId: string; projectId: string } {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  return { workspaceId: 'ws', projectId: 'pp' }
}

it('exposes attention policy and a baseline stream', async () => {
  const h = host()
  const scope = seed(h)
  const policy = h.putAttentionPolicy({
    ...scope, delivery: 'summary', proposalBudget: 4, quietStart: '22:00', quietEnd: '07:00',
  })
  expect(h.getAttentionPolicy(scope).delivery).toBe('summary')
  expect(policy.proposalBudget).toBe(4)
  const ac = new AbortController()
  const iter = h.attentionEvents(scope, ac.signal)[Symbol.asyncIterator]()
  const first = await iter.next()
  ac.abort()
  expect(first.value?.kind).toBe('baseline')
})

it('archives on tick and logs; delete stays off by default', () => {
  const h = host()
  const scope = seed(h)
  expect(h.getRetentionPolicy(scope).archiveOnly).toBe(true)
  const retention = new SqliteRetention(h.store)
  retention.save({
    id: 'old', kind: 'effect', createdAt: 0, derivativeIds: [], indexKeys: ['idx:old'],
  })
  const rows = h.tickRetention(scope)
  expect(rows.some(item => item.action === 'archived' && item.recordId === 'old')).toBe(true)
  expect(rows.some(item => item.action === 'deleted')).toBe(false)
  expect(h.listRetentionLog(scope).length).toBeGreaterThan(0)
})
