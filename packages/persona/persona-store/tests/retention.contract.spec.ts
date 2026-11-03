import { defineRetentionSuite } from '../../persona-engine/tests/contract/retention.contract.ts'
import { applyRetention } from '@deepseek-ai/dsh-persona-engine'
import { expect, it } from 'vitest'
import { applySqliteRetention, openPersonaStore, SqliteRetention } from '../src/index.ts'

defineRetentionSuite(() => new SqliteRetention(openPersonaStore({ path: ':memory:' })), 'sqlite')

it('VACUUM after a delete and live lists hide archived rows', () => {
  const store = openPersonaStore({ path: ':memory:' })
  const retention = new SqliteRetention(store)
  retention.save({
    id: 'old', kind: 'outbox', createdAt: 0, derivativeIds: [], indexKeys: ['idx:old'],
  })
  retention.save({
    id: 'fresh', kind: 'outbox', createdAt: 10_000, derivativeIds: [], indexKeys: ['idx:fresh'],
  })
  const result = applySqliteRetention(store, {
    windows: [{ kind: 'outbox', archiveAfterMs: 5, deleteAfterMs: 8 }],
  }, 20)
  expect(result.deleted).toContain('old')
  expect(retention.listLive('outbox').map(row => row.id)).toEqual(['fresh'])
  expect(applyRetention(retention, { windows: [{ kind: 'outbox', archiveAfterMs: 5 }] }, 20).archived).toEqual([])
})
