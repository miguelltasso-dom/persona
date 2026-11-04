import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { SqliteRetention } from '@deepseek-ai/dsh-persona-store'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

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

it('ackAttention stores ids so the next baseline omits them', async () => {
  const h = host()
  const scope = seed(h)
  expect(h.ackAttention({ ...scope, eventIds: ['need:tk-1', 'review:tk-1'] })).toBe(true)
  const ac = new AbortController()
  const iter = h.attentionEvents(scope, ac.signal)[Symbol.asyncIterator]()
  const first = await iter.next()
  ac.abort()
  const events = first.value?.kind === 'baseline' ? first.value.events : []
  expect(events.some((item: { id: string }) => item.id === 'need:tk-1' || item.id === 'review:tk-1')).toBe(false)
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

it('purges a teach recording older than 30 days on retention tick', () => {
  const h = host()
  const scope = seed(h)
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'nina', name: 'Nina', title: 'Executora',
    description: 'Idle.', personality: 'Calma.', instructions: 'Espere.',
    avatarKind: 'gallery', avatarRef: 'nina', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.teach.now = () => '2026-01-01T00:00:00.000Z'
  h.teach.create({
    id: 'rec-old', workspaceId: 'ws', projectId: 'pp', personaId: 'nina',
    filename: 'velha.webm',
  })
  const rows = h.tickRetention(scope)
  expect(rows.some(item => item.action === 'deleted' && item.recordId === 'rec-old')).toBe(true)
  expect(h.teach.get('rec-old')).toBeUndefined()
})
